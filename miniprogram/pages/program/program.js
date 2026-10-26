const programs = require('../../data/programs');
const DRAFT_KEY = 'registrationFormDraft';

Page({
  data: {
    error: '',
    programs,
    schools: [],
    levels: [...new Set(programs.map(item => item.level))],
    majors: [],
    school: '',
    level: '',
    program: null,
    consent: false
  },

  onLoad() {
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    if (!draft.name) {
      wx.redirectTo({ url: '/pages/register/register' });
      return;
    }
    this.restoreSelection(draft);
  },

  onHide() { this.saveDraft(); },
  onUnload() { this.saveDraft(); },
  unique(items) { return [...new Set(items)]; },

  restoreSelection(draft) {
    const program = draft.program && programs.find(item => item.id === draft.program.id);
    if (!program) return;
    const schools = this.unique(programs.filter(item => item.level === program.level).map(item => item.school));
    const majors = programs.filter(item => item.school === program.school && item.level === program.level);
    this.setData({ school: program.school, level: program.level, program, schools, majors, consent: draft.consent === true });
  },

  saveDraft() {
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    wx.setStorageSync(DRAFT_KEY, { ...draft, program: this.data.program, consent: this.data.consent });
  },

  chooseSchool(e) {
    if (!this.data.level) return;
    const school = this.data.schools[Number(e.detail.value)];
    if (!school) return;
    const majors = programs.filter(item => item.school === school && item.level === this.data.level);
    this.setData({ school, majors, program: null, error: '' }, () => this.saveDraft());
  },

  chooseLevel(e) {
    const level = this.data.levels[Number(e.detail.value)];
    if (!level) return;
    const schools = this.unique(programs.filter(item => item.level === level).map(item => item.school));
    this.setData({ level, schools, school: '', majors: [], program: null, error: '' }, () => this.saveDraft());
  },

  chooseMajor(e) {
    this.setData({ program: this.data.majors[Number(e.detail.value)], error: '' }, () => this.saveDraft());
  },

  consentChange(e) {
    this.setData({ consent: e.detail.value.includes('agree'), error: '' }, () => this.saveDraft());
  },

  openAgreement(e) {
    wx.navigateTo({ url: `/pages/agreement/agreement?type=${e.currentTarget.dataset.type}` });
  },

  submit() {
    if (!this.data.program) {
      this.setData({ error: '请依次选择报考层次、学校和专业。' });
      return;
    }
    if (!this.data.consent) {
      this.setData({ error: '请先阅读报名、调剂和隐私说明，并勾选同意。' });
      return;
    }
    this.saveDraft();
    wx.navigateTo({ url: '/pages/confirm/confirm' });
  }
});
