const admin = require('../../services/admin');
const student = require('../../services/api');
Page({
  data: { busy: false, error: '' },
  async goMine() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const result = await admin.identity('wechatLogin');
      if (result.role === 'teacher') wx.reLaunch({ url: '/pages/admin/admin' });
      else {
        await student.login();
        wx.navigateTo({ url: '/pages/my/my' });
      }
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ busy: false }); }
  },
  onShareAppMessage() {
    return { title: '成人高考报名', path: '/pages/index/index' };
  },
  goLogin() {
    if (this.openingLogin) return;
    this.openingLogin = true;
    wx.navigateTo({
      url: '/pages/login/login',
      complete: () => { this.openingLogin = false; }
    });
  }
});
