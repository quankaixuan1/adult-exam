const api=require('../../services/api');
Page({
 data:{registration:null,complete:false},
 onLoad(){const registration=wx.getStorageSync('demoPaymentPreview');if(!registration)wx.reLaunch({url:'/pages/index/index'});else this.setData({registration});},
 finish(){this.setData({complete:true});wx.removeStorageSync('registrationFormDraft');},
 home(){wx.reLaunch({url:'/pages/index/index'});}
 ,async restart(){await api.resetDemo();wx.reLaunch({url:'/pages/index/index'});}
});
