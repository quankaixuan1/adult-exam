const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const programs = require('../cloudfunctions/admin-api/programs');

async function page(draft = { name: '测试' }, catalogPrograms = programs) {
  let definition;
  const wx = {
    getStorageSync: () => draft,
    setStorageSync: (_, value) => { draft = value; },
    navigateTo: () => {}, redirectTo: () => {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/program/program.js'), 'utf8'), {
    require: name => name.includes('organization')
      ? require('../miniprogram/data/organization')
      : { catalog: async () => ({ programs: catalogPrograms }) },
    Page: value => { definition = value; },
    wx
  });
  definition.setData = function (value, callback) { Object.assign(this.data, value); callback?.(); };
  await definition.onLoad();
  return definition;
}
const choose = (p, method, index) => p[method]({ detail: { value: String(index) } });

test('submission does not require campus or teacher and clears hidden draft assignments', async () => {
  const p = await page({ name: '测试', program: programs[0], consent: true });
  p.submit();
  assert.equal(p.data.error, '');
  choose(p, 'chooseCampus', p.data.campuses.indexOf('下沙校区'));
  choose(p, 'chooseTeacher', p.data.teachers.findIndex(t => t.id === 'wenyi-rong'));
  p.submit();
  assert.equal(p.data.error, '');
  assert.equal(p.data.campus, '');
  assert.equal(p.data.teacherId, '');
  assert.equal(p.data.teacherLabel, '');
});

test('API catalog has unique IDs and the expanded Hangzhou Dianzi University majors', () => {
  assert.equal(programs.length, 51);
  assert.equal(new Set(programs.map(program => program.id)).size, programs.length);
  assert.deepEqual(
    programs
      .filter(program => program.school === '杭州电子科技大学' && program.level === '专升本' && program.major.includes('工商管理'))
      .map(program => program.major),
    ['工商管理', '工商管理（人力资源方向）', '工商管理（物流管理方向）', '工商管理（电子商务方向）']
  );
});

test('all API programs are reachable through level, school, major', async () => {
  for (const program of programs) {
    const p = await page();
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

test('custom schools use level pricing, validate names, restore drafts and reset on changes', async () => {
  for (const level of ['高起专', '专升本', '高起本']) {
    const p = await page();
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
    const restored = await page({ name: '测试', program: p.data.program, consent: true, campus: '下沙校区', teacherId: 'wenyi-rong' });
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

test('restores valid drafts and rejects removed program selections', async () => {
  for (const program of programs) {
    const p = await page({ name: '测试', program, consent: true });
    assert.equal(p.data.program.id, program.id);
    assert.ok(p.data.schools.includes(program.school));
    assert.ok(p.data.majors.includes(program));
    assert.equal(p.data.levels.length, 3);
  }
  const p = await page({ name: '测试', program: { id: 'hdu-zsb-rl' }, consent: true });
  assert.equal(p.data.program, null);
  assert.equal(p.data.school, '');
  p.submit();
  assert.match(p.data.error, /请依次选择/);
});

test('catalog failures are shown and do not erase a saved program draft', async () => {
  const draft = { name: '测试', program: programs[0], consent: true };
  const p = await page(draft, []);
  assert.match(p.data.error, /招生专业列表暂时不可用/);
  p.onUnload();
  assert.equal(draft.program.id, programs[0].id);
  assert.equal(p.data.program, null);
});
