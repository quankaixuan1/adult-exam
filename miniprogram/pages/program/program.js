const programs = require('../../data/programs');
const DRAFT_KEY = 'registrationFormDraft';

Page({
  data: {
    error: '',
    programs,
    schools: [...new Set(programs.map(item => item.school))],
    levels: [],
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
    const levels = this.unique(programs.filter(item => item.school === program.school).map(item => item.level));
    const majors = programs.filter(item => item.school === program.school && item.level === program.level);
    this.setData({ school: program.school, level: program.level, program, levels, majors, consent: draft.consent === true });
  },

  saveDraft() {
    const draft = wx.getStorageSync(DRAFT_KEY) || {};
    wx.setStorageSync(DRAFT_KEY, { ...draft, program: this.data.program, consent: this.data.consent });
  },

  chooseSchool(e) {
    const school = this.data.schools[Number(e.detail.value)];
    const levels = this.unique(programs.filter(item => item.school === school).map(item => item.level));
    this.setData({ school, levels, level: '', majors: [], program: null, error: '' }, () => this.saveDraft());
  },

  chooseLevel(e) {
    const level = this.data.levels[Number(e.detail.value)];
    const majors = programs.filter(item => item.school === this.data.school && item.level === level);
    this.setData({ level, majors, program: null, error: '' }, () => this.saveDraft());
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
      this.setData({ error: '请完整选择学校、报考层次和专业。' });
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
