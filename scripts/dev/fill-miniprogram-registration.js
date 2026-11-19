// Paste into WeChat DevTools console while on the registration information page.
// Fills the current form and local draft; never submits a registration.
(() => {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  if (page?.route !== 'pages/register/register') throw new Error('请先打开填写报名信息页面');
  if (page.data.loading) throw new Error('请等待页面加载完成');
  if ((wx.getStorageSync('registrationFormDraft') || {}).editing) throw new Error('仅用于新增报名，不覆盖已有学生');
  const form = {
    ...page.data.form,
    name: '测试考生', gender: '女', ethnicity: '汉族', idNumber: '11010519491231002X',
    phone: '13800000000', education: '专科', workUnit: '测试单位',
    currentAddress: '测试地址（非真实资料）', politicalStatus: '群众',
    unionMember: false, veteran: false, emergencyName: '', emergencyPhone: ''
  };
  page.setData({ form, error: '', idNumberChecked: false, idNumberError: '' }, () => page.saveDraft());
  console.info('测试资料已填入，尚未提交。');
})();
