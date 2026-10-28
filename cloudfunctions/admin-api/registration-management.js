const programs = require('./programs');
const { campuses, members, positions, memberById } = require('./organization');
const { membership, isManagement, canAccess } = require('./access');
const { randomBytes } = require('crypto');
const { normalizeRegistration } = require('./registration-normalization');

module.exports = function ({ db, ApiError, requirePermission, scopedRegistration, scope, publicRegistration, withTransaction }) {
  const fail = message => { throw new ApiError(message, 'INVALID_INPUT'); };
  function text(value, max, label, required = false) {
    if (value != null && typeof value !== 'string') fail(`${label}格式无效`);
    const result = (value || '').trim();
    if (result.length > max || (required && !result)) fail(`请填写${label}（不超过${max}字）`);
    return result;
  }
  function affiliation(admin, data, current) {
    const campus = text(data.campus, 30, '报名校区', true);
    if (!campuses.includes(campus)) fail('请选择有效的报名校区');
    let teacherId = text(data.teacherId, 100, '所属老师', true);
    if (!current && !isManagement(admin)) teacherId = membership(admin)?.id || '';
    const teacher = memberById(teacherId);
    if (!teacher) fail('请选择有效的所属老师');
    if (current && !isManagement(admin) && (campus !== current.campus || teacherId !== current.teacherId)) {
      throw new ApiError('调整校区或所属老师需由管理岗位操作', 'FORBIDDEN');
    }
    return { campus, teacherId, teacherName: teacher.name };
  }
  function cleanFields(data, current) {
    const next = {};
    for (const [key, max, label, required] of [
      ['name', 40, '姓名', true], ['phone', 11, '手机号', true], ['gender', 2, '性别'],
      ['ethnicity', 20, '民族'], ['education', 20, '学历'], ['workUnit', 100, '工作单位'],
      ['currentAddress', 160, '现居住地址'], ['politicalStatus', 20, '政治面貌'],
      ['emergencyName', 40, '第二联系人'], ['emergencyPhone', 11, '第二联系人电话'], ['classId', 100, '班级']
    ]) next[key] = text(data[key] === undefined ? current?.[key] : data[key], max, label, required);
    if (!/^1[3-9]\d{9}$/.test(next.phone)) fail('请填写有效的11位手机号');
    if (next.gender && !['男', '女'].includes(next.gender)) fail('性别无效');
    if ((next.emergencyName || next.emergencyPhone) && (!next.emergencyName || !/^1[3-9]\d{9}$/.test(next.emergencyPhone))) fail('请完整填写第二联系人姓名和手机号');
    for (const key of ['unionMember', 'veteran']) {
      if (data[key] != null && typeof data[key] !== 'boolean') fail('选项格式无效');
      if (data[key] != null) next[key] = data[key];
    }
    const rawLevel = text(data.level, 10, '报考层次', true);
    const rawSchool = text(data.school, 100, '学校', true);
    let normalized;
    try { normalized = normalizeRegistration({ school: rawSchool, level: rawLevel, isExamPrepClass: data.isExamPrepClass === undefined ? current?.isExamPrepClass : data.isExamPrepClass }); }
    catch (error) { fail(error.message); }
    const { school, level, isExamPrepClass } = normalized;
    if (!school) fail('请填写学校名称');
    if (data.isExamPrepClass !== undefined && typeof data.isExamPrepClass !== 'boolean') fail('高考复习班选项格式无效');
    next.isExamPrepClass = isExamPrepClass;
    if (rawSchool !== school && !current?.schoolOriginal) next.schoolOriginal = rawSchool;
    if (rawLevel !== level && !current?.levelOriginal) next.levelOriginal = rawLevel;
    const major = text(data.major, 100, '专业', true);
    const rule = programs.find(p => p.level === level);
    if (!rule) fail('请选择有效的报考层次');
    if (!current || current.level !== level || current.school !== school || current.major !== major) {
      const program = programs.find(p => p.level === level && p.school === school && p.major === major);
      Object.assign(next, { programId: program?.id || 'other', level, school, major,
        duration: rule.duration, fee: rule.fee, studyMode: '非脱产', examCategory: program?.examCategory || '—' });
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
    let saved;
    await withTransaction(db, async transaction => {
      const current = creating ? null : (await transaction.collection('registrations').doc(id).get()).data;
      if (!creating && (!current || !canAccess(admin, current))) throw new ApiError('记录不存在或不在授权范围内', 'FORBIDDEN');
      if (current && (!Number.isSafeInteger(data.revision) || current.revision !== data.revision)) throw new ApiError('资料已更新，请重新打开详情', 'REVISION_CONFLICT');
      const fields = { ...cleanFields(data, current), ...affiliation(admin, data, current) };
      const next = { ...fields, updatedAt, revision: (current?.revision || 0) + 1 };
      if (creating) Object.assign(next, { source: 'admin', createdBy: admin._id, createdAt: updatedAt, status: 'pending', paymentStatus: 'pending', materials: {} });
      // 仅调整归属不撤销审核；资料变动后重新待审核。
      else if (Object.keys(fields).some(key => !['campus', 'teacherId', 'teacherName', 'classId'].includes(key) && fields[key] !== (current[key] ?? ''))) next.status = 'pending';
      if (creating) await transaction.collection('registrations').doc(id).set({ data: next });
      else await transaction.collection('registrations').doc(id).update({ data: next });
      await transaction.collection('audit_logs').doc(`registration-edit-${id}-${next.revision}`).set({ data: {
        actorType: 'admin', actorId: admin._id, action: creating ? 'registration_created' : 'registration_edited',
        details: { registrationId: id, fields: Object.keys(fields), previousCampus: current?.campus || '', previousTeacherId: current?.teacherId || '', campus: fields.campus, teacherId: fields.teacherId }, createdAt: updatedAt
      } });
      saved = { ...current, ...next, _id: id };
    });
    return { registration: publicRegistration(saved) };
  }
  async function statistics(admin) {
    requirePermission(admin, 'registrations.view');
    const result = {};
    for (const field of ['campus', 'teacherId', 'level', 'school']) {
      const items = [];
      let offset = 0;
      while (true) {
        const page = await db.collection('registrations').aggregate().match(scope(admin))
          .group({ _id: `$${field}`, count: db.command.aggregate.sum(1) }).sort({ _id: 1 }).skip(offset).limit(200).end();
        items.push(...page.list.map(item => {
          const member = field === 'teacherId' ? memberById(item._id) : null;
          return { key: item._id || '', label: field === 'teacherId' ? (member ? `${member.name}（${member.campus || '管理岗位'}）` : '未分配') : item._id || '未分配', count: item.count };
        }));
        if (page.list.length < 200) break;
        offset += 200;
      }
      result[field] = items;
    }
    return { groups: result };
  }
  return { options, save, statistics };
};
