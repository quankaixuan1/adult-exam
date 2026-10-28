const api = require('../../services/api');
const { validateIdNumber } = require('../../utils/id-number');

const DRAFT_KEY = 'registrationFormDraft';
const educationOptions = ['高中', '中专', '大专', '本科', '硕士及以上'];
const politicalOptions = ['群众', '共青团员', '中共党员', '其他'];
const emptyForm = {
  name: '', gender: '', ethnicity: '', idNumber: '', phone: '', education: '',
  workUnit: '', currentAddress: '', politicalStatus: '', unionMember: false,
  veteran: false, emergencyName: '', emergencyPhone: ''
};

Page({
  data: {
    idNumberError: '',
    idNumberChecked: false,
    loading: true,
    error: '',
    student: null,
    form: { ...emptyForm },
    genderOptions: ['男', '女'],
    educationOptions,
    politicalOptions
  },

  async onShow() {
    const saved = wx.getStorageSync(DRAFT_KEY) || {};
    const form = Object.keys(emptyForm).reduce((result, key) => {
      result[key] = saved[key] === undefined ? emptyForm[key] : saved[key];
      return result;
    }, {});
    this.setData({ form, loading: true, error: '' });
    try {
      const student = (await api.me()).student;
      this.setData({ student, loading: false });
    } catch (e) {
      this.setData({ error: e.message, loading: false });
    }
  },

  onHide() { this.saveDraft(); },
  onUnload() { this.saveDraft(); },

  saveDraft() {
    const saved = wx.getStorageSync(DRAFT_KEY) || {};
    wx.setStorageSync(DRAFT_KEY, {
      campus: saved.campus || '', teacherId: saved.teacherId || '', teacherName: saved.teacherName || '',
      ...this.data.form,
      program: saved.program || null,
      consent: saved.consent === true
    });
  },

  updateField(field, value) {
    this.setData({ [`form.${field}`]: value, error: '' }, () => this.saveDraft());
  },

  fieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (field === 'idNumber') this.setData({ idNumberError: '', idNumberChecked: false });
    this.updateField(field, e.detail.value);
  },
  checkIdNumber(e) {
    const idNumber = String(e.detail.value || '').trim().toUpperCase();
    this.setData({ 'form.idNumber': idNumber, idNumberError: validateIdNumber(idNumber), idNumberChecked: true }, () => this.saveDraft());
  },
  chooseGender(e) { this.updateField('gender', this.data.genderOptions[Number(e.detail.value)]); },
  chooseEducation(e) { this.updateField('education', educationOptions[Number(e.detail.value)]); },
  choosePolitical(e) { this.updateField('politicalStatus', politicalOptions[Number(e.detail.value)]); },
  unionChange(e) { this.updateField('unionMember', e.detail.value); },
  veteranChange(e) { this.updateField('veteran', e.detail.value); },

  submit() {
    const form = { ...this.data.form };
    Object.keys(form).forEach(key => {
      if (typeof form[key] === 'string') form[key] = form[key].trim();
    });
    form.idNumber = typeof form.idNumber === 'string' ? form.idNumber.toUpperCase() : '';
    const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
    const checks = [
      [validText(form.name, 40), '请填写姓名（不超过40字）。'],
      [['男', '女'].includes(form.gender), '请选择性别：男或女。'],
      [validText(form.ethnicity, 20), '请填写民族（不超过20字）。'],
      [!validateIdNumber(form.idNumber), validateIdNumber(form.idNumber)],
      [typeof form.phone === 'string' && /^1[3-9]\d{9}$/.test(form.phone), '请填写有效的11位本人手机号。'],
      [educationOptions.includes(form.education), '请选择当前学历。'],
      [validText(form.currentAddress, 160), '请填写现居住地址（不超过160字）。'],
      [politicalOptions.includes(form.politicalStatus), '请选择政治面貌。'],
      [typeof form.workUnit === 'string' && form.workUnit.length <= 100, '工作单位不能超过100字。'],
      [!(form.emergencyName || form.emergencyPhone) || validText(form.emergencyName, 40), '如填写第二联系人，请填写姓名（不超过40字）。'],
      [!(form.emergencyName || form.emergencyPhone) || (typeof form.emergencyPhone === 'string' && /^1[3-9]\d{9}$/.test(form.emergencyPhone)), '如填写第二联系人，请填写有效的11位手机号。']
    ];
    const failed = checks.find(item => !item[0]);
    this.setData({ form, error: failed ? failed[1] : '', idNumberChecked: true, idNumberError: validateIdNumber(form.idNumber) });
    this.saveDraft();
    if (failed) {
      wx.showToast({ title: failed[1], icon: 'none', duration: 3000 });
      return;
    }
    wx.navigateTo({ url: '/pages/program/program' });
  }
});
