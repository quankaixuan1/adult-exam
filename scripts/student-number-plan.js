const campusCodes = { '文一校区': 'WY', '下沙校区': 'XS', '经济校区': 'ZJ', '浙经校区': 'ZJ', '城西校区': 'CX' };
function planStudentNumbers(records, { campusField, year } = {}) {
  if (!['campus', 'studyCampus'].includes(campusField)) throw new Error('请指定报名校区或就读校区');
  if (year !== 'registration' && !/^\d{2}$/.test(year || '')) throw new Error('请指定两位年份或 registration');
  const groups = new Map(), skipped = [];
  for (const record of records) {
    const code = campusCodes[record[campusField]];
    const time = typeof record.createdAt === 'string' ? Date.parse(record.createdAt) : NaN;
    if (!code || !Number.isFinite(time)) { skipped.push({ id: record._id, reason: !code ? '校区缺失或无法识别' : '报名时间无效' }); continue; }
    const suffix = year === 'registration' ? String(new Date(time + 8 * 3600000).getUTCFullYear()).slice(-2) : year;
    const prefix = code + suffix;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push({ record, time });
  }
  const changes = [], counts = {};
  for (const [prefix, rows] of groups) {
    rows.sort((a, b) => a.time - b.time || String(a.record._id).localeCompare(String(b.record._id)));
    counts[prefix] = rows.length;
    rows.forEach(({ record }, index) => {
      const studentNo = `${prefix}-${String(index + 1).padStart(4, '0')}`;
      if (record.studentNo !== studentNo) changes.push({ id: record._id, before: record.studentNo ?? null, studentNo, createdAt: record.createdAt, campus: record[campusField] });
    });
  }
  return { changes, skipped, counts };
}
module.exports = { campusCodes, planStudentNumbers };
