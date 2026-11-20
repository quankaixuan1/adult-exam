const { allocateStudentNumber, registrationYear } = require('./student-number');
const registrationSchema = require('./registration-schema.json');
const cloud = require('wx-server-sdk');
const { validateIdNumber } = require('./id-number');
const { createHash, randomBytes, createCipheriv } = require('crypto');
const { withTransaction, addNotification, createInbox } = require('./notifications');
const organization = require('./organization');
const { normalizeRegistration } = require('./registration-normalization');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const materialKinds = {
  idFront: { label: '身份证人像面', extensions: ['jpg', 'jpeg', 'png'] },
  idBack: { label: '身份证国徽面', extensions: ['jpg', 'jpeg', 'png'] },
  education: { label: '学历材料', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
  photo: { label: '证件电子照片', extensions: ['jpg', 'jpeg', 'png'] }
};
const MAX_MATERIAL_SIZE = 10 * 1024 * 1024;

async function fetchProgramCatalog() {
  let response;
  try {
    response = await cloud.callFunction({
      name: 'admin-api',
      data: { action: 'catalog' }
    });
  } catch (error) {
    console.error('admin-api catalog request failed', error.errCode || error.message);
    throw new ApiError('招生专业目录暂时不可用，请稍后重试', 'CATALOG_UNAVAILABLE');
  }
  const result = response && response.result;
  if (!result || result.ok !== true || !Array.isArray(result.data?.programs)) {
    console.error('admin-api returned an invalid catalog response');
    throw new ApiError('招生专业目录暂时不可用，请稍后重试', 'CATALOG_UNAVAILABLE');
  }
  return result.data.programs;
}


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
  campus: value.campus || '',
  teacherId: value.teacherId || '',
  teacherName: value.teacherName || '',
  school: value.school,
  level: value.level,
  major: value.major,
  duration: value.duration,
  studyMode: value.studyMode,
  examCategory: value.examCategory || '—',
  fee: value.fee,
  status: value.status,
  paymentStatus: value.paymentStatus || 'pending',
  paymentRemark: value.paymentRemark || '',
  demoPaidAt: value.demoPaidAt || '',
  reviewRemark: value.reviewRemark || '',
  revision: value.revision,
  createdAt: value.createdAt,
  updatedAt: value.updatedAt,
  materials: Object.fromEntries(Object.entries(value.materials || {}).map(([kind, item]) => [kind, {
    fileId: item.fileId,
    fileName: item.fileName,
    size: item.size,
    status: item.status || 'pending',
    uploadedAt: item.uploadedAt
  }]))
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

function validateRegistration(data, currentName, currentRecord, programs) {
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
  const preserveIdentity = !idNumber && !!currentRecord?.idNumberEncrypted;
  const idError = preserveIdentity ? '' : validateIdNumber(idNumber);
  if (idError) throw new ApiError(idError, 'INVALID_INPUT');
  if (!name || !['男', '女'].includes(gender) || !ethnicity) throw new ApiError('请完整填写有效的身份信息', 'INVALID_INPUT');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new ApiError('请填写有效的本人手机号', 'INVALID_INPUT');
  if ((emergencyName || emergencyPhone) && (!emergencyName || !/^1[3-9]\d{9}$/.test(emergencyPhone))) throw new ApiError('第二联系人如填写，请同时填写姓名和有效手机号', 'INVALID_INPUT');
  if (!education || !currentAddress || !politicalStatus) throw new ApiError('请完整填写学历、现居住地址和政治面貌', 'INVALID_INPUT');
  for (const key of registrationSchema.booleanFields) {
    if (data[key] != null && typeof data[key] !== 'boolean') throw new ApiError('选项格式无效', 'INVALID_INPUT');
  }
  let program = programs.find(item => item.id === data.programId);
  if (data.programId === 'other') {
    const custom = data.customProgram || {};
    let normalized;
    try { normalized = normalizeRegistration({ level: text(custom.level, 10), school: text(custom.school, 100) }); }
    catch (error) { throw new ApiError(error.message, 'INVALID_INPUT'); }
    const { level, school } = normalized;
    const major = text(custom.major, 100);
    const rule = programs.find(item => item.level === level);
    if (!rule || !school || !major) throw new ApiError('请选择有效层次并填写学校名称和专业名称（各不超过100字）', 'INVALID_INPUT');
    program = { id: 'other', level, school, major, duration: rule.duration, fee: rule.fee, studyMode: '非脱产', examCategory: '—', ...(school !== text(custom.school, 100) ? { schoolOriginal: text(custom.school, 100) } : {}) };
  }
  if (!program) throw new ApiError('请选择当前开放的学校和专业', 'INVALID_INPUT');
  if (data.consent !== true) throw new ApiError('请先阅读并同意信息使用说明', 'INVALID_INPUT');
  return {
    name, phone, gender, ethnicity,
    ...(preserveIdentity ? {} : { idNumberEncrypted: encryptSensitive(idNumber),
    idNumberHash: createHash('sha256').update(`id:${idNumber}`).digest('hex'),
    idNumberLast4: idNumber.slice(-4) }),
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

async function prepareMaterialUpload(student, data) {
  const registration = await findRegistration(student._id);
  if (!registration) throw new ApiError('请先提交报名信息，再上传报名材料', 'REGISTRATION_REQUIRED');
  const kind = text(data.kind, 20);
  const definition = materialKinds[kind];
  const extension = text(data.extension, 10).toLowerCase().replace(/^\./, '');
  if (!definition || !definition.extensions.includes(extension)) throw new ApiError('文件类型不支持', 'INVALID_INPUT');
  const cloudPath = `student-materials/${student._id}/${kind}/${Date.now()}-${randomBytes(12).toString('hex')}.${extension}`;
  return { cloudPath, maxSize: MAX_MATERIAL_SIZE };
}

async function saveMaterial(student, data) {
  const kind = text(data.kind, 20);
  const definition = materialKinds[kind];
  const fileId = text(data.fileId, 600);
  const fileName = text(data.fileName, 120);
  const size = Number(data.size);
  const expectedPath = `/student-materials/${student._id}/${kind}/`;
  if (!definition || !fileId || !fileId.includes(expectedPath)) throw new ApiError('上传文件路径无效', 'INVALID_INPUT');
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_MATERIAL_SIZE) throw new ApiError('文件大小不能超过10MB', 'INVALID_INPUT');
  const uploadedAt = isoNow();
  const material = { fileId, fileName: fileName || definition.label, size, status: 'pending', uploadedAt };
  const saved = await withTransaction(db, async transaction => {
    const registration = await transactionRegistration(transaction, student._id);
    const previous = registration.materials && registration.materials[kind];
    if (previous && previous.fileId === fileId) return { material: previous, repeated: true };
    await transaction.collection('registrations').doc(student._id).update({
      data: {
        [`materials.${kind}`]: material,
        materialsUpdatedAt: uploadedAt,
        updatedAt: uploadedAt,
        status: 'pending',
        reviewRemark: '',
        revision: (registration.revision || 0) + 1
      }
    });
    await addNotification(transaction, {
      type: 'material_uploaded', audience: 'admin', registrationId: student._id,
      registrationCreatedAt: registration.createdAt, version: fileId, kind, createdAt: uploadedAt
    });
    return { material, previous };
  });
  const previous = saved.previous;
  if (previous && previous.fileId && previous.fileId !== fileId) {
    try { await cloud.deleteFile({ fileList: [previous.fileId] }); } catch (error) { console.error('old material cleanup failed', error.errCode || error.message); }
  }
  if (!saved.repeated) await audit(student._id, 'material_uploaded', { kind, size });
  return { material: { kind, ...saved.material } };
}

async function transactionRegistration(transaction, id) {
  try {
    const registration = (await transaction.collection('registrations').doc(id).get()).data;
    if (registration) return registration;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  throw new ApiError('请先提交报名信息', 'REGISTRATION_REQUIRED');
}

async function completeDemoPayment(student) {
  const registration = await withTransaction(db, async transaction => {
    const current = await transactionRegistration(transaction, student._id);
    if (current.paymentStatus === 'demo_completed') return current;
    if (current.paymentStatus !== 'pending') throw new ApiError('该记录不支持模拟缴费', 'INVALID_STATE');
    const paidAt = isoNow();
    const next = { paymentStatus: 'demo_completed', demoPaidAt: paidAt, updatedAt: paidAt };
    await transaction.collection('registrations').doc(student._id).update({ data: next });
    await addNotification(transaction, {
      type: 'registration_completed', audience: 'admin', registrationId: student._id,
      registrationCreatedAt: current.createdAt, version: current.createdAt, createdAt: paidAt
    });
    return { ...current, ...next };
  });
  return { registration: publicRegistration(registration) };
}

function studentInbox(student) {
  return createInbox(db, {
    audience: 'student', readerId: student._id, recipientId: student._id,
    registrationScope: { 'registration.studentId': student._id }
  }, (message, code) => new ApiError(message, code));
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

const resolveReferral = require('./referrals')({ db, ApiError });
async function handle(action, data, openId) {
  if (action === 'resolveReferral') { const { sourceAdminId, ...publicInfo } = await resolveReferral(data.referralId); return publicInfo; }
  if (action === 'login') return login(openId);
  if (action === 'legacyStatus') throw new ApiError('旧查询码暂未迁移到云端，请联系机构工作人员', 'NOT_MIGRATED');

  const student = await requireStudent(openId);
  if (action === 'completeDemoPayment' || action === 'resetDemo') throw new ApiError('请联系报名老师完成缴费', 'INVALID_STATE');
  if (action === 'notifications') return studentInbox(student).list();
  if (action === 'readNotification') return studentInbox(student).read(data.notificationId);
  if (action === 'me') return { student: publicStudent(student) };
  if (action === 'mine') return { registration: publicRegistration(await findRegistration(student._id)) };
  if (action === 'materials') {
    if (data.operation === 'prepare') return prepareMaterialUpload(student, data);
    if (data.operation === 'save') return saveMaterial(student, data);
    throw new ApiError('材料操作不存在', 'NOT_FOUND');
  }
  if (action === 'prepareMaterialUpload') return prepareMaterialUpload(student, data);
  if (action === 'saveMaterial') return saveMaterial(student, data);
  if (action === 'logout') {
    await audit(student._id, 'logout');
    return { ok: true };
  }
  if (action === 'register') {
    const existing = await findRegistration(student._id);
    if (existing) throw new ApiError('该账号已经提交过报名信息', 'ALREADY_REGISTERED');
    const programs = await fetchProgramCatalog();
    const clean = validateRegistration(data, undefined, undefined, programs);
    // Ownership is resolved from a server-issued referral, never client teacher fields.
    if (data.referralId) {
      const { canChooseCampus, ...affiliation } = await resolveReferral(data.referralId);
      if (canChooseCampus) {
        if (!require('./organization').campuses.includes(data.campus)) throw new ApiError('请选择报名校区', 'INVALID_INPUT');
        affiliation.campus = data.campus;
      }
      Object.assign(clean, affiliation);
    }
    const now = isoNow();
    const registration = { _id: student._id, studentId: student._id, ...clean, status: 'pending', paymentStatus: 'pending', revision: 1, consentVersion: 'cloud-v1', createdAt: now, updatedAt: now };
    await withTransaction(db, async transaction => {
      registration.registrationYear = registrationYear(registration.createdAt);
      registration.studentNo = await allocateStudentNumber(db, transaction, registration.campus, registration.createdAt);
      await transaction.collection('registrations').add({ data: registration });
      await addNotification(transaction, {
        type: 'registration_completed', audience: 'admin', registrationId: student._id,
        registrationCreatedAt: now, version: 'submitted', createdAt: now
      });
    });
    await audit(student._id, 'registration_created', { programId: clean.programId });
    return { registration: publicRegistration(registration) };
  }
  if (action === 'update') {
    const programs = await fetchProgramCatalog();
    let saved;
    await withTransaction(db, async transaction => {
      const current = await transactionRegistration(transaction, student._id);
      if (current.status === 'approved') throw new ApiError('报名审核已通过，不能修改报名资料', 'INVALID_STATE');
      if (!Number.isSafeInteger(data.revision) || data.revision !== current.revision) throw new ApiError('报名资料已更新，请重新打开修改页面', 'REVISION_CONFLICT');
      const clean = validateRegistration(data, undefined, current, programs);
      const now = isoNow();
      const next = { ...clean, status: 'pending', reviewRemark: '', revision: current.revision + 1, updatedAt: now };
      await transaction.collection('registrations').doc(student._id).update({ data: next });
      await addNotification(transaction, { type: 'registration_updated', audience: 'admin', registrationId: student._id,
        registrationCreatedAt: current.createdAt, version: next.revision, createdAt: now });
      saved = { ...current, ...next };
    });
    await audit(student._id, 'registration_updated', { revision: saved.revision });
    return { registration: publicRegistration(saved) };
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
    const action = event && typeof event.action === 'string' ? event.action : '';
    const data = event && event.data && typeof event.data === 'object' ? event.data : {};
    if (action === 'catalog') return { ok: true, data: { demo: false, programs: await fetchProgramCatalog() } };
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw new ApiError('无法识别当前微信账号', 'LOGIN_REQUIRED');
    return { ok: true, data: await handle(action, data, OPENID) };
  } catch (error) {
    console.error('student-api failed', error.code || error.errCode || error.message);
    const known = error instanceof ApiError;
    return { ok: false, code: known ? error.code : 'CLOUD_ERROR', message: known ? error.message : '云服务暂时不可用，请稍后再试' };
  }
};
