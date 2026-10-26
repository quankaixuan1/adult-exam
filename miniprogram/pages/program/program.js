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
    customSchool: '',
    customMajor: '',
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
    if (draft.program && draft.program.id === 'other' && this.data.levels.includes(draft.program.level)) {
      const { level, school, major } = draft.program;
      this.setData({ level, school: '其它', schools: this.schoolsForLevel(level), customSchool: school || '', customMajor: major || '', consent: draft.consent === true });
      this.updateCustomProgram();
      return;
    }
    const program = draft.program && programs.find(item => item.id === draft.program.id);
    if (!program) return;
    const schools = this.schoolsForLevel(program.level);
    const majors = programs.filter(item => item.school === program.school && item.level === program.level);
    this.setData({ school: program.school, level: program.level, program, schools, majors, consent: draft.consent === true });
  },

  schoolsForLevel(level) {
    return [...this.unique(programs.filter(item => item.level === level).map(item => item.school)), '其它'];
  },

  updateCustomProgram() {
    const { level, customSchool, customMajor } = this.data;
    const rule = programs.find(item => item.level === level);
    if (!rule) return;
    this.setData({ program: { id: 'other', level, school: customSchool.trim(), major: customMajor.trim(), duration: rule.duration, fee: rule.fee, studyMode: '非脱产', examCategory: '—' } }, () => this.saveDraft());
  },

  inputCustomSchool(e) {
    this.setData({ customSchool: e.detail.value, error: '' });
    this.updateCustomProgram();
  },

  inputCustomMajor(e) {
    this.setData({ customMajor: e.detail.value, error: '' });
    this.updateCustomProgram();
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
    this.setData({ school, majors, customSchool: '', customMajor: '', program: null, error: '' }, () => {
      if (school === '其它') this.updateCustomProgram();
      else this.saveDraft();
    });
  },

  chooseLevel(e) {
    const level = this.data.levels[Number(e.detail.value)];
    if (!level) return;
    const schools = this.schoolsForLevel(level);
    this.setData({ level, schools, school: '', customSchool: '', customMajor: '', majors: [], program: null, error: '' }, () => this.saveDraft());
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
    if (this.data.school === '其它' && (!this.data.customSchool.trim() || !this.data.customMajor.trim())) {
      this.setData({ error: '请填写学校名称和专业名称。' });
      return;
    }
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
