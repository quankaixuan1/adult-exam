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

const programs = [
  {
    "id": "zjtie-gqz-kj",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "大数据与会计",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "zjtie-gqz-dz",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "电子商务",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "zjtie-gqz-sj",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "大数据技术",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-8a34be91e3851982",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "国际经济与贸易",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-4ade33782461a81f",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "金融服务与管理",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-e7b372d8aeeb4e09",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "酒店管理与数字化运营",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "zjtie-gqz-gs",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "工商企业管理",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-9c3fc2b1246f3d77",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "数字媒体技术",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "zjtie-gqz-sc",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "市场营销",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-3a88db8d1c1105df",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "智能控制技术",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-7d0ad62a1ff0819a",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "中小企业创业与经营",
    "examCategory": "文理兼招",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "zjtie-gqz-wlw",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "物联网应用技术",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-fd6113fcdd9d5e9f",
    "level": "高起专",
    "school": "浙江经济职业技术学院",
    "major": "汽车检测与维修技术",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-7175161735856eca",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "工商管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-d8361aa682818165",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "会计学",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-fe243555df1d95e6",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "人力资源管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-ea026fcd9fe9df9b",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "财务管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-7979f448a863f9a2",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "市场营销",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-9339245f6e3b72be",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "电子商务",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-ef0b6fc85408aaf0",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "行政管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-a5f920e84f6ba83d",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "酒店管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-578686311c6bb358",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "旅游管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-c45a290b076a6003",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "工程管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-da414fd796f4ecd2",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "物流管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-2e90e2fc02ba4c4f",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "国际经济与贸易",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-70bb4640bc07df8e",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "金融学",
    "examCategory": "文史类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-19211ebeb341637e",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "英语",
    "examCategory": "文史类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-8f52694df0d581ba",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "汉语言文学",
    "examCategory": "文史类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-6f2ca15bf75dc9ba",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "法学",
    "examCategory": "法学类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-45393c1e272dc415",
    "level": "专升本",
    "school": "浙江工商大学",
    "major": "社会工作",
    "examCategory": "法学类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-zsb-fx",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "法学",
    "examCategory": "法学类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-zsb-jx",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "机械设计制造及其自动化",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-6f8f9f0b3b2c1a07",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "车辆工程",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-zsb-dq",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "电气工程及其自动化",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-zsb-dzxx",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "电子信息工程",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-zsb-jsj",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "计算机科学与技术",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-6ee4b0345b74b959",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "软件工程",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-6622b52d1d89a523",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "网络工程",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-a71a9045e26170fc",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "数字媒体技术",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-zsb-ai",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "人工智能",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-e3735f89aea731f0",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "智能制造工程",
    "examCategory": "理工类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-d2de07fa46e30fa1",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "信息管理与信息系统",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-4a34eab791c76566",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "金融学",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-e321b08faf95457b",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "工商管理(含人力资源、物流管理、电子商务方向)",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-zsb-kj",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "会计学",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "program-b1f64b25e7e86093",
    "level": "专升本",
    "school": "杭州电子科技大学",
    "major": "财务管理",
    "examCategory": "经管类",
    "duration": "2.5年",
    "studyMode": "非脱产",
    "fee": 600
  },
  {
    "id": "hdu-gqb-jsj",
    "level": "高起本",
    "school": "杭州电子科技大学",
    "major": "计算机科学与技术",
    "examCategory": "理工类",
    "duration": "5年",
    "studyMode": "非脱产",
    "fee": 680
  },
  {
    "id": "hdu-gqb-gs",
    "level": "高起本",
    "school": "杭州电子科技大学",
    "major": "工商管理",
    "examCategory": "文史类",
    "duration": "5年",
    "studyMode": "非脱产",
    "fee": 680
  }
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
  campus: value.campus || '',
  teacherId: value.teacherId || '',
  teacherName: value.teacherName || '',
  school: value.school,
  isExamPrepClass: value.isExamPrepClass === true,
  level: value.level,
  major: value.major,
  duration: value.duration,
  studyMode: value.studyMode,
  examCategory: value.examCategory || '—',
  fee: value.fee,
  status: value.status,
  paymentStatus: value.paymentStatus || 'unknown',
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
  const idError = validateIdNumber(idNumber);
  if (idError) throw new ApiError(idError, 'INVALID_INPUT');
  if (!name || !['男', '女'].includes(gender) || !ethnicity) throw new ApiError('请完整填写有效的身份信息', 'INVALID_INPUT');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new ApiError('请填写有效的本人手机号', 'INVALID_INPUT');
  if ((emergencyName || emergencyPhone) && (!emergencyName || !/^1[3-9]\d{9}$/.test(emergencyPhone))) throw new ApiError('第二联系人如填写，请同时填写姓名和有效手机号', 'INVALID_INPUT');
  if (!education || !currentAddress || !politicalStatus) throw new ApiError('请完整填写学历、现居住地址和政治面貌', 'INVALID_INPUT');
  let program = programs.find(item => item.id === data.programId);
  if (data.programId === 'other') {
    const custom = data.customProgram || {};
    let normalized;
    try { normalized = normalizeRegistration({ level: text(custom.level, 10), school: text(custom.school, 100) }); }
    catch (error) { throw new ApiError(error.message, 'INVALID_INPUT'); }
    const { level, school, isExamPrepClass } = normalized;
    const major = text(custom.major, 100);
    const rule = programs.find(item => item.level === level);
    if (!rule || !school || !major) throw new ApiError('请选择有效层次并填写学校名称和专业名称（各不超过100字）', 'INVALID_INPUT');
    program = { id: 'other', level, school, major, duration: rule.duration, fee: rule.fee, studyMode: '非脱产', examCategory: '—', isExamPrepClass, ...(school !== text(custom.school, 100) ? { schoolOriginal: text(custom.school, 100) } : {}) };
  }
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
    programId: program.id, isExamPrepClass: false, ...program
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

async function handle(action, data, openId) {
  if (action === 'login') return login(openId);
  if (action === 'catalog') return { demo: false, programs };
  if (action === 'legacyStatus') throw new ApiError('旧查询码暂未迁移到云端，请联系机构工作人员', 'NOT_MIGRATED');

  const student = await requireStudent(openId);
  if (action === 'completeDemoPayment') return completeDemoPayment(student);
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
    const clean = validateRegistration(data);
    // 兼容旧客户端：没有归属的报名仅对全校区管理岗位可见，待其分配。
    if (data.campus || data.teacherId) {
      const teacher = organization.memberById(data.teacherId);
      if (!organization.campuses.includes(data.campus) || !teacher) throw new ApiError('请选择有效的报名校区和报名老师', 'INVALID_INPUT');
      Object.assign(clean, { campus: data.campus, teacherId: teacher.id, teacherName: teacher.name });
    }
    const now = isoNow();
    const registration = { _id: student._id, studentId: student._id, ...clean, status: 'pending', paymentStatus: 'pending', revision: 1, consentVersion: 'cloud-v1', createdAt: now, updatedAt: now };
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
    next.isExamPrepClass = current.isExamPrepClass === true || clean.isExamPrepClass === true;
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
