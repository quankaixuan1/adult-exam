const cloud = require('wx-server-sdk');
const { randomBytes, createHash, scryptSync, timingSafeEqual } = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const command = db.command;
const SESSION_MS = 8 * 60 * 60 * 1000;

class ApiError extends Error {
  constructor(message, code = 'REQUEST_FAILED') {
    super(message);
    this.code = code;
  }
}

const isoNow = () => new Date().toISOString();
const digest = value => createHash('sha256').update(value).digest('hex');
const normalizeUsername = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

function passwordDigest(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 128;
}

async function adminDocument() {
  try {
    return (await db.collection('admins').doc('primary').get()).data || null;
  } catch (error) {
    if (/not exist|DOCUMENT_NOT_FOUND/i.test(error.errMsg || error.message || '')) return null;
    throw error;
  }
}

async function createSession(admin) {
  const token = `adm_${randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  await db.collection('admin_sessions').add({
    data: {
      _id: digest(`admin-session:${token}`),
      adminId: admin._id,
      expiresAt,
      createdAt: isoNow()
    }
  });
  return { token, expiresAt, admin: { username: admin.username, displayName: admin.displayName } };
}

async function authenticate(token) {
  if (!/^adm_[a-f0-9]{64}$/.test(token || '')) throw new ApiError('管理员登录已失效，请重新登录', 'LOGIN_REQUIRED');
  let session;
  try {
    session = (await db.collection('admin_sessions').doc(digest(`admin-session:${token}`)).get()).data;
  } catch (error) {
    throw new ApiError('管理员登录已失效，请重新登录', 'LOGIN_REQUIRED');
  }
  if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new ApiError('管理员登录已过期，请重新登录', 'LOGIN_REQUIRED');
  const admin = await adminDocument();
  if (!admin || admin._id !== session.adminId || admin.disabled === true) throw new ApiError('管理员账号不可用', 'LOGIN_REQUIRED');
  return admin;
}

async function audit(admin, action, details = {}) {
  await db.collection('audit_logs').add({
    data: { actorType: 'admin', actorId: admin._id, action, details, createdAt: isoNow() }
  });
}

async function bootstrap(data) {
  if (await adminDocument()) throw new ApiError('管理员已经初始化', 'ALREADY_INITIALIZED');
  const username = normalizeUsername(data.username);
  if (!/^[a-z0-9_-]{4,32}$/.test(username)) throw new ApiError('账号需为4至32位字母、数字、下划线或短横线', 'INVALID_INPUT');
  if (!validPassword(data.password)) throw new ApiError('密码至少10位，最多128位', 'INVALID_INPUT');
  const salt = randomBytes(16).toString('hex');
  const admin = {
    _id: 'primary',
    username,
    displayName: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim().slice(0, 40) : '主管理员',
    passwordSalt: salt,
    passwordHash: passwordDigest(data.password, salt),
    createdAt: isoNow(),
    disabled: false
  };
  try {
    await db.collection('admins').add({ data: admin });
  } catch (error) {
    throw new ApiError('管理员已经初始化', 'ALREADY_INITIALIZED');
  }
  await audit(admin, 'admin_initialized');
  return createSession(admin);
}

async function login(data) {
  const admin = await adminDocument();
  if (!admin || admin.disabled === true) throw new ApiError('账号或密码错误', 'INVALID_CREDENTIALS');
  const username = normalizeUsername(data.username);
  const candidate = validPassword(data.password) ? passwordDigest(data.password, admin.passwordSalt) : '0'.repeat(128);
  const stored = Buffer.from(admin.passwordHash, 'hex');
  const supplied = Buffer.from(candidate, 'hex');
  if (username !== admin.username || stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) throw new ApiError('账号或密码错误', 'INVALID_CREDENTIALS');
  await db.collection('admins').doc(admin._id).update({ data: { lastLoginAt: isoNow() } });
  await audit(admin, 'admin_login');
  return createSession(admin);
}

async function dashboard(admin, data) {
  const status = ['pending', 'approved', 'rejected'].includes(data.status) ? data.status : '';
  const page = Number.isSafeInteger(data.page) && data.page > 0 ? data.page : 1;
  const pageSize = 30;
  const collection = db.collection('registrations');
  const query = status ? collection.where({ status }) : collection;
  const [total, pending, approved, rejected, rows] = await Promise.all([
    collection.count(),
    collection.where({ status: 'pending' }).count(),
    collection.where({ status: 'approved' }).count(),
    collection.where({ status: 'rejected' }).count(),
    query.orderBy('updatedAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ]);
  return {
    admin: { username: admin.username, displayName: admin.displayName },
    stats: { total: total.total, pending: pending.total, approved: approved.total, rejected: rejected.total },
    registrations: rows.data.map(item => ({
      id: item._id,
      name: item.name,
      phone: item.phone,
      gender: item.gender || '',
      ethnicity: item.ethnicity || '',
      idNumberMasked: item.idNumberLast4 ? `**************${item.idNumberLast4}` : '',
      education: item.education || '',
      workUnit: item.workUnit || '',
      currentAddress: item.currentAddress || '',
      politicalStatus: item.politicalStatus || '',
      unionMember: item.unionMember === true,
      veteran: item.veteran === true,
      emergencyName: item.emergencyName || '',
      emergencyPhone: item.emergencyPhone || '',
      school: item.school,
      level: item.level,
      major: item.major,
      fee: item.fee,
      status: item.status,
      reviewRemark: item.reviewRemark || '',
      revision: item.revision,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    })),
    page,
    pageSize,
    filteredTotal: (await query.count()).total
  };
}

async function review(admin, data) {
  if (typeof data.registrationId !== 'string' || !/^[a-f0-9]{64}$/.test(data.registrationId)) throw new ApiError('报名记录无效', 'INVALID_INPUT');
  if (!['approved', 'rejected', 'pending'].includes(data.status)) throw new ApiError('请选择审核结果', 'INVALID_INPUT');
  const remark = typeof data.remark === 'string' ? data.remark.trim().slice(0, 500) : '';
  if (data.status === 'rejected' && !remark) throw new ApiError('请填写需要补充或修改的内容', 'INVALID_INPUT');
  const updatedAt = isoNow();
  const result = await db.collection('registrations').doc(data.registrationId).update({
    data: {
      status: data.status,
      reviewRemark: remark,
      reviewedAt: updatedAt,
      reviewedBy: admin._id,
      updatedAt,
      revision: command.inc(1)
    }
  });
  if (!result.stats || result.stats.updated !== 1) throw new ApiError('未找到报名记录', 'NOT_FOUND');
  await audit(admin, 'registration_reviewed', { registrationId: data.registrationId, status: data.status });
  return { ok: true };
}

async function handle(action, data) {
  if (action === 'bootstrapStatus') return { initialized: Boolean(await adminDocument()) };
  if (action === 'bootstrap') return bootstrap(data);
  if (action === 'login') return login(data);
  const admin = await authenticate(data.token);
  if (action === 'dashboard') return dashboard(admin, data);
  if (action === 'review') return review(admin, data);
  if (action === 'logout') {
    await db.collection('admin_sessions').doc(digest(`admin-session:${data.token}`)).remove();
    await audit(admin, 'admin_logout');
    return { ok: true };
  }
  throw new ApiError('接口不存在', 'NOT_FOUND');
}

exports.main = async event => {
  try {
    const action = event && typeof event.action === 'string' ? event.action : '';
    const data = event && event.data && typeof event.data === 'object' ? event.data : {};
    return { ok: true, data: await handle(action, data) };
  } catch (error) {
    console.error('admin-api failed', error.code || error.errCode || error.message);
    const known = error instanceof ApiError;
    return { ok: false, code: known ? error.code : 'CLOUD_ERROR', message: known ? error.message : '管理服务暂时不可用，请稍后再试' };
  }
};
