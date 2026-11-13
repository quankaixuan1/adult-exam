const api = require('../../services/api');
Page({
  onShareAppMessage() {
    return {
      title: '成人高考报名',
      path: '/pages/referral/referral?scene=' + encodeURIComponent(this.referralScene || '')
    };
  },
  data: {
    loading: true,
    busy: false,
    error: '',
    referral: null
  },
  async onLoad(query) {
    this.referralScene = decodeURIComponent(query.scene || '');
    try {
      const id = decodeURIComponent(query.scene || '');
      this.setData({
        referral: await api.resolveReferral(id)
      });
    } catch (e) {
      this.setData({
        error: e.message
      });
    } finally {
      this.setData({
        loading: false
      });
    }
  },
  async start() {
    if (this.data.busy || !this.data.referral) return;
    this.setData({
      busy: true,
      error: ''
    });
    try {
      await api.login();
      const {
        registration
      } = await api.mine();
      if (registration) {
        wx.showModal({
          title: '已有报名记录',
          content: '本次扫码不会修改原报名归属。如需调整，请联系管理老师。',
          showCancel: false,
          success: () => wx.redirectTo({
            url: '/pages/my/my'
          })
        });
        return;
      }
      const draft = wx.getStorageSync('registrationFormDraft') || {};
      wx.setStorageSync('registrationFormDraft', {
        ...draft,
        ...this.data.referral,
        editing: false
      });
      wx.redirectTo({
        url: '/pages/register/register'
      });
    } catch (e) {
      this.setData({
        error: e.message
      });
    } finally {
      this.setData({
        busy: false
      });
    }
  }
});