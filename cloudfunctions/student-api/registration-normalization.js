const schoolAliases = [
  ['杭电', '杭州电子科技大学'], ['杭医', '杭州医学院'], ['商大', '浙江工商大学'],
  ['浙工大', '浙江工业大学'], ['浙经院', '浙江经济职业技术学院'], ['浙科', '浙江科技大学']
];

function normalizeRegistration(record) {
  const school = typeof record.school === 'string' ? record.school.trim() : '';
  const matches = schoolAliases.filter(([alias, full]) => school.includes(alias) || school.includes(full));
  if (matches.length > 1) throw new Error('学校名称包含多个院校，请人工核对');
  const normalizedSchool = matches[0]?.[1] || school.replace(/[（(]\s*高复\s*[）)]/g, '').replace(/高复/g, '').trim();
  const level = typeof record.level === 'string' ? record.level.trim().replace(/高升本/g, '高起本') : '';
  const isExamPrepClass = record.isExamPrepClass === true || /高复/.test(school) || /高复/.test(record.schoolOriginal || '');
  return { school: normalizedSchool, level, isExamPrepClass };
}

function normalizationPatch(record) {
  const normalized = normalizeRegistration(record);
  const patch = {};
  for (const key of Object.keys(normalized)) {
    if (normalized[key] !== record[key]) patch[key] = normalized[key];
  }
  if ('school' in patch && !record.schoolOriginal) patch.schoolOriginal = record.school || '';
  if ('level' in patch && !record.levelOriginal) patch.levelOriginal = record.level || '';
  return patch;
}
module.exports = { schoolAliases, normalizeRegistration, normalizationPatch };
