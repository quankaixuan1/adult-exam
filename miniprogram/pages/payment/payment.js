const api = require('../../services/api');

Page({
  data: { registration: null, complete: false, busy: false, error: '' },
  async onLoad() {
    this.setData({ busy: true, error: '' });
    try {
      const { registration } = await api.mine();
      if (!registration) {
        wx.reLaunch({ url: '/pages/index/index' });
        return;
      }
      this.setData({ registration, complete: registration.paymentStatus === 'demo_completed' });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  },
  async finish() {
    if (this.data.busy || this.data.complete || !this.data.registration) return;
    this.setData({ busy: true, error: '' });
    try {
      const { registration } = await api.completeDemoPayment();
      this.setData({ registration, complete: true });
      wx.removeStorageSync('registrationFormDraft');
      wx.removeStorageSync('demoPaymentPreview');
    } catch (e) {
      this.setData({ error: e.message || '模拟缴费未完成，请重试' });
    } finally {
      this.setData({ busy: false });
    }
  },
  home() { wx.reLaunch({ url: '/pages/index/index' }); },
  mine() { wx.redirectTo({ url: '/pages/my/my' }); },
  async restart() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      await api.resetDemo();
      wx.reLaunch({ url: '/pages/index/index' });
    } catch (e) {
      this.setData({ error: e.message });
    } finally {
      this.setData({ busy: false });
    }
  }
});
