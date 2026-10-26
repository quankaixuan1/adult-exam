const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const studentId = createHash('sha256').update('student:test-openid').digest('hex');
const clone = value => structuredClone(value);
const get = (object, key) => key.split('.').reduce((value, part) => value?.[part], object);
function set(object, key, value) {
  const parts = key.split('.');
  const leaf = parts.pop();
  for (const part of parts) object = object[part] || (object[part] = {});
  object[leaf] = clone(value);
}
function matches(row, rule) {
  if (rule.$and) return rule.$and.every(item => matches(row, item));
  if (rule.$or) return rule.$or.some(item => matches(row, item));
  return Object.entries(rule).every(([key, value]) => {
    const actual = get(row, key);
    if (value?.$exists !== undefined) return (actual !== undefined) === value.$exists;
    if (value?.$in) return value.$in.includes(actual);
    return actual === value;
  });
}
function sorted(rows, orders) {
  return rows.sort((a, b) => {
    for (const [field, direction] of orders) {
      const x = get(a, field), y = get(b, field);
      if (x !== y) return (x < y ? -1 : 1) * direction;
    }
    return 0;
  });
}

function memoryDatabase(seed = {}) {
  let state = new Map(['registrations', 'students', 'notification_events', 'audit_logs'].map(name => [name, new Map()]));
  for (const [name, rows] of Object.entries(seed)) state.set(name, new Map(rows.map(row => [row._id, clone(row)])));
  let version = 0, counter = 0;
  const db = {
    failNotifications: false,
    command: { and: list => ({ $and: list }), or: list => ({ $or: list }), in: list => ({ $in: list }), exists: value => ({ $exists: value }), aggregate: { eq: values => ({ $eq: values }) } },
    rows: name => [...state.get(name).values()].map(clone),
    mutate(name, id, changes) { Object.assign(state.get(name).get(id), changes); version += 1; },
    remove(name, id) { state.get(name).delete(id); version += 1; }
  };
  function collection(name, snapshot) {
    const store = () => (snapshot || state).get(name);
    const changed = () => { if (!snapshot) version += 1; };
    const check = () => { if (db.failNotifications && name === 'notification_events') throw new Error('notification write failed'); };
    return {
      doc(id) {
        return {
          async get() { return { data: store().has(id) ? clone(store().get(id)) : null }; },
          async set({ data }) { check(); store().set(id, { ...clone(data), _id: id }); changed(); return { stats: { created: 1 } }; },
          async update({ data }) {
            check(); const row = store().get(id);
            if (!row) return { stats: { updated: 0 } };
            for (const [key, value] of Object.entries(data)) set(row, key, value);
            changed(); return { stats: { updated: 1 } };
          }
        };
      },
      async add({ data }) {
        const id = data._id || `generated-${++counter}`;
        if (store().has(id)) throw new Error('duplicate');
        await this.doc(id).set({ data });
        return { _id: id };
      },
      where(rule) {
        let size = 100;
        return { limit(n) { size = n; return this; }, async get() { return { data: [...store().values()].filter(row => matches(row, rule)).slice(0, size).map(clone) }; } };
      },
      aggregate() {
        const stages = [];
        const pipeline = {};
        for (const method of ['match', 'lookup', 'unwind', 'addFields', 'sort', 'limit', 'project', 'count']) {
          pipeline[method] = value => { stages.push([method, value]); return pipeline; };
        }
        pipeline.end = async () => {
          let rows = [...store().values()].map(clone);
          for (const [method, value] of stages) {
            if (method === 'match') rows = rows.filter(row => matches(row, value));
            if (method === 'lookup') rows = rows.map(row => ({ ...row, [value.as]: [...state.get(value.from).values()].filter(other => get(other, value.foreignField) === get(row, value.localField)).map(clone) }));
            if (method === 'unwind') {
              const key = value.slice(1);
              rows = rows.flatMap(row => get(row, key).map(item => ({ ...row, [key]: item })));
            }
            if (method === 'sort') rows = sorted(rows, Object.entries(value));
            if (method === 'addFields') rows = rows.map(row => ({ ...row, ...Object.fromEntries(Object.entries(value).map(([key, expression]) => {
              const [a, b] = expression.$eq.map(field => get(row, field.slice(1)));
              return [key, a === b];
            })) }));
            if (method === 'limit') rows = rows.slice(0, value);
            if (method === 'project') rows = rows.map(row => Object.fromEntries(Object.entries(value).map(([key, expression]) => [key, expression === 1 ? row[key] : get(row, expression.slice(1))])));
            if (method === 'count') rows = rows.length ? [{ [value]: rows.length }] : [];
          }
          return { list: rows };
        };
        return pipeline;
      }
    };
  }
  db.collection = name => collection(name);
  db.startTransaction = async () => {
    const snapshot = clone(state), originalVersion = version;
    return {
      collection: name => collection(name, snapshot),
      async commit() { if (version !== originalVersion) throw new Error('transaction conflict'); state = snapshot; version += 1; },
      async rollback() {}
    };
  };
  return db;
}

