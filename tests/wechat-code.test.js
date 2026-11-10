const test=require('node:test');const assert=require('node:assert/strict');
test('server QR requires secret, obtains token and never returns token to caller',async()=>{
 const {generateCode}=require('../cloudfunctions/admin-api/wechat-code');const previous=process.env.WECHAT_APP_SECRET;
 try{delete process.env.WECHAT_APP_SECRET;await assert.rejects(generateCode('scene'),{code:'WECHAT_CONFIG_REQUIRED'});process.env.WECHAT_APP_SECRET='test-only';const calls=[];const request=async(path,data)=>{calls.push({path,data});return path==='/cgi-bin/stable_token'?{buffer:Buffer.from(JSON.stringify({access_token:'test-token',expires_in:7200}))}:{type:'image/png',buffer:Buffer.from('image')};};const result=await generateCode('scene',request);assert.equal(result.buffer.toString(),'image');assert.equal(calls[0].data.appid,'wxe1a773261a11fb90');assert.equal(calls[1].data.check_path,false);assert.equal(calls[1].data.env_version,'trial');assert.equal(result.token,undefined);}finally{if(previous===undefined)delete process.env.WECHAT_APP_SECRET;else process.env.WECHAT_APP_SECRET=previous;}
});

test('teacher referral QR defaults to release independently of trial login config',async()=>{
 const keys=['WECHAT_APP_SECRET','WECHAT_LOGIN_ENV_VERSION','WECHAT_REFERRAL_ENV_VERSION'];
 const previous=keys.map(k=>process.env[k]);
 try {
  process.env.WECHAT_APP_SECRET='test-only';process.env.WECHAT_LOGIN_ENV_VERSION='trial';delete process.env.WECHAT_REFERRAL_ENV_VERSION;
  const calls=[];
  const request=async(path,data)=>{calls.push({path,data});return path==='/cgi-bin/stable_token'?{buffer:Buffer.from(JSON.stringify({access_token:'test-token',expires_in:7200}))}:{type:'image/png',buffer:Buffer.from('image')};};
  await require('../cloudfunctions/admin-api/wechat-code').generateCode('teacher-scene',request,'pages/referral/referral');
  const qr=calls.find(c=>c.path.startsWith('/wxa/')).data;
  assert.equal(qr.env_version,'release');assert.equal(qr.check_path,true);assert.equal(qr.scene,'teacher-scene');assert.equal(qr.page,'pages/referral/referral');
 } finally {keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
