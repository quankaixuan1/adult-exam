const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../shared/registration-schema.json');
test('independently deployed registration schemas stay synchronized', () => {
  assert.deepEqual(require('../miniprogram/data/registration-schema'), schema, 'mini program JS module');
  for (const target of ['cloudfunctions/admin-api', 'cloudfunctions/student-api', 'admin/src/services']) {
    assert.deepEqual(require(`../${target}/registration-schema.json`), schema, target);
  }
});
test('registration groups contain each field once and preserve affiliation placement', () => {
  const fields = Object.values(schema.groups).flat();
  assert.equal(new Set(fields).size, fields.length);
  for (const field of ['campus', 'teacherId', 'registrationSource', 'referrer']) assert.ok(schema.groups.payment.includes(field));
  for (const field of schema.booleanFields) assert.ok(schema.groups.basic.includes(field));
});
