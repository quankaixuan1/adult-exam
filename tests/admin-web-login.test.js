const test = require('node:test');
const assert = require('node:assert/strict');
const factory = require('../cloudfunctions/admin-api/web-login');
const {createHash}=require('node:crypto');
function setup(){
 const records=new Map(), bindings=new Map();
 const admin={_id:'teacher',createdAt:'original',sessionVersion:1};
 const identity={OPENID:'wx',APPID:'wxe1a773261a11fb90'};
 const bindingId=createHash('sha256').update(`wechat-admin:${identity.APPID}:${identity.OPENID}`).digest('hex');
 bindings.set(bindingId,{adminId:admin._id,accountCreatedAt:admin.createdAt});
 const db={collection(name){const m=name==='admin_web_logins'?records:bindings;return {async add({data}){m.set(data._id,data);},doc(id){return {async get(){return {data:m.get(id)};},async update({data}){Object.assign(m.get(id),data);}};}};}};
 class ApiError extends Error{constructor(m,c){super(m);this.code=c;}}
 const call=factory({qrGenerator:async()=>({buffer:Buffer.from('image')}),db,cloud:{getWXContext:()=>identity,openapi:options=>{assert.equal(options.appid,'wxe1a773261a11fb90');return {wxacode:{getUnlimited:async()=>({buffer:Buffer.from('image')})}};}},ApiError,withTransaction:async(db,fn)=>fn(db),adminDocument:async()=>admin,createSession:async()=>({token:'secret-session'})});
 return {call,admin,records,bindings,identity};
}
test('QR requires explicit teacher confirmation and browser secret; consumed once',async()=>{
 const x=setup();const q=await x.call('createWebLogin',{});
 assert.equal((await x.call('pollWebLogin',q)).status,'pending');
 await assert.rejects(x.call('pollWebLogin',{id:q.id,secret:'wrong'}));
 await x.call('confirmWebLogin',{id:q.id});
 const result=await x.call('pollWebLogin',q);assert.equal(result.token,'secret-session');
 await assert.rejects(x.call('pollWebLogin',q));await assert.rejects(x.call('confirmWebLogin',{id:q.id}));
});
test('reject expired, unbound, disabled, foreign app and revoked accounts',async()=>{
 for(const kind of ['expired','unbound','disabled','foreign','revoked']){
  const x=setup();const q=await x.call('createWebLogin',{});
  if(kind==='expired')x.records.get(q.id).expiresAt=0;
  if(kind==='unbound')x.bindings.clear();
  if(kind==='disabled')x.admin.disabled=true;
  if(kind==='foreign')x.identity.APPID='other';
  if(kind==='revoked'){await x.call('confirmWebLogin',{id:q.id});x.admin.sessionVersion++;await assert.rejects(x.call('pollWebLogin',q));}
  else await assert.rejects(x.call('confirmWebLogin',{id:q.id}));
 }
});
