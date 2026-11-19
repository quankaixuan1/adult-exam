const codes = { '文一校区': 'WY', '下沙校区': 'XS', '经济校区': 'ZJ', '浙经校区': 'ZJ', '城西校区': 'CX' };
// Shared transactional sequence documents live in the server-only audit collection.
async function allocateStudentNumber(db, transaction, campus) {
  const code = codes[campus];
  if (!code) return ''; // Assignment is deferred until the registration has a campus.
  const prefix = `${code}27`;
  const counter = transaction.collection('audit_logs').doc(`student-number-sequence-${prefix}`);
  let state;
  try { state = (await counter.get()).data; }
  catch (e) { if (!/not exist|DOCUMENT_NOT_FOUND/i.test(e.errMsg || e.message || '')) throw e; }
  let last = state?.lastNumber || 0;
  if (!state) {
    const result = await db.collection('registrations').where({ studentNo: db.RegExp({ regexp: `^${prefix}-[0-9]+$`, options: '' }) }).orderBy('studentNo', 'desc').limit(1).get();
    last = Number(result.data[0]?.studentNo?.split('-')[1] || 0);
  }
  if (!Number.isSafeInteger(last) || last < 0 || last >= 9999) throw new Error('学号序号异常或已满，请联系管理员');
  const next = last + 1;
  await counter.set({ data: { action: 'student_number_sequence', prefix, lastNumber: next, updatedAt: new Date().toISOString() } });
  return `${prefix}-${String(next).padStart(4, '0')}`;
}
module.exports = { allocateStudentNumber };
