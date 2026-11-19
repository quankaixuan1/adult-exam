const { allocateStudentNumber } = require('./student-number');
const { paymentChanged } = require('./payment-change');
const registrationSchema = require('./registration-schema.json');
const programs = require('./programs');
const { campuses, members, positions, memberById } = require('./organization');
const { membership, isManagement, canAccess } = require('./access');
const { randomBytes, createHash, createCipheriv } = require('crypto');
const { validateIdNumber } = require('./id-number');
const { normalizeRegistration } = require('./registration-normalization');

module.exports = function ({ db, cloud, ApiError, requirePermission, scopedRegistration, scope, publicRegistration, withTransaction }) {
  const fail = message => { throw new ApiError(message, 'INVALID_INPUT'); };
  function text(value, max, label, required = false) {
    if (value != null && typeof value !== 'string') fail(`${label}格式无效`);
    const result = (value || '').trim();
    if (result.length > max || (required && !result)) fail(`请填写${label}（不超过${max}字）`);
    return result;
  }
  function affiliation(admin, data, current) {
    const campus = text(data.campus, 30, '报名校区');
    let teacherId = text(data.teacherId, 100, '所属老师', true);
    if (!current && !isManagement(admin)) teacherId = membership(admin)?.id || '';
    const teacher = memberById(teacherId);
    if (!teacher) fail('请选择有效的所属老师');
    if (!campuses.includes(campus)) fail('请选择有效的报名校区');
    if (current && !isManagement(admin) && (campus !== current.campus || teacherId !== current.teacherId)) {
      throw new ApiError('调整校区或所属老师需由管理岗位操作', 'FORBIDDEN');
    }
    return { campus, teacherId, teacherName: teacher.name };
  }
  function cleanFields(data, current) {
    const next = {};
    for (const [key, max, label, required] of [
      ['name', 40, '姓名', true], ['phone', 11, '手机号', true], ['gender', 2, '性别', true],
      ['ethnicity', 20, '民族', true], ['education', 20, '学历', true], ['workUnit', 100, '工作单位'],
      ['registrationSource', 20, '报名来源', true], ['referrer', 40, '介绍人'], ['note', 1000, '备注'], ['currentAddress', 160, '现居住地址', true], ['politicalStatus', 20, '政治面貌', true],
      ['emergencyName', 40, '第二联系人'], ['emergencyPhone', 11, '第二联系人电话']
    ]) next[key] = text(data[key] === undefined ? current?.[key] : data[key], max, label, required);
    if (!/^1[3-9]\d{9}$/.test(next.phone)) fail('请填写有效的11位手机号');
    if (!registrationSchema.educationOptions.includes(next.education)) fail('请选择当前学历');
    if (!registrationSchema.politicalOptions.includes(next.politicalStatus)) fail('请选择政治面貌');
    if (next.gender && !['男', '女'].includes(next.gender)) fail('性别无效');
    if ((next.emergencyName || next.emergencyPhone) && (!next.emergencyName || !/^1[3-9]\d{9}$/.test(next.emergencyPhone))) fail('请完整填写第二联系人姓名和手机号');
    for (const key of registrationSchema.booleanFields) {
      if (data[key] != null && typeof data[key] !== 'boolean') fail('选项格式无效');
      next[key] = data[key] === undefined ? (current?.[key] ?? null) : data[key];
    }
    if (next.registrationSource && !['大一', '大二', '大三', '新生', '续报', '渠道', '动员'].includes(next.registrationSource)) fail('请选择有效的报名来源');
    next.studyCampus = text(data.studyCampus === undefined ? current?.studyCampus : data.studyCampus, 30, '就读校区', true);
    if (!campuses.includes(next.studyCampus)) fail('请选择有效的就读校区');
    if (data.actualPaidAmount !== undefined) {
      if (data.actualPaidAmount === '' || data.actualPaidAmount === null) next.actualPaidAmount = null;
      else {
        const amount = String(data.actualPaidAmount);
        if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)) fail('实际缴费金额须为非负金额，最多两位小数');
        next.actualPaidAmount = Number(amount);
      }
    }
    if (data.paymentBreakdown != null) {
      const parts = data.paymentBreakdown;
      if (typeof parts !== 'object' || Array.isArray(parts)) fail('缴费明细格式无效');
      next.paymentBreakdown = {};
      let cents = 0;
      for (const [key, label] of [['exam', '考试费'], ['materials', '高复教材资料费'], ['tuition', '高复学费']]) {
        if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(parts[key] ?? ''))) fail(`请填写有效的${label}，最多两位小数`);
        next.paymentBreakdown[key] = Number(parts[key] ?? 0);
        cents += Math.round(Number(parts[key] ?? 0) * 100);
      }
      next.actualPaidAmount = cents / 100;
    }
    const idNumber = text(data.idNumber, 18, '身份证号').toUpperCase();
    if (!idNumber && !current?.idNumberEncrypted) fail('请填写身份证号');
    if (idNumber) {
      const error = validateIdNumber(idNumber);
      if (error) fail(error);
      const key = process.env.PII_ENCRYPTION_KEY || '';
      if (!/^[a-f0-9]{64}$/i.test(key)) throw new ApiError('敏感信息保护配置尚未完成，请联系管理员', 'SERVICE_CONFIG');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
      const encrypted = Buffer.concat([cipher.update(idNumber, 'utf8'), cipher.final()]);
      next.idNumberEncrypted = { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
      next.idNumberHash = createHash('sha256').update(`id:${idNumber}`).digest('hex');
      next.idNumberLast4 = idNumber.slice(-4);
    }
    const rawLevel = text(data.level, 10, '报考层次', true);
    const rawSchool = text(data.school, 100, '学校', true);
    let normalized;
    try { normalized = normalizeRegistration({ school: rawSchool, level: rawLevel }); }
    catch (error) { fail(error.message); }
    const { school, level } = normalized;
    if (!school) fail('请填写学校名称');
    if (rawSchool !== school && !current?.schoolOriginal) next.schoolOriginal = rawSchool;
    if (rawLevel !== level && !current?.levelOriginal) next.levelOriginal = rawLevel;
    const major = text(data.major, 100, '专业', true);
    const rule = programs.find(p => p.level === level);
    if (!rule) fail('请选择有效的报考层次');
    if (!current || current.level !== level || current.school !== school || current.major !== major) {
      const program = programs.find(p => p.level === level && p.school === school && p.major === major);
      Object.assign(next, { programId: program?.id || 'other', level, school, major,
        duration: program?.duration || rule.duration, fee: program?.fee ?? rule.fee,
        studyMode: program?.studyMode || rule.studyMode || '非脱产',
        examCategory: program?.examCategory || '—' });
    }
    return next;
  }
  async function options(admin) {
    requirePermission(admin, 'registrations.view');
    return { campuses, members, positions, programs, canAssign: isManagement(admin), memberId: membership(admin)?.id || '' };
  }
  async function save(admin, data) {
    const creating = !data.registrationId;
    requirePermission(admin, creating ? 'registrations.create' : 'registrations.edit');
    if (creating && !isManagement(admin) && !membership(admin)) throw new ApiError('请先绑定组织成员', 'FORBIDDEN');
    if (!creating) await scopedRegistration(admin, data.registrationId);
    const id = creating ? randomBytes(32).toString('hex') : data.registrationId;
    const updatedAt = new Date().toISOString();
    let saved; const uploadedFileIds = [];
    try {
    await withTransaction(db, async transaction => {
      const current = creating ? null : (await transaction.collection('registrations').doc(id).get()).data;
      if (!creating && (!current || !canAccess(admin, current))) throw new ApiError('记录不存在或不在授权范围内', 'FORBIDDEN');
      if (current && (!Number.isSafeInteger(data.revision) || current.revision !== data.revision)) throw new ApiError('资料已更新，请重新打开详情', 'REVISION_CONFLICT');
      const fields = { ...cleanFields(data, current), ...affiliation(admin, data, current) };
      const uploads = data.paymentProofUploads ?? (data.paymentProofUpload ? [data.paymentProofUpload] : []);
      if (!Array.isArray(uploads) || uploads.length > 5 || uploads.reduce((n, p) => n + (typeof p?.base64 === 'string' ? p.base64.length : 0), 0) > 2800000) fail('每次最多5张凭证，总大小不超过2MB');
      const proofs = [...(current?.paymentProofs || (current?.materials?.paymentProof ? [current.materials.paymentProof] : []))];
      for (const proof of uploads) {
        if (typeof proof.base64 !== 'string' || proof.base64.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(proof.base64)) fail('凭证图片无效或超过2MB');
        const bytes = Buffer.from(proof.base64, 'base64');
        const png = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
        const jpeg = bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
        if ((!png && !jpeg) || bytes.length > 2 * 1024 * 1024) fail('请上传2MB以内的PNG或JPG图片');
        const uploaded = await cloud.uploadFile({ cloudPath: `student-materials/${id}/paymentProof/${randomBytes(16).toString('hex')}.${png ? 'png' : 'jpg'}`, fileContent: bytes });
        uploadedFileIds.push(uploaded.fileID);
        fields.materials = { ...current?.materials, paymentProof: { fileId: uploaded.fileID, fileName: text(proof.fileName, 120, '文件名'), size: bytes.length, uploadedAt: updatedAt, uploadedBy: admin._id, status: 'pending' } };
      }
      if (uploads.length) fields.paymentProofs = [...proofs, ...uploadedFileIds.map((fileId, index) => ({ fileId, fileName: text(uploads[index].fileName, 120, '文件名'), recognitionDraft: Object.fromEntries(['paidAt', 'amount', 'transactionNo', 'channel', 'warning'].map(key => [key, String(uploads[index].recognitionDraft?.[key] || '').slice(0, 200)])), uploadedAt: updatedAt, uploadedBy: admin._id }))];
      const next = { ...fields, updatedAt, revision: (current?.revision || 0) + 1 };
      if (creating) Object.assign(next, { source: 'admin', createdBy: admin._id, createdAt: updatedAt, status: 'pending', paymentStatus: 'pending', materials: fields.materials || {} });
      // 仅调整归属不撤销审核；资料变动后重新待审核。
      else if (Object.keys(fields).some(key => !['campus', 'teacherId', 'teacherName', 'classId', 'actualPaidAmount', 'paymentBreakdown', 'paymentProofs', 'materials', 'note', 'registrationSource', 'referrer'].includes(key) && (fields[key] ?? '') !== (current[key] ?? ''))) next.status = 'pending';
      if (uploads.length || paymentChanged(current, fields)) {
        Object.assign(next, { paymentStatus: 'finance_pending', paymentRemark: '', paymentFinanceId: '', paymentFinanceReviewedAt: '' });
      }
      if (!current?.studentNo) next.studentNo = await allocateStudentNumber(db, transaction, fields.campus);
      if (creating) await transaction.collection('registrations').doc(id).set({ data: next });
      else await transaction.collection('registrations').doc(id).update({ data: next });
      await transaction.collection('audit_logs').doc(`registration-edit-${id}-${next.revision}`).set({ data: {
        actorType: 'admin', actorId: admin._id, action: creating ? 'registration_created' : 'registration_edited',
        details: { registrationId: id, fields: Object.keys(fields), previousCampus: current?.campus || '', previousTeacherId: current?.teacherId || '', campus: fields.campus, teacherId: fields.teacherId }, createdAt: updatedAt
      } });
      saved = { ...current, ...next, _id: id };
    });
    } catch (error) {
      if (uploadedFileIds.length) { try { await cloud.deleteFile({ fileList: uploadedFileIds }); } catch (_) {} }
      throw error;
    }
    return { registration: publicRegistration(saved) };
  }
  async function statistics(admin, data = {}) {
    requirePermission(admin, 'registrations.view');
    const { summarize, validateFilters } = require('./statistics');
    try { validateFilters(data); } catch (error) { fail(error.message); }
    const records = [];
    let offset = 0;
    while (true) {
      const page = await db.collection('registrations').where(scope(admin)).field({
        name: true, school: true, campus: true, teacherId: true, teacherName: true, level: true,
        createdAt: true, status: true, paymentStatus: true, paymentFinanceReviewedAt: true,
        actualPaidAmount: true, paymentBreakdown: true, paymentProofs: true
      }).orderBy('_id', 'asc').skip(offset).limit(100).get();
      records.push(...page.data);
      if (page.data.length < 100) break;
      offset += 100;
    }
    return summarize(records, data);
  }
  return { options, save, statistics };
};
