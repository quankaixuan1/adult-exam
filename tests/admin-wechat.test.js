const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
function setup(){
 const stores={admins:new Map(),admin_wechat_bindings:new Map(),admin_sessions:new Map(),audit_logs:new Map()};
 const db={command:{},collection(name){const m=stores[name];return {doc(id){return {async get(){return {data:m.get(id)};},async update({data}){Object.assign(m.get(id),data);},async remove(){m.delete(id);}};},async add({data}){const id=data._id||crypto.randomUUID();if(m.has(id))throw Error('duplicate');m.set(id,{...data,_id:id});}};}};
 const identity={OPENID:'teacher',APPID:'wxe1a773261a11fb90'};
 const cloud={init(){},database:()=>db,getWXContext:()=>identity};
 const dir=require('node:path').resolve(__dirname,'../cloudfunctions/admin-api');
 const context={exports:{},Buffer,console:{error(){}},process,require:n=>n==='wx-server-sdk'?cloud:n.startsWith('./')?require(dir+'/'+n):require(n)};
 vm.runInNewContext(fs.readFileSync(dir+'/index.js','utf8'),context);
 const salt='test-salt';stores.admins.set('primary',{_id:'primary',username:'boss',passwordSalt:salt,passwordHash:crypto.scryptSync('secure-password',salt,64).toString('hex'),createdAt:'original'});
 return {stores,identity,call:(action,data={})=>context.exports.main({action,data})};
}
test('unbound WeChat is student; credentials required to bind; subsequent login inherits account',async()=>{
 const x=setup();assert.equal((await x.call('wechatLogin')).data.role,'student');
 assert.equal((await x.call('bindWechat',{username:'boss',password:'incorrect-password'})).ok,false);
 assert.equal(x.stores.admin_wechat_bindings.size,0);
 const bound=await x.call('bindWechat',{username:'boss',password:'secure-password'});assert.equal(bound.data.role,'teacher');assert.equal(bound.data.admin.role,'super');
 assert.equal((await x.call('wechatLogin')).data.role,'teacher');
 x.stores.admins.get('primary').disabled=true;assert.equal((await x.call('wechatLogin')).code,'FORBIDDEN');
});
test('reject forged client identity, missing cloud identity and recreated accounts',async()=>{
 const x=setup();x.identity.OPENID='';assert.equal((await x.call('wechatLogin',{OPENID:'teacher'})).code,'LOGIN_REQUIRED');
 x.identity.OPENID='teacher';x.identity.APPID='other';assert.equal((await x.call('wechatLogin')).code,'LOGIN_REQUIRED');
 x.identity.APPID='wxe1a773261a11fb90';await x.call('bindWechat',{username:'boss',password:'secure-password'});
 x.stores.admins.get('primary').createdAt='recreated';assert.equal((await x.call('wechatLogin')).code,'FORBIDDEN');
});
test('homepage routes teacher to admin and student to existing registration flow',async()=>{
 for(const role of ['teacher','student']){
  let page,studentLogins=0;const routes=[];
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../miniprogram/pages/index/index.js'),'utf8'),{Page:p=>page=p,require:n=>n.endsWith('/admin')?{identity:async()=>({role})}:{login:async()=>studentLogins++},wx:{reLaunch:x=>routes.push(x.url),navigateTo:x=>routes.push(x.url)}});
  page.setData=updates=>Object.assign(page.data,updates);
  await page.goMine();assert.equal(routes[0],role==='teacher'?'/pages/admin/admin':'/pages/my/my');assert.equal(studentLogins,role==='student'?1:0);assert.equal(page.data.busy,false);
 }
});
test('identity lookup failure never falls back to a student login',async()=>{
 let page;vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../miniprogram/pages/index/index.js'),'utf8'),{Page:p=>page=p,require:n=>n.endsWith('/admin')?{identity:async()=>{throw Error('offline');}}:{login:async()=>assert.fail('unexpected student login')},wx:{}});
 page.setData=updates=>Object.assign(page.data,updates);await page.goMine();assert.equal(page.data.error,'offline');assert.equal(page.data.busy,false);
});
