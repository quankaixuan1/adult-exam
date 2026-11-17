const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { planStudentNumbers } = require('./student-number-plan');
const env = 'cloud1-d2gcxozkl4c789619';
const fields = { registrations: ['campus', 'createdAt', 'studentNo', 'revision'] };
function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    for (const type of ['$numberInt', '$numberLong']) if (Object.keys(value).length === 1 && type in value) {
      const number = Number(value[type]);
      // Mongo operation timestamps may be 64-bit values. Preserve their exact
      // extended JSON instead of coercing them to an imprecise JS number.
      if (!Number.isSafeInteger(number)) return value;
      return number;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }
  return value;
}
function run(table, type, command) {
  const output = execFileSync('tcb', ['-e', env, 'db', 'nosql', 'execute', '--json', '--command', JSON.stringify([{ TableName: table, CommandType: type, Command: JSON.stringify(command) }])], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, timeout: 60000 });
  const parsed = JSON.parse(output.slice(output.indexOf('{')));
  if (parsed.error) throw new Error(parsed.error.message);
  const result = decode((parsed.data || parsed).results?.[0]);
  if (result == null) throw new Error('Missing database response');
  return result;
}
function query(table, filter = {}, skip = 0, limit = 200) {
  const response = run(table, 'QUERY', { find: table, filter, projection: Object.fromEntries(['_id', ...fields[table]].map(key => [key, 1])), sort: { _id: 1 }, skip, limit });
  const rows = Array.isArray(response) ? response : response.cursor?.firstBatch;
  if (!Array.isArray(rows)) throw new Error('Unexpected query response');
  return rows;
}
function readAll(table) {
  const rows = [];
  for (let skip = 0; ; skip += 200) {
    const batch = query(table, {}, skip);
    rows.push(...batch);
    if (batch.length < 200) break;
  }
  return rows;
}

const snapshotPath = path.resolve(process.argv[3] || 'backups/student-numbers-2027.json');
const records = readAll('registrations');
if (process.argv[2] === 'preview') {
  const plan = planStudentNumbers(records, { campusField: 'campus', year: '27' });
  const snapshot = { env, generatedAt: new Date().toISOString(), records, ...plan };
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ snapshotPath, total: records.length, changes: plan.changes.length, skipped: plan.skipped.length, counts: plan.counts }));
} else if (process.argv[2] === 'apply') {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (snapshot.env !== env) throw new Error('Environment mismatch');
  if (JSON.stringify(records) !== JSON.stringify(snapshot.records)) throw new Error('Records changed; regenerate preview');
  const targets = new Set(snapshot.changes.map(c => c.studentNo));
  const changing = new Set(snapshot.changes.map(c => c.id));
  if (records.some(r => !changing.has(r._id) && targets.has(r.studentNo))) throw new Error('Existing number collision');
  for (let i = 0; i < snapshot.changes.length; i += 20) {
    const changes = snapshot.changes.slice(i, i + 20);
    const updates = changes.map(c => {
      const old = snapshot.records.find(r => r._id === c.id);
      return { q: Object.fromEntries(['_id', ...fields.registrations].map(k => [k, old[k] === undefined ? { $exists: false } : old[k]])), u: { $set: { studentNo: c.studentNo }, $inc: { revision: 1 } }, multi: false, upsert: false };
    });
    const result = run('registrations', 'UPDATE', { update: 'registrations', updates, ordered: true });
    if (result.writeErrors?.length || result.ok === 0) throw new Error('Update failed; snapshot retained');
    const checked = query('registrations', { _id: { $in: changes.map(c => c.id) } });
    if (changes.some(c => checked.find(r => r._id === c.id)?.studentNo !== c.studentNo)) throw new Error('Verification failed; snapshot retained');
    console.log(JSON.stringify({ verified: i + changes.length }));
  }
  console.log(JSON.stringify({ complete: true, updated: snapshot.changes.length, skipped: snapshot.skipped.length, counts: snapshot.counts }));
} else throw new Error('Use preview or apply <snapshot>');
