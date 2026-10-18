const api=require('../../services/api');
Page({
 data:{token:'',result:null,error:'',busy:false},
 onLoad(){this.setData({token:wx.getStorageSync('registrationToken') || wx.getStorageSync('registrationDraftToken') || ''});},
 input(e){this.setData({token:e.detail.value.trim(),result:null,error:''});},
 async query(){if(this.data.busy)return;this.setData({busy:true,error:'',result:null});try{const result=await api.status(this.data.token);this.setData({result:{...result,statusText:({pending:'待审核',approved:'已通过',rejected:'需补充材料'})[result.status] || '处理中'}});}catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}},
 clear(){wx.removeStorageSync('registrationToken');wx.removeStorageSync('registrationDraftToken');this.setData({token:'',result:null,error:''});}
});
