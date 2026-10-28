const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { schoolAliases, normalizeRegistration, normalizationPatch } = require('../cloudfunctions/admin-api/registration-normalization');
const { decode, patchFor } = require('../scripts/normalize-registration-data');

test('school aliases and both bracket styles normalize without losing prep classification', () => {
  for (const [alias, full] of schoolAliases) for (const suffix of ['', '(高复)', '（高复）']) {
    const normalized = normalizeRegistration({ school: ` ${alias}${suffix} `, level: '高升本' });
    assert.deepEqual(normalized, { school: full, level: '高起本', isExamPrepClass: !!suffix });
    assert.equal(normalizeRegistration({ ...normalized }).school, full);
  }
  assert.equal(normalizeRegistration({ school: '杭州医学院（高复）' }).school, '杭州医学院');
  assert.equal(normalizeRegistration({ school: '待定' }).school, '待定');
  assert.throws(() => normalizeRegistration({ school: '杭电/商大' }), /多个院校/);
});
test('migration preserves originals, student names and existing flags; second run is empty', () => {
  const before = { school: '杭电(高复)', level: '高升本', name: '高复某', teacherName: '老师' };
  const patch = normalizationPatch(before);
  assert.equal(patch.schoolOriginal, '杭电(高复)');
  assert.equal(patch.levelOriginal, '高升本');
  assert.equal(patch.isExamPrepClass, true);
  assert.equal(patch.name, undefined);
  assert.deepEqual(normalizationPatch({ ...before, ...patch }), {});
  assert.equal(normalizeRegistration({ school: '杭州电子科技大学', schoolOriginal: '杭电（高复）' }).isExamPrepClass, true);
  assert.equal(normalizeRegistration({ school: '其它学校', name: '高复某' }).isExamPrepClass, false);
  assert.equal(normalizeRegistration({ school: '其它学校', isExamPrepClass: true }).isExamPrepClass, true);
});
test('migration normalizes old school grants and decodes database numeric types', () => {
  assert.deepEqual(patchFor('admins', { schools: ['杭电', '杭电(高复)', '商大'] }), { schools: ['杭州电子科技大学', '浙江工商大学'] });
  assert.deepEqual(decode([{ revision: { $numberInt: '2' } }]), [{ revision: 2 }]);
  assert.deepEqual(decode({ $numberLong: '9223372036854775807' }), { $numberLong: '9223372036854775807' });
});
test('normalization rules are identical across deployment packages', () => {
  const root = path.resolve(__dirname, '..');
  const expected = fs.readFileSync(path.join(root, 'cloudfunctions/admin-api/registration-normalization.js'), 'utf8');
  for (const file of ['cloudfunctions/student-api/registration-normalization.js', 'miniprogram/data/registration-normalization.js']) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), expected);
});
