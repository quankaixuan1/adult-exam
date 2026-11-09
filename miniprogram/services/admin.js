const KEY = 'teacherSession';
async function call(action, data = {}) {
 const response = await wx.cloud.callFunction({name:'admin-api',data:{action,data:{...data,token:wx.getStorageSync(KEY)}}});
 const result = response.result;
 if (!result || !result.ok) { const e = new Error(result?.message || '管理服务暂时不可用'); e.code=result?.code; if(e.code==='LOGIN_REQUIRED') {wx.removeStorageSync(KEY);wx.reLaunch({url:'/pages/index/index'});} throw e; }
 return result.data;
}
async function identity(action='wechatLogin', data={}) { const result=await call(action,data); if(result.token) wx.setStorageSync(KEY,result.token); else wx.removeStorageSync(KEY); return result; }
module.exports={call,identity,async logout(){await call('logout');wx.removeStorageSync(KEY);wx.reLaunch({url:'/pages/index/index'});}};
