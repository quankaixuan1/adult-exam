const cloud = require('wx-server-sdk');
const { createHash, randomBytes, createCipheriv } = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const programs = [
  { id: 'hdu-zsb-gs', school: '杭州电子科技大学', level: '专升本', major: '工商管理', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-kj', school: '杭州电子科技大学', level: '专升本', major: '会计学', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-rl', school: '杭州电子科技大学', level: '专升本', major: '人力资源管理', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-sc', school: '杭州电子科技大学', level: '专升本', major: '市场营销', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-dz', school: '杭州电子科技大学', level: '专升本', major: '电子商务', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-jsj', school: '杭州电子科技大学', level: '专升本', major: '计算机科学与技术', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-jx', school: '杭州电子科技大学', level: '专升本', major: '机械设计制造及其自动化', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-dzxx', school: '杭州电子科技大学', level: '专升本', major: '电子信息工程', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-ai', school: '杭州电子科技大学', level: '专升本', major: '人工智能', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-dq', school: '杭州电子科技大学', level: '专升本', major: '电气工程及其自动化', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-szmt', school: '杭州电子科技大学', level: '专升本', major: '数字媒体应用技术', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-zsb-fx', school: '杭州电子科技大学', level: '专升本', major: '法学', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'hdu-gqb-gs', school: '杭州电子科技大学', level: '高起本', major: '工商管理', duration: '5年', studyMode: '非脱产', fee: 680 },
  { id: 'hdu-gqb-jsj', school: '杭州电子科技大学', level: '高起本', major: '计算机科学与技术', duration: '5年', studyMode: '非脱产', fee: 680 },
  { id: 'zjtie-gqz-gs', school: '浙江经济职业技术学院', level: '高起专', major: '工商企业管理', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'zjtie-gqz-kj', school: '浙江经济职业技术学院', level: '高起专', major: '大数据与会计', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'zjtie-gqz-sj', school: '浙江经济职业技术学院', level: '高起专', major: '大数据技术', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'zjtie-gqz-dz', school: '浙江经济职业技术学院', level: '高起专', major: '电子商务', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'zjtie-gqz-sc', school: '浙江经济职业技术学院', level: '高起专', major: '市场营销', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'zjtie-gqz-wl', school: '浙江经济职业技术学院', level: '高起专', major: '现代物流管理', duration: '2.5年', studyMode: '非脱产', fee: 600 },
  { id: 'zjtie-gqz-wlw', school: '浙江经济职业技术学院', level: '高起专', major: '物联网应用技术', duration: '2.5年', studyMode: '非脱产', fee: 600 }
];

class ApiError extends Error {
  constructor(message, code = 'REQUEST_FAILED') {
    super(message);
    this.code = code;
  }
}

const isoNow = () => new Date().toISOString();
const studentDocumentId = openId => createHash('sha256').update(`student:${openId}`).digest('hex');
const publicStudent = value => value ? { id: value._id, accountNo: value.accountNo, createdAt: value.createdAt } : null;
const publicRegistration = value => value ? {
  id: value._id,
  studentId: value.studentId,
  name: value.name,
  phone: value.phone,
  gender: value.gender,
  ethnicity: value.ethnicity,
  idNumberMasked: value.idNumberLast4 ? `**************${value.idNumberLast4}` : '',
  education: value.education,
  workUnit: value.workUnit || '',
  currentAddress: value.currentAddress,
  politicalStatus: value.politicalStatus,
  unionMember: value.unionMember === true,
  veteran: value.veteran === true,
  emergencyName: value.emergencyName,
  emergencyPhone: value.emergencyPhone,
  programId: value.programId,
  school: value.school,
  level: value.level,
  major: value.major,
  duration: value.duration,
  studyMode: value.studyMode,
  fee: value.fee,
  status: value.status,
  revision: value.revision,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt
} : null;

function text(value, max) {
  const result = typeof value === 'string' ? value.trim() : '';
  return result.length <= max ? result : '';
}

function encryptionKey() {
  const raw = process.env.PII_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new ApiError('敏感信息保护配置尚未完成，请联系管理员', 'SERVICE_CONFIG');
  return Buffer.from(raw, 'hex');
}

function encryptSensitive(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}

function validateRegistration(data, currentName) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('请填写报名信息', 'INVALID_INPUT');
  const name = typeof currentName === 'string' ? currentName : text(data.name, 40);
  const phone = text(data.phone, 11);
  const idNumber = text(data.idNumber, 18).toUpperCase();
  const gender = text(data.gender, 2);
  const ethnicity = text(data.ethnicity, 20);
  const education = text(data.education, 20);
  const currentAddress = text(data.currentAddress, 160);
  const politicalStatus = text(data.politicalStatus, 20);
  const emergencyName = text(data.emergencyName, 40);
  const emergencyPhone = text(data.emergencyPhone, 11);
  if (!name || !['男', '女'].includes(gender) || !ethnicity || !/^\d{17}[0-9X]$/.test(idNumber)) throw new ApiError('请完整填写有效的身份信息', 'INVALID_INPUT');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new ApiError('请填写有效的本人手机号', 'INVALID_INPUT');
  if ((emergencyName || emergencyPhone) && (!emergencyName || !/^1[3-9]\d{9}$/.test(emergencyPhone))) throw new ApiError('第二联系人如填写，请同时填写姓名和有效手机号', 'INVALID_INPUT');
  if (!education || !currentAddress || !politicalStatus) throw new ApiError('请完整填写学历、现居住地址和政治面貌', 'INVALID_INPUT');
  const program = programs.find(item => item.id === data.programId);
  if (!program) throw new ApiError('请选择当前开放的学校和专业', 'INVALID_INPUT');
  if (data.consent !== true) throw new ApiError('请先阅读并同意信息使用说明', 'INVALID_INPUT');
  return {
    name, phone, gender, ethnicity,
    idNumberEncrypted: encryptSensitive(idNumber),
    idNumberHash: createHash('sha256').update(`id:${idNumber}`).digest('hex'),
    idNumberLast4: idNumber.slice(-4),
    education, workUnit: text(data.workUnit, 100), currentAddress, politicalStatus,
    unionMember: data.unionMember === true, veteran: data.veteran === true,
    emergencyName, emergencyPhone, wechatContact: true,
    programId: program.id, ...program
  };
}

