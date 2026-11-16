const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const programs = require('../cloudfunctions/admin-api/programs');

test('admin API owns the unique program catalog', () => {
  assert.equal(programs.length, 51);
  assert.equal(new Set(programs.map(program => program.id)).size, programs.length);
});

test('student catalog proxy reads admin-api without a WeChat identity', async () => {
  const filename = path.resolve(__dirname, '../cloudfunctions/student-api/index.js');
  const source = fs.readFileSync(filename, 'utf8');
  let contextReads = 0;
  let catalogRequest;
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => ({}),
    callFunction: async request => {
      catalogRequest = request;
      return { result: { ok: true, data: { programs } } };
    },
    getWXContext() {
      contextReads += 1;
      throw new Error('catalog should not require OPENID');
    }
  };
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = request => request === 'wx-server-sdk' ? cloud : Module.prototype.require.call(loaded, request);
  loaded._compile(source, filename);

  const response = await loaded.exports.main({ action: 'catalog' });
  assert.equal(response.ok, true);
  assert.equal(response.data.programs.length, 51);
  assert.deepEqual(catalogRequest, { name: 'admin-api', data: { action: 'catalog' } });
  assert.equal(contextReads, 0);
});
