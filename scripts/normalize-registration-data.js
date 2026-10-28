// node scripts/normalize-registration-data.js preview
// node scripts/normalize-registration-data.js apply backups/<snapshot>.json
// Uses the local CloudBase login. No credentials or personal contact fields are exported.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { normalizationPatch, normalizeRegistration } = require('../cloudfunctions/admin-api/registration-normalization');
const env = 'cloud1-d2gcxozkl4c789619';
const fields = {
  registrations: ['school', 'level', 'schoolOriginal', 'levelOriginal', 'isExamPrepClass', 'revision', 'updatedAt'],
  admins: ['schools', 'sessionVersion', 'updatedAt']
};
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
function patchFor(table, row) {
  if (table === 'registrations') return normalizationPatch(row);
  const schools = Array.isArray(row.schools) ? [...new Set(row.schools.map(school => normalizeRegistration({ school }).school))] : [];
  return Array.isArray(row.schools) && JSON.stringify(schools) !== JSON.stringify(row.schools) ? { schools } : {};
}
function preview() {
  const snapshot = { env, createdAt: new Date().toISOString(), changes: [], counts: {}, summary: {} };
  for (const table of Object.keys(fields)) {
    const rows = readAll(table);
    snapshot.counts[table] = rows.length;
    for (const row of rows) {
      const patch = patchFor(table, row);
      if (Object.keys(patch).length) snapshot.changes.push({ table, before: row, patch });
    }
  }
  snapshot.summary = {
    registrationChanges: snapshot.changes.filter(c => c.table === 'registrations').length,
    schoolChanges: snapshot.changes.filter(c => c.table === 'registrations' && 'school' in c.patch).length,
    levelChanges: snapshot.changes.filter(c => c.table === 'registrations' && 'level' in c.patch).length,
    examPrepMarked: snapshot.changes.filter(c => c.patch.isExamPrepClass === true).length,
    accountScopeChanges: snapshot.changes.filter(c => c.table === 'admins').length
  };
  fs.mkdirSync(path.resolve(__dirname, '../backups'), { recursive: true, mode: 0o700 });
  const filename = path.resolve(__dirname, `../backups/registration-normalization-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ snapshot: filename, counts: snapshot.counts, summary: snapshot.summary }, null, 2));
}
function apply(filename) {
  const snapshot = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (snapshot.env !== env) throw new Error('Environment mismatch');
  let changed = 0, alreadyApplied = 0;
  for (const table of Object.keys(fields)) {
    const changes = snapshot.changes.filter(c => c.table === table);
    for (let index = 0; index < changes.length; index += 20) {
      const batch = changes.slice(index, index + 20);
      const live = query(table, { _id: { $in: batch.map(c => c.before._id) } });
      const pending = batch.filter(c => {
        const row = live.find(r => JSON.stringify(r._id) === JSON.stringify(c.before._id));
        if (!row) throw new Error('Record disappeared; prepare a new snapshot');
        if (Object.entries(c.patch).every(([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value))) { alreadyApplied++; return false; }
        for (const key of fields[table]) if (JSON.stringify(row[key]) !== JSON.stringify(c.before[key])) throw new Error('Concurrent change detected; prepare a new snapshot');
        return true;
      });
      if (!pending.length) continue;
      const updates = pending.map(c => {
        const versionKey = table === 'registrations' ? 'revision' : 'sessionVersion';
        const version = c.before[versionKey];
        if (table === 'registrations' && version !== undefined && (!Number.isSafeInteger(version) || version < 0)) throw new Error('Invalid record version');
        return { q: Object.fromEntries(['_id', ...fields[table]].map(key => [key, c.before[key] === undefined ? { $exists: false } : c.before[key]])),
          u: { $set: { ...c.patch, updatedAt: new Date().toISOString(), ...(table === 'admins' ? { sessionVersion: randomBytes(16).toString('hex') } : {}) }, ...(table === 'registrations' ? { $inc: { revision: 1 } } : {}) }, multi: false, upsert: false };
      });
      const result = run(table, 'UPDATE', { update: table, updates, ordered: true });
      if (result.writeErrors?.length || result.ok === 0) throw new Error(`Database update failed: ${JSON.stringify(result)}`);
      const checked = query(table, { _id: { $in: pending.map(c => c.before._id) } });
      for (const c of pending) {
        const row = checked.find(r => JSON.stringify(r._id) === JSON.stringify(c.before._id));
        if (!row || Object.entries(c.patch).some(([key, value]) => JSON.stringify(row[key]) !== JSON.stringify(value))) throw new Error('Post-write verification failed; snapshot retained');
      }
      changed += pending.length;
      console.log(JSON.stringify({ table, verifiedChanges: changed }));
    }
  }
  console.log(JSON.stringify({ complete: true, changed, alreadyApplied }));
}
if (require.main === module) {
  if (process.argv[2] === 'preview') preview();
  else if (process.argv[2] === 'apply' && process.argv[3]) apply(process.argv[3]);
  else throw new Error('Use preview, or apply <snapshot.json>');
}
module.exports = { decode, patchFor };
