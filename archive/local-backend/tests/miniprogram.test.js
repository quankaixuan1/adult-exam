const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../../miniprogram/services/api.js'),'utf8');
function client() {
 const storage=new Map(),requests=[];let identity='alice',number=0,failLogin=false;
 const tokens=new Map();
 const wx={
  getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),
  login(options){queueMicrotask(()=>failLogin ? options.fail() : options.success({code:identity+'-'+(++number)}));},
  request(options){
   requests.push(options);
   queueMicrotask(()=>{
    if(options.url.endsWith('/auth/wechat')){
     const id=options.data.code.split('-')[0];const token='wxs_'+String(number).padStart(64,'0');tokens.set(token,id);
     options.success({statusCode:200,data:{student:{id},token,expiresAt:new Date(Date.now()+3600000).toISOString()}});
    }else if(options.url.endsWith('/auth/logout')){tokens.delete(options.header.Authorization.slice(7));options.success({statusCode:200,data:{ok:true}});}
    else {const token=options.header.Authorization?.slice(7);options.success(tokens.has(token)?{statusCode:200,data:{student:{id:tokens.get(token)}}}:{statusCode:401,data:{code:'LOGIN_REQUIRED',message:'请重新登录'}});}
   });
  }
 };
 const context={module:{exports:{}},wx,Promise,Error,Date};vm.runInNewContext(source,context);
 return {api:context.module.exports,storage,requests,tokens,setIdentity:value=>identity=value,setFailure:value=>failLogin=value};
}
test('mini program login deduplicates requests, passes only code, resumes current WeChat identity',async()=>{
 const c=client();await assert.rejects(c.api.resume(),e=>e.code==='LOGIN_REQUIRED');
 const [a,b]=await Promise.all([c.api.login(),c.api.login()]);assert.equal(a.id,'alice');assert.equal(b.id,'alice');
 assert.equal(c.requests.length,1);assert.deepEqual(Object.keys(c.requests[0].data),['code']);
 const cached=c.storage.get('wechatStudentSession');assert.deepEqual(Object.keys(cached).sort(),['expiresAt','studentId','token']);
 assert.ok(!c.requests[0].header.Authorization);
 c.setIdentity('bob');assert.equal((await c.api.resume()).id,'bob');
 const before=c.requests.length;await assert.rejects(c.api.register({name:'old alice form'},'alice'),e=>e.code==='LOGIN_REQUIRED');assert.equal(c.requests.length,before);
 assert.equal((await c.api.me()).student.id,'bob');
 await c.api.logout();assert.equal(c.api.hasSession(),false);assert.equal(c.tokens.has(cached.token),true); // Older device session stays until expiry by design.
});
test('mini program login failure does not create account session, server 401 clears current token',async()=>{
 const c=client();c.setFailure(true);await assert.rejects(c.api.login(),/微信登录未完成/);assert.equal(c.storage.size,0);assert.equal(c.requests.length,0);
 c.setFailure(false);await c.api.login();c.tokens.clear();await assert.rejects(c.api.me(),e=>e.code==='LOGIN_REQUIRED');assert.equal(c.api.hasSession(),false);
});
test('mini program expired session is never sent',async()=>{
 const c=client();c.storage.set('wechatStudentSession',{token:'wxs_'+'a'.repeat(64),expiresAt:'2000-01-01T00:00:00Z',studentId:'alice'});
 await assert.rejects(c.api.mine(),e=>e.code==='LOGIN_REQUIRED');assert.equal(c.requests.length,0);
});
