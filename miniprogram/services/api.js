const SIGNED_IN_KEY = 'cloudStudentSignedIn';

function cloudError(result) {
  const error = new Error(result && result.message ? result.message : '云服务暂时不可用，请稍后重试');
  if (result && result.code) error.code = result.code;
  return error;
}

async function call(action, data = {}) {
  let response;
  try {
    response = await wx.cloud.callFunction({ name: 'student-api', data: { action, data } });
  } catch (cause) {
    const error = new Error('无法连接云服务，请稍后重试');
    error.cause = cause;
    throw error;
  }
  const result = response && response.result;
  if (!result || result.ok !== true) throw cloudError(result);
  return result.data;
}

function requireSignedIn() {
  if (wx.getStorageSync(SIGNED_IN_KEY) !== true) {
    const error = new Error('请先微信登录');
    error.code = 'LOGIN_REQUIRED';
    throw error;
  }
}

async function login() {
  const result = await call('login');
  wx.setStorageSync(SIGNED_IN_KEY, true);
  return result.student;
}

module.exports = {
  hasSession: () => wx.getStorageSync(SIGNED_IN_KEY) === true,
  config: () => Promise.resolve({ wechatReady: true, demoMode: false, cloudMode: true }),
  login,
  demoLogin: login,
  catalog: () => call('catalog'),
  resume: login,
  async me() { requireSignedIn(); return call('me'); },
  async mine() { requireSignedIn(); return call('mine'); },
  async prepareMaterialUpload(data) { requireSignedIn(); return call('materials', { ...data, operation: 'prepare' }); },
  async saveMaterial(data) { requireSignedIn(); return call('materials', { ...data, operation: 'save' }); },
  async register(data, studentId) { requireSignedIn(); return call('register', { ...data, studentId }); },
  async update(data, studentId) { requireSignedIn(); return call('update', { ...data, studentId }); },
  async logout() {
    if (wx.getStorageSync(SIGNED_IN_KEY) === true) await call('logout');
    wx.removeStorageSync(SIGNED_IN_KEY);
  },
  async resetDemo() {
    if (wx.getStorageSync(SIGNED_IN_KEY) === true) await call('resetDemo');
    wx.removeStorageSync(SIGNED_IN_KEY);
    wx.removeStorageSync('demoPresentationId');
    wx.removeStorageSync('demoPaymentPreview');
    wx.removeStorageSync('registrationFormDraft');
  },
  status: token => call('legacyStatus', { token })
};
