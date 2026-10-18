const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {SQLiteRepository}=require('../repositories/sqlite');
const {createApp}=require('../local-server/app');
const {createAuthService}=require('../core/auth');
const {createService}=require('../core/registration');
const {createWechatProvider}=require('../providers/wechat');
const {loadWechatConfig}=require('../local-server/config');
const appId='wx0123456789abcdef';
const data={name:'模拟考生',phone:'13800000000',programId:'demo-a-edu',consent:true};
const provider={configured:true,async exchange(code){return {appId,openId:'wechat_'+code.split('-')[0]};}};
async function fixture(t,options={}) {
 const repo=new SQLiteRepository(':memory:',randomBytes(32));
 const app=createApp(repo,{wechat:provider,...options});
 const server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));repo.close();});
 const url='http://127.0.0.1:'+server.address().port;
 const request=async(p,method='GET',body,token)=>{
  const response=await fetch(url+p,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,headers:response.headers,body:await response.json()};
 };
 const login=async(code='alice-1')=>(await request('/api/auth/wechat','POST',{code})).body;
 return {repo,request,login,url};
}
test('same WeChat account remains stable, distinct users isolated, client identity ignored',async t=>{
 const {repo,request,login}=await fixture(t);
 const alice=await login(),again=await login('alice-2'),bob=await login('bob-1');
 assert.equal(alice.student.id,again.student.id);assert.notEqual(alice.token,again.token);assert.notEqual(alice.student.id,bob.student.id);
 const forged=(await request('/api/auth/wechat','POST',{code:'bob-2',openid:'wechat_alice',studentId:alice.student.id,role:'admin'})).body;
 assert.equal(forged.student.id,bob.student.id);
 assert.equal(repo.db.prepare('SELECT count(*) AS n FROM students').get().n,2);
 const saved=await request('/api/registrations','POST',{...data,studentId:bob.student.id,status:'approved'},alice.token);
 assert.equal(saved.status,201);assert.equal(saved.body.registration.status,'pending');
 const retry=await request('/api/registrations','POST',{...data,programId:'demo-b-pre'},again.token);
 assert.equal(retry.body.registration.id,saved.body.registration.id);assert.equal(retry.body.registration.major,'教育学');
 const empty=await request('/api/me/registration?studentId='+alice.student.id,'GET',undefined,bob.token);
 assert.equal(empty.body.registration,null);
 assert.equal((await request('/api/me/registration','PATCH',{phone:'13900000000',programId:'demo-b-pre',consent:true,revision:1},bob.token)).status,404);
 assert.equal((await request('/api/registrations/'+saved.body.registration.id,'GET',undefined,bob.token)).status,404);
 assert.equal((await request('/api/admin/registrations','GET',undefined,bob.token)).status,404);
 assert.equal((await request('/api/me/registration','GET',undefined,alice.token)).body.registration.name,data.name);
 const row=repo.db.prepare('SELECT * FROM registrations').get();assert.equal(row.student_id,alice.student.id);
 assert.ok(!JSON.stringify(row).includes(data.phone));assert.ok(!JSON.stringify(row).includes(data.name));
 const identity=repo.db.prepare('SELECT * FROM wechat_identities LIMIT 1').get();assert.ok(!JSON.stringify(identity).includes('wechat_alice'));
 assert.ok(!JSON.stringify(repo.db.prepare('SELECT * FROM sessions').all()).includes(alice.token));
 assert.equal(saved.headers.get('cache-control'),'no-store');
});
test('authentication required, forged and legacy tokens rejected, logout revoked immediately, expiry enforced',async t=>{
 let now=Date.parse('2026-10-12T00:00:00Z');
 const {request,login}=await fixture(t,{now:()=>now});
 for(const token of [undefined,'wxs_'+randomBytes(32).toString('hex'),randomBytes(32).toString('hex')]){
  assert.equal((await request('/api/me','GET',undefined,token)).status,401);
  assert.equal((await request('/api/me/registration','GET',undefined,token)).status,401);
  assert.equal((await request('/api/registrations','POST',data,token)).status,401);
  assert.equal((await request('/api/me/registration','PATCH',{},token)).status,401);
 }
 const alice=await login();
 assert.equal((await request('/api/auth/logout','POST',{},alice.token)).status,200);
 assert.equal((await request('/api/me','GET',undefined,alice.token)).status,401);
 const next=await login('alice-2');now+=7*24*60*60*1000;
 assert.equal((await request('/api/me','GET',undefined,next.token)).status,401);
 assert.equal((await login('alice-3')).student.id,alice.student.id);
});
test('field validation, immutable name/owner, edits reset review and stale edits fail',async t=>{
 const {repo,request,login}=await fixture(t);const {token}=await login();
 for(const body of [null,[],{...data,phone:'123'},{...data,consent:false},{...data,name:' '},{...data,programId:'fake'}])assert.equal((await request('/api/registrations','POST',body,token)).status,400);
 const created=(await request('/api/registrations','POST',data,token)).body.registration;
 const update={phone:'13900000000',programId:'demo-b-pre',consent:true,revision:1};
 for(const key of ['name','studentId','status','id'])assert.equal((await request('/api/me/registration','PATCH',{...update,[key]:'fake'},token)).status,400);
 repo.db.prepare("UPDATE registrations SET status='approved' WHERE id=?").run(created.id);
 const changed=await request('/api/me/registration','PATCH',update,token);
 assert.equal(changed.status,200);assert.equal(changed.body.registration.status,'pending');assert.equal(changed.body.registration.revision,2);assert.equal(changed.body.registration.name,data.name);
 assert.equal((await request('/api/me/registration','PATCH',update,token)).status,409);
 const audit=repo.db.prepare('SELECT * FROM audit_events').all();assert.equal(audit.length,3);assert.ok(!JSON.stringify(audit).includes(data.phone));
});
test('missing credentials fail closed; invalid requests and browser Origin rejected',async t=>{
 const {request,url,repo}=await fixture(t,{wechat:createWechatProvider({})});
 assert.equal((await request('/api/auth/config')).body.wechatReady,false);
 assert.equal((await request('/api/auth/wechat','POST',{code:'valid-code'})).status,503);
 for(const body of [{openid:'forged'},{code:''},{code:123},{code:'x'.repeat(257)}])assert.equal((await request('/api/auth/wechat','POST',body)).status,400);
 assert.equal(repo.db.prepare('SELECT count(*) AS n FROM students').get().n,0);
 assert.equal((await fetch(url+'/api/auth/wechat',{method:'POST',headers:{Origin:'https://example.com'}})).status,403);
 assert.equal((await fetch(url+'/api/auth/wechat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
 assert.equal((await request('/api/auth/wechat','POST',{code:'x'.repeat(9000)})).status,413);
 assert.equal((await request('/api/drafts','POST',{})).status,410);
});
test('login rate limited independently from read APIs',async t=>{
 const {request,login}=await fixture(t);
 for(let i=0;i<20;i++)await login('alice-'+i);
 assert.equal((await request('/api/auth/wechat','POST',{code:'alice-21'})).status,429);
 assert.equal((await request('/api/health')).status,200);
 for(let i=0;i<120;i++)await request('/api/health');
 assert.equal((await request('/api/health')).status,429);
});
test('v1 migration preserves encrypted rows and status lookup without auto-binding; restart retains ownership',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-migration-'));const file=path.join(dir,'test.db');const key=randomBytes(32);
 const legacyToken=randomBytes(32).toString('hex'),legacyHash=createHash('sha256').update(legacyToken).digest('hex');
 let repo;
 try{
  const old=new DatabaseSync(file);
  old.exec("CREATE TABLE registrations(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,private_payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,consent_version TEXT NOT NULL); PRAGMA user_version=1;");
  old.prepare('INSERT INTO registrations VALUES(?,?,?,?,?,?)').run('legacy-id',legacyHash,'unchanged-encrypted-payload','pending','2026-10-12','local-v1');old.close();
  repo=new SQLiteRepository(file,key);
  const service=createService(repo),auth=createAuthService(repo,provider);
  assert.deepEqual({...await service.legacyStatus(legacyToken)},{id:'legacy-id',status:'pending',createdAt:'2026-10-12'});
  const {student,token}=await auth.login({code:'alice-1'});
  assert.equal(await service.mine(student),null);
  const responses=await Promise.all(Array.from({length:5},()=>service.register(data,student)));
  assert.equal(new Set(responses.map(x=>x.id)).size,1);
  const boundHash=repo.db.prepare('SELECT token_hash FROM registrations WHERE student_id=?').get(student.id).token_hash;
  assert.equal(await repo.findLegacyStatus(boundHash),null);
  assert.equal(repo.db.prepare("SELECT private_payload FROM registrations WHERE id='legacy-id'").get().private_payload,'unchanged-encrypted-payload');
  repo.close();repo=new SQLiteRepository(file,key);
  const same=await createAuthService(repo,provider).login({code:'alice-2'});
  assert.equal(same.student.id,student.id);
  assert.equal((await createAuthService(repo,provider).authenticate(token)).id,student.id);
 assert.equal((await createService(repo).mine(student)).name,data.name);
  assert.equal(repo.db.prepare('PRAGMA user_version').get().user_version,2);
 }finally{if(repo)repo.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('wechat adapter exchanges only via fixed HTTPS endpoint and never returns upstream secrets',async()=>{
 const secret='a'.repeat(32);
 const wechat=createWechatProvider({appId,appSecret:secret,fetchImpl:async(url,options)=>{
  assert.equal(url.origin,'https://api.weixin.qq.com');assert.equal(url.pathname,'/sns/jscode2session');
  assert.equal(url.searchParams.get('appid'),appId);assert.equal(url.searchParams.get('secret'),secret);assert.equal(url.searchParams.get('js_code'),'testcode');assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({openid:'fake_openid',session_key:'not-for-client',unionid:'unused'})};
 }});
 assert.deepEqual(await wechat.exchange('testcode'),{appId,openId:'fake_openid'});
 for(const [payload,status] of [[{errcode:40029,errmsg:secret},401],[{errcode:40163},401],[{errcode:45011},429],[{errcode:40013},502],[{},502],[null,502]]){
  const bad=createWechatProvider({appId,appSecret:secret,fetchImpl:async()=>({ok:true,json:async()=>payload})});
  await assert.rejects(bad.exchange('code'),e=>e.status===status && !e.message.includes(secret));
 }
 const network=createWechatProvider({appId,appSecret:secret,fetchImpl:async()=>{throw new Error(secret);}});
 await assert.rejects(network.exchange('code'),e=>e.status===502 && !e.message.includes(secret));
});
test('local secret configuration stays server-side and rejects mismatched app id',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wechat-config-'));
 try{
  fs.mkdirSync(path.join(dir,'.private'));fs.writeFileSync(path.join(dir,'project.config.json'),JSON.stringify({appid:appId}));
  assert.deepEqual(loadWechatConfig(dir,{}),{appId,appSecret:''});
  fs.writeFileSync(path.join(dir,'.private/wechat.env'),'WECHAT_APP_SECRET='+ 'b'.repeat(32));
  assert.equal(loadWechatConfig(dir,{}).appSecret,'b'.repeat(32));
  assert.throws(()=>loadWechatConfig(dir,{WECHAT_APP_ID:'wx0000000000000000'}),/不一致/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
