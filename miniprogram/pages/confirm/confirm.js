const api = require('../../services/api');
Page({
  data: { draft: null, busy: false, error: '' },
  onLoad() {
    const draft = wx.getStorageSync('registrationFormDraft');
    if (!draft || !draft.program) wx.navigateBack();
    else this.setData({ draft: { ...draft, idNumberMasked: `**************${draft.idNumber.slice(-4)}` } });
  },
  back() { wx.navigateBack(); },
  async confirm() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const current = (await api.me()).student;
      const draft = this.data.draft;
      const result = await api.register({ ...draft, programId: draft.program.id, program: undefined, idNumberMasked: undefined, consent: true }, current.id);
      wx.setStorageSync('demoPaymentPreview', result.registration);
      wx.redirectTo({ url: '/pages/payment/payment' });
    } catch (e) { this.setData({ error: e.message, busy: false }); }
  }
});
