const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { canAccess, scopeFor } = require('../cloudfunctions/admin-api/access');
const { members, campuses } = require('../cloudfunctions/admin-api/organization');
const command = { in: values => ({ in: values }), or: values => ({ or: values }) };
function matches(row, query) {
  if (query.or) return query.or.some(rule => matches(row, rule));
  return Object.entries(query).every(([key, value]) => value?.in ? value.in.includes(row[key]) : row[key] === value);
}
test('queries and write authorization agree for every member, campus and owner', () => {
  for (const member of members) for (const campus of [...campuses, '']) for (const owner of [...members, { id: '' }]) {
    const admin = { _id: `account-${member.id}`, memberId: member.id, schools: ['院校A'], classIds: ['班级A'] };
    const record = { campus, teacherId: owner.id, school: '院校A', classId: '班级A' };
    const expected = !member.campus || member.id === owner.id || (member.position === 'campusLead' && member.campus === campus);
    assert.equal(canAccess(admin, record), expected);
    assert.equal(matches(record, scopeFor(admin, command)), expected);
    const prefixed = Object.fromEntries(Object.entries(record).map(([key, value]) => [`registration.${key}`, value]));
    assert.equal(matches(prefixed, scopeFor(admin, command, 'registration.')), expected);
  }
});
test('same-name teachers remain isolated and invalid membership cannot use legacy grants', () => {
  assert.equal(canAccess({ _id: 'a', memberId: 'chengxi-tu' }, { campus: '经济校区', teacherId: 'jingji-tu', teacherName: '屠老师' }), false);
  assert.equal(canAccess({ _id: 'a', memberId: 'deleted', schools: ['院校A'] }, { school: '院校A' }), false);
  assert.equal(canAccess({ _id: 'primary' }, {}), true);
  assert.equal(canAccess({ _id: 'legacy', schools: ['院校A'] }, { school: '院校A' }), true);
});
test('organization copies and deployed catalog stay synchronized', () => {
  const root = path.resolve(__dirname, '..');
  const canonical = fs.readFileSync(path.join(root, 'cloudfunctions/admin-api/organization.js'), 'utf8');
  for (const file of ['cloudfunctions/student-api/organization.js', 'miniprogram/data/organization.js']) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), canonical);
  assert.deepEqual(require('../cloudfunctions/admin-api/programs'), require('../miniprogram/data/programs'));
});