function isMissing(error) {
  return /not exist|DOCUMENT_NOT_FOUND/i.test(error.errMsg || error.message || '');
}

async function findStudent(openId) {
  try {
    const result = await db.collection('students').doc(studentDocumentId(openId)).get();
    return result.data || null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function requireStudent(openId) {
  const student = await findStudent(openId);
  if (!student) throw new ApiError('请先微信登录', 'LOGIN_REQUIRED');
  return student;
}

async function findRegistration(studentId) {
  try {
    const result = await db.collection('registrations').doc(studentId).get();
    return result.data || null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function audit(studentId, action, details = {}) {
  try {
    await db.collection('audit_logs').add({ data: { studentId, action, details, createdAt: isoNow() } });
  } catch (error) {
    console.error('audit log failed', error.errCode || error.message);
  }
}

async function login(openId) {
  let student = await findStudent(openId);
  if (!student) {
    const now = isoNow();
    const id = studentDocumentId(openId);
    const data = { _id: id, accountNo: `STU${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`, createdAt: now, lastLoginAt: now };
    try {
      await db.collection('students').add({ data });
      student = data;
    } catch (error) {
      student = await findStudent(openId);
      if (!student) throw error;
    }
    await audit(id, 'student_created');
  } else {
    await db.collection('students').doc(student._id).update({ data: { lastLoginAt: isoNow() } });
  }
  return { student: publicStudent(student) };
}

async function handle(action, data, openId) {
  if (action === 'login') return login(openId);
  if (action === 'catalog') return { demo: false, programs };
  if (action === 'legacyStatus') throw new ApiError('旧查询码暂未迁移到云端，请联系机构工作人员', 'NOT_MIGRATED');

  const student = await requireStudent(openId);
  if (action === 'me') return { student: publicStudent(student) };
  if (action === 'mine') return { registration: publicRegistration(await findRegistration(student._id)) };
  if (action === 'logout') {
    await audit(student._id, 'logout');
    return { ok: true };
  }
  if (action === 'register') {
    const existing = await findRegistration(student._id);
    if (existing) throw new ApiError('该账号已经提交过报名信息', 'ALREADY_REGISTERED');
    const clean = validateRegistration(data);
    const now = isoNow();
    const registration = { _id: student._id, studentId: student._id, ...clean, status: 'pending', revision: 1, consentVersion: 'cloud-v1', createdAt: now, updatedAt: now };
    await db.collection('registrations').add({ data: registration });
    await audit(student._id, 'registration_created', { programId: clean.programId });
    return { registration: publicRegistration(registration) };
  }
  if (action === 'update') {
    const current = await findRegistration(student._id);
    if (!current) throw new ApiError('尚未提交报名信息', 'NOT_FOUND');
    if (!Number.isSafeInteger(data.revision) || data.revision !== current.revision) throw new ApiError('报名资料已更新，请返回后重新打开修改页面', 'REVISION_CONFLICT');
    const clean = validateRegistration(data, current.name);
    const next = { ...clean, status: 'pending', revision: current.revision + 1, updatedAt: isoNow() };
    const result = await db.collection('registrations').where({ _id: student._id, revision: current.revision }).update({ data: next });
    if (!result.stats || result.stats.updated !== 1) throw new ApiError('报名资料已更新，请返回后重新打开修改页面', 'REVISION_CONFLICT');
    await audit(student._id, 'registration_updated', { programId: clean.programId, revision: next.revision });
    return { registration: publicRegistration({ ...current, ...next }) };
  }
  if (action === 'resetDemo') {
    const current = await findRegistration(student._id);
    if (current) await db.collection('registrations').doc(student._id).remove();
    await audit(student._id, 'demo_reset');
    return { ok: true };
  }
  throw new ApiError('接口不存在', 'NOT_FOUND');
}

exports.main = async event => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw new ApiError('无法识别当前微信账号', 'LOGIN_REQUIRED');
    const action = event && typeof event.action === 'string' ? event.action : '';
    const data = event && event.data && typeof event.data === 'object' ? event.data : {};
    return { ok: true, data: await handle(action, data, OPENID) };
  } catch (error) {
    console.error('student-api failed', error.code || error.errCode || error.message);
    const known = error instanceof ApiError;
    return { ok: false, code: known ? error.code : 'CLOUD_ERROR', message: known ? error.message : '云服务暂时不可用，请稍后再试' };
  }
};
