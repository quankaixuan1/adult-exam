App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '微信版本过低',
        content: '请升级微信后重新打开小程序。',
        showCancel: false
      });
      return;
    }
    wx.cloud.init({
      env: 'cloud1-d2gcxozkl4c789619',
      traceUser: true
    });
  }
});
