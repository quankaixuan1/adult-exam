const { createHash } = require('node:crypto');
const { AppError } = require('./errors');
const { findProgram } = require('./catalog');
function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(400, '请填写报名信息');
  const clean = {};
  for (const [key, max] of [['name',40],['phone',11]]) {
    if (typeof data[key] !== 'string' || !data[key].trim() || data[key].trim().length > max) throw new AppError(400, '请完整填写姓名和手机号');
    clean[key] = data[key].trim();
  }
  if (!/^1[3-9]\d{9}$/.test(clean.phone)) throw new AppError(400, '请填写有效的11位手机号');
  const program = findProgram(data.programId);
  if (!program) throw new AppError(400, '请选择当前开放的学校和专业');
  if (data.consent !== true) throw new AppError(400, '请先阅读并同意信息使用说明');
  return { ...clean, ...program };
}
function createService(repository) {
  return {
    async register(data, student) {
      return repository.createForStudent({ ...validate(data), studentId: student.id, consentVersion:'local-v2', createdAt:new Date().toISOString() });
    },
    async mine(student) { return repository.findRegistrationByStudent(student.id); },
    async update(data, student) {
      if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1) throw new AppError(400, '请重新载入报名信息后修改');
      const allowed = ['phone','programId','revision','consent'];
      if (Object.keys(data).some(key => !allowed.includes(key))) throw new AppError(400, '姓名和账号归属等信息不能自行修改');
      const current = await repository.findRegistrationByStudent(student.id);
      if (!current) throw new AppError(404, '尚未提交报名信息');
      const clean = validate({ ...data, name: current.name });
      const result = await repository.updateForStudent(student.id, clean, data.revision, new Date().toISOString());
      if (!result) throw new AppError(409, '报名资料已更新，请返回后重新打开修改页面', 'REVISION_CONFLICT');
      return result;
    },
    async legacyStatus(token) {
      if (!/^[a-f0-9]{64}$/.test(token || '')) throw new AppError(401, '旧查询码无效');
      const hash = createHash('sha256').update(token).digest('hex');
      const result = await repository.findLegacyStatus(hash);
      if (!result) throw new AppError(404, '未找到旧报名记录，请检查查询码');
      return result;
    }
  };
}
module.exports = { createService };