function loadApi(name, db) {
  const directory = path.join(root, 'cloudfunctions', name);
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'test-openid' }), deleteFile: async () => ({}) };
  const context = vm.createContext({
    require: name => name === 'wx-server-sdk' ? cloud : name.startsWith('./') ? require(path.join(directory, name)) : require(name),
    exports: {}, Buffer, process: { env: { PII_ENCRYPTION_KEY: '1'.repeat(64) } }, console: { error() {} }
  });
  const exposed = name === 'student-api' ? 'handle, completeDemoPayment, saveMaterial, studentInbox' : 'review, adminInbox';
  vm.runInContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8') + `\nthis.testApi = { ${exposed} };`, context);
  return { ...context.testApi, main: context.exports.main };
}

function registration(overrides = {}) {
  return { _id: studentId, studentId, name: '测试考生', school: '学校A', classId: 'A1', status: 'pending', revision: 1,
    paymentStatus: 'pending', createdAt: '2026-10-23T00:00:00.000Z', materials: {}, ...overrides };
}
const admin = { _id: 'staff-a', permissions: ['registrations.view', 'registrations.review'], schools: ['学校A'], classIds: [] };

test('custom programs submit with server-owned fees and reject invalid fields', async () => {
  const base = {
    name: '测试考生', phone: '13800000000', idNumber: '11010519491231002X', gender: '女', ethnicity: '汉',
    education: '高中', currentAddress: '测试地址', politicalStatus: '群众', consent: true, programId: 'other'
  };
  for (const level of ['高起专', '专升本', '高起本']) {
    const db = memoryDatabase({ students: [{ _id: studentId }] });
    const api = loadApi('student-api', db);
    const result = await api.main({ action: 'register', data: { ...base, fee: 1,
      customProgram: { level, school: ' 测试大学 ', major: ' 测试专业 ', fee: 1, duration: '1年', studyMode: '伪造' }
    } });
    assert.equal(result.ok, true);
    const saved = result.data.registration;
    assert.equal(saved.school, '测试大学');
    assert.equal(saved.major, '测试专业');
    assert.equal(saved.fee, level === '高起本' ? 680 : 600);
    assert.equal(saved.duration, level === '高起本' ? '5年' : '2.5年');
    assert.equal(saved.studyMode, '非脱产');
    assert.equal(saved.examCategory, '—');
    assert.equal(db.rows('registrations')[0].examCategory, '—');
  }
  for (const customProgram of [undefined, { level: '其它', school: '学校', major: '专业' },
    { level: '专升本', school: ' ', major: '专业' }, { level: '专升本', school: '学校', major: '' },
    { level: '专升本', school: '学'.repeat(101), major: '专业' }]) {
    const db = memoryDatabase({ students: [{ _id: studentId }] });
    const result = await loadApi('student-api', db).main({ action: 'register', data: { ...base, customProgram } });
    assert.equal(result.ok, false);
    assert.equal(db.rows('registrations').length, 0);
  }
});

test('saving a registration does not notify; simulated payment notifies exactly once', async () => {
  const db = memoryDatabase({ students: [{ _id: studentId }] });
  const student = loadApi('student-api', db), backend = loadApi('admin-api', db);
  const saved = await student.main({ action: 'register', data: {
    name: '测试考生', phone: '13800000000', idNumber: '11010519491231002X', gender: '女', ethnicity: '汉',
    education: '高中', currentAddress: '测试地址', politicalStatus: '群众', consent: true, programId: 'hdu-gqb-gs'
  } });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.registration.paymentStatus, 'pending');
  assert.equal(db.rows('notification_events').length, 0);
  const paid = await student.main({ action: 'completeDemoPayment' });
  assert.equal(paid.ok, true);
  assert.equal(paid.data.registration.paymentStatus, 'demo_completed');
  const inbox = backend.adminInbox({ _id: 'primary' });
  const first = await inbox.list();
  assert.equal(first.unreadTotal, 1);
  await inbox.read(first.notifications[0].id);
  await student.main({ action: 'completeDemoPayment' });
  assert.equal(db.rows('notification_events').length, 1);
  assert.equal((await inbox.list()).unreadTotal, 0, 'retry must not clear existing read state');
});

