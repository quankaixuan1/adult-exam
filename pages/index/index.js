// index.js
Page({
  data: {},

  goRegister() {
    wx.navigateTo({
      url: '/pages/register/register'
    });
  },

  goSearch() {
    wx.navigateTo({
      url: '/pages/search/search'
    });
  },

  goStatus() {
    wx.navigateTo({
      url: '/pages/status/status'
    });
  }
});
