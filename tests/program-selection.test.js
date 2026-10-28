const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const programs = require('../miniprogram/data/programs');
const root = path.resolve(__dirname, '..');

function page(draft = { name: '测试' }) {
  let definition;
  const wx = {
    getStorageSync: () => draft,
    setStorageSync: (_, value) => { draft = value; },
    navigateTo: () => {}, redirectTo: () => {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/program/program.js'), 'utf8'), {
    require: name => name.includes('organization') ? require('../miniprogram/data/organization') : programs, Page: value => { definition = value; }, wx
  });
  definition.setData = function (value, callback) { Object.assign(this.data, value); callback?.(); };
  definition.onLoad();
  return definition;
}
const choose = (p, method, index) => p[method]({ detail: { value: String(index) } });

test('campus and teacher are independent for cross-campus enrollment and restored from draft', () => {
  const p = page({ name: '测试', program: programs[0], consent: true });
  p.submit();
  assert.match(p.data.error, /请选择报名校区和报名老师/);
  choose(p, 'chooseCampus', p.data.campuses.indexOf('下沙校区'));
  choose(p, 'chooseTeacher', p.data.teachers.findIndex(t => t.id === 'wenyi-rong'));
  p.submit();
  assert.equal(p.data.error, '');
  const restored = page({ name: '测试', program: programs[0], campus: p.data.campus, teacherId: p.data.teacherId });
  assert.equal(restored.data.campus, '下沙校区');
  assert.equal(restored.data.teacherId, 'wenyi-rong');
  assert.match(restored.data.teacherLabel, /文一校区/);
});

test('frontend and backend catalogs agree and have unique IDs', () => {
  const source = fs.readFileSync(path.join(root, 'cloudfunctions/student-api/index.js'), 'utf8');
  const server = JSON.parse(source.match(/const programs = (\[[\s\S]*?\n\]);/)[1]);
  assert.deepEqual(server, programs);
  assert.equal(programs.length, 48);
  assert.equal(new Set(programs.map(p => p.id)).size, programs.length);
});

test('all programs are reachable through level, school, major', () => {
  for (const program of programs) {
    const p = page();
    assert.equal(p.data.schools.length, 0);
    choose(p, 'chooseLevel', p.data.levels.indexOf(program.level));
    assert.ok(p.data.schools.every(s => s === '其它' || programs.some(item => item.level === program.level && item.school === s)));
    choose(p, 'chooseSchool', p.data.schools.indexOf(program.school));
    assert.ok(p.data.majors.every(item => item.level === program.level && item.school === program.school));
    choose(p, 'chooseMajor', p.data.majors.indexOf(program));
    assert.equal(p.data.program.id, program.id);
    choose(p, 'chooseSchool', 0);
    assert.equal(p.data.program, null);
    choose(p, 'chooseLevel', 0);
    assert.equal(p.data.school, '');
    assert.equal(p.data.majors.length, 0);
    assert.equal(p.data.program, null);
  }
});

test('custom schools use level pricing, validate names, restore drafts and reset on changes', () => {
  for (const level of ['高起专', '专升本', '高起本']) {
    const p = page();
    choose(p, 'chooseLevel', p.data.levels.indexOf(level));
    choose(p, 'chooseSchool', p.data.schools.indexOf('其它'));
    assert.equal(p.data.program.fee, level === '高起本' ? 680 : 600);
    assert.equal(p.data.program.duration, level === '高起本' ? '5年' : '2.5年');
    p.submit();
    assert.match(p.data.error, /请填写学校名称/);
    p.inputCustomSchool({ detail: { value: ' 测试大学 ' } });
    p.inputCustomMajor({ detail: { value: ' 测试专业 ' } });
    assert.equal(p.data.program.school, '测试大学');
    assert.equal(p.data.program.major, '测试专业');
    assert.equal(p.data.program.studyMode, '非脱产');
    assert.equal(p.data.program.examCategory, '—');
    const restored = page({ name: '测试', program: p.data.program, consent: true, campus: '下沙校区', teacherId: 'wenyi-rong' });
    assert.equal(restored.data.school, '其它');
    assert.equal(restored.data.customSchool, '测试大学');
    restored.submit();
    assert.equal(restored.data.error, '');
    choose(p, 'chooseSchool', 0);
    assert.equal(p.data.customSchool, '');
    assert.equal(p.data.program, null);
    choose(restored, 'chooseLevel', 0);
    assert.equal(restored.data.customMajor, '');
    assert.equal(restored.data.program, null);
  }
});

test('restores valid drafts and rejects removed program selections', () => {
  for (const program of programs) {
    const p = page({ name: '测试', program, consent: true });
    assert.equal(p.data.program.id, program.id);
    assert.ok(p.data.schools.includes(program.school));
    assert.ok(p.data.majors.includes(program));
    assert.equal(p.data.levels.length, 3);
  }
  const p = page({ name: '测试', program: { id: 'hdu-zsb-rl' }, consent: true });
  assert.equal(p.data.program, null);
  assert.equal(p.data.school, '');
  p.submit();
  assert.match(p.data.error, /请依次选择/);
});
