const api = require('../../services/api');
const { normalizeRegistration } = require('../../data/registration-normalization');
Page({
  data: { draft: null, busy: false, error: '' },
  onLoad() {
    const draft = wx.getStorageSync('registrationFormDraft');
    if (!draft || !draft.program) wx.navigateBack();
    else {
      try {
        const normalized = normalizeRegistration(draft.program);
        const program = { ...draft.program, ...normalized, schoolOriginal: draft.program.schoolOriginal || draft.program.school };
        this.setData({ draft: { ...draft, program, idNumberMasked: `**************${draft.idNumber.slice(-4)}` } });
      } catch (e) { this.setData({ error: e.message }); }
    }
  },
  back() { wx.navigateBack(); },
  async confirm() {
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const current = (await api.me()).student;
      const draft = this.data.draft;
      const customProgram = draft.program.id === 'other' ? { level: draft.program.level, school: draft.program.schoolOriginal || draft.program.school, major: draft.program.major } : undefined;
      const result = await api.register({ ...draft, programId: draft.program.id, customProgram, program: undefined, idNumberMasked: undefined, consent: true }, current.id);
      wx.setStorageSync('demoPaymentPreview', result.registration);
      wx.redirectTo({ url: '/pages/payment/payment' });
    } catch (e) { this.setData({ error: e.message, busy: false }); }
  }
});
