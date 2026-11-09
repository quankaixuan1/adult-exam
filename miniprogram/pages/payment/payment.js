Page({
 onShareAppMessage(){return {title:'成人高考报名',path:'/pages/index/index'};},
  account() { wx.redirectTo({ url: '/pages/my/my' }); },
  materials() { wx.navigateTo({ url: '/pages/materials/materials' }); }
});