test('material save preserves other files, reopens review, and deduplicates retries', async () => {
  const db = memoryDatabase({ registrations: [registration({ status: 'approved', reviewRemark: '旧备注', materials: { idFront: { fileId: 'existing-front' } } })] });
  const student = loadApi('student-api', db);
  const fileId = `cloud://env/student-materials/${studentId}/photo/new.jpg`;
  await student.saveMaterial({ _id: studentId }, { kind: 'photo', fileId, fileName: 'photo.jpg', size: 100 });
  const current = db.rows('registrations')[0];
  assert.equal(current.status, 'pending');
  assert.equal(current.reviewRemark, '');
  assert.equal(current.revision, 2);
  assert.equal(current.materials.idFront.fileId, 'existing-front');
  await student.saveMaterial({ _id: studentId }, { kind: 'photo', fileId, fileName: 'photo.jpg', size: 100 });
  assert.equal(db.rows('notification_events').length, 1);
  assert.equal(db.rows('registrations')[0].revision, 2);
});

test('admin unread state is independent and current scope is checked on list and read', async () => {
  const db = memoryDatabase({ registrations: [registration()] });
  const student = loadApi('student-api', db), backend = loadApi('admin-api', db);
  await student.completeDemoPayment({ _id: studentId });
  const first = backend.adminInbox(admin), second = backend.adminInbox({ ...admin, _id: 'staff-b' });
  const id = (await first.list()).notifications[0].id;
  await first.read(id);
  assert.equal((await first.list()).unreadTotal, 0);
  assert.equal((await second.list()).unreadTotal, 1);
  db.mutate('registrations', studentId, { school: '学校B' });
  assert.equal((await second.list()).unreadTotal, 0);
  await assert.rejects(second.read(id), error => error.code === 'FORBIDDEN');
  const classAdmin = backend.adminInbox({ ...admin, _id: 'class-admin', schools: [], classIds: ['A1'] });
  assert.equal((await classAdmin.list()).unreadTotal, 1);
  assert.throws(() => backend.adminInbox({ ...admin, permissions: [] }), error => error.code === 'FORBIDDEN');
});

test('review notices include new remarks, belong only to the student, and reject stale versions', async () => {
  const db = memoryDatabase({ registrations: [registration()] });
  const backend = loadApi('admin-api', db), student = loadApi('student-api', db);
  await backend.review(admin, { registrationId: studentId, revision: 1, status: 'rejected', remark: '请补交材料' });
  const inbox = student.studentInbox({ _id: studentId });
  let result = await inbox.list();
  assert.equal(result.unreadTotal, 1);
  assert.equal(result.notifications[0].remark, '请补交材料');
  const stranger = student.studentInbox({ _id: 'b'.repeat(64) });
  assert.equal((await stranger.list()).unreadTotal, 0);
  await assert.rejects(stranger.read(result.notifications[0].id), error => error.code === 'FORBIDDEN');
  await assert.rejects(backend.review(admin, { registrationId: studentId, revision: 1, status: 'approved' }), error => error.code === 'REVISION_CONFLICT');
  await backend.review(admin, { registrationId: studentId, revision: 2, status: 'rejected', remark: '请补交材料' });
  assert.equal(db.rows('notification_events').length, 1, 'unchanged review must not notify again');
  await backend.review(admin, { registrationId: studentId, revision: 2, status: 'rejected', remark: '请补交清晰的材料' });
  assert.equal((await inbox.list()).unreadTotal, 2, 'same status with changed remark is a new event');
  await inbox.read(result.notifications[0].id);
  await inbox.read(result.notifications[0].id);
  assert.equal((await inbox.list()).unreadTotal, 1);
  db.remove('registrations', studentId);
  assert.equal((await inbox.list()).unreadTotal, 0, 'deleted registrations must not remain visible');
});

test('resetting and recreating a registration does not resurrect old notifications', async () => {
  const db = memoryDatabase({ registrations: [registration()] });
  const student = loadApi('student-api', db), backend = loadApi('admin-api', db);
  await student.completeDemoPayment({ _id: studentId });
  assert.equal((await backend.adminInbox(admin).list()).unreadTotal, 1);
  db.mutate('registrations', studentId, { createdAt: '2026-10-24T00:00:00.000Z', paymentStatus: 'pending' });
  assert.equal((await backend.adminInbox(admin).list()).unreadTotal, 0);
  await student.completeDemoPayment({ _id: studentId });
  assert.equal((await backend.adminInbox(admin).list()).unreadTotal, 1);
});

