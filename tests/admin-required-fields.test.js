const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const file = path.resolve(__dirname, '../cloudfunctions/admin-api/registration-management.js');
const source = fs.readFileSync(file, 'utf8').replace('return { options, save, statistics };', 'return { cleanFields };');
const sandbox = { require: createRequire(file), module: { exports: {} }, process, Buffer };
vm.runInNewContext(source, sandbox);
const { cleanFields } = sandbox.module.exports({ ApiError: Error });
const { campuses } = require('../cloudfunctions/admin-api/organization');
const valid = { studyCampus: campuses[0], registrationSource: '新生', name: '测试', phone: '13800000000', gender: '女', ethnicity: '汉族', education: '专科', currentAddress: '测试地址', politicalStatus: '群众', level: '专升本', school: '测试学校', major: '测试专业' };
const current = { idNumberEncrypted: { data: 'existing' } };
test('admin requires the same personal fields as student signup', () => {
  for (const key of ['name', 'phone', 'gender', 'ethnicity', 'education', 'currentAddress', 'politicalStatus', 'studyCampus', 'registrationSource']) {
    assert.throws(() => cleanFields({ ...valid, [key]: '' }, current), undefined, key);
  }
  assert.throws(() => cleanFields(valid, null), /身份证/);
  assert.throws(() => cleanFields({ ...valid, education: '无效选项' }, current), /学历/);
});
test('existing encrypted identity can be retained and optional fields stay optional', () => {
  const result = cleanFields(valid, current);
  assert.equal(result.name, valid.name);
  assert.equal(result.idNumberEncrypted, undefined);
  assert.equal(result.workUnit, '');
  assert.throws(() => cleanFields({ ...valid, emergencyName: '联系人' }, current), /第二联系人/);
});