test('notification failures roll back payment, material, and review changes', async () => {
  for (const operation of ['payment', 'material', 'review']) {
    const original = registration();
    const db = memoryDatabase({ registrations: [original] });
    db.failNotifications = true;
    const student = loadApi('student-api', db), backend = loadApi('admin-api', db);
    const run = operation === 'payment' ? () => student.completeDemoPayment({ _id: studentId })
      : operation === 'material' ? () => student.saveMaterial({ _id: studentId }, { kind: 'photo', fileId: `cloud://env/student-materials/${studentId}/photo/new.jpg`, size: 100 })
        : () => backend.review(admin, { registrationId: studentId, revision: 1, status: 'approved' });
    await assert.rejects(run, /notification write failed/);
    assert.deepEqual(db.rows('registrations'), [original]);
    assert.equal(db.rows('notification_events').length, 0);
    assert.equal(db.rows('audit_logs').length, 0);
  }
});

test('notification modules stay identical across independently packaged functions', () => {
  assert.equal(fs.readFileSync(path.join(root, 'cloudfunctions/student-api/notifications.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'cloudfunctions/admin-api/notifications.js'), 'utf8'));
});

function page(file, api, wx = {}, timers = {}) {
  let definition;
  const context = vm.createContext({ require: () => api, Page: value => { definition = value; }, wx,
    setTimeout: timers.setTimeout || setTimeout, clearTimeout: timers.clearTimeout || clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  const instance = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(values) { Object.assign(this.data, values); } };
  return instance;
}

test('payment page stays incomplete on failure and suppresses duplicate clicks', async () => {
  let resolvePayment, calls = 0;
  const api = { completeDemoPayment: () => { calls += 1; return new Promise(resolve => { resolvePayment = resolve; }); } };
  const instance = page('miniprogram/pages/payment/payment.js', api, { removeStorageSync() {} });
  instance.data.registration = registration();
  const pending = instance.finish();
  await instance.finish();
  assert.equal(calls, 1);
  assert.equal(instance.data.complete, false);
  resolvePayment({ registration: registration({ paymentStatus: 'demo_completed' }) });
  await pending;
  assert.equal(instance.data.complete, true);
  const failed = page('miniprogram/pages/payment/payment.js', { completeDemoPayment: async () => { throw new Error('保存失败'); } });
  failed.data.registration = registration();
  await failed.finish();
  assert.equal(failed.data.complete, false);
  assert.equal(failed.data.busy, false);
  assert.equal(failed.data.error, '保存失败');
});

test('student message polling stops on hide and ignores late responses', async () => {
  const timers = new Map(); let id = 0, resolveMessages;
  const api = { hasSession: () => true, notifications: () => new Promise(resolve => { resolveMessages = resolve; }) };
  const instance = page('miniprogram/pages/my/my.js', api, {}, {
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); }
  });
  instance.visible = true;
  instance.requestId = 1;
  instance.data.student = { _id: studentId };
  const request = instance.refreshNotifications();
  instance.onHide();
  resolveMessages({ notifications: [{ id: 'late' }], unreadTotal: 1 });
  await request;
  assert.equal(instance.data.unreadTotal, 0);
  assert.equal(timers.size, 0);
});

test('admin polling does not restore read messages and stops while hidden or unmounted', async () => {
  const vue = require(path.join(root, 'admin/node_modules/vue'));
  const timers = new Map(), listeners = new Map(), requests = [];
  let timerId = 0, cleanup;
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const source = fs.readFileSync(path.join(root, 'admin/src/composables/useNotifications.js'), 'utf8')
    .replace(/import .* from 'vue';/, 'const { ref, watch, onMounted, onUnmounted } = hooks;')
    .replace("import { call } from '../services/api';", 'const call = request;')
    .replace('export function useNotifications', 'function useNotifications');
  const context = vm.createContext({ document,
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    hooks: { ...vue, onMounted: fn => fn(), onUnmounted: fn => { cleanup = fn; } },
    request: (...args) => new Promise(resolve => requests.push({ args, resolve })),
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(source + '\nthis.create = useNotifications;', context);
  const inbox = context.create({ token: vue.ref('session'), enabled: vue.ref(true) });
  assert.equal(requests[0].args[2].loading, false);
  const marking = inbox.markRead('message-id');
  requests[1].resolve({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  requests[2].resolve({ notifications: [], unreadTotal: 0 });
  await marking;
  requests[0].resolve({ notifications: [{ id: 'message-id' }], unreadTotal: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(inbox.unreadTotal.value, 0);
  assert.equal(timers.size, 1);
  document.hidden = true;
  listeners.get('visibilitychange')();
  assert.equal(timers.size, 0);
  document.hidden = false;
  listeners.get('visibilitychange')();
  cleanup();
  requests[3].resolve({ notifications: [{ id: 'late' }], unreadTotal: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(inbox.unreadTotal.value, 0);
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
});
