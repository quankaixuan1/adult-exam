const test = require('node:test');
const assert = require('node:assert/strict');
const { deletionExpiry } = require('../cloudfunctions/admin-api/deletion-retention');
test('October third weekend ends at Shanghai Monday midnight', () => {
  assert.equal(deletionExpiry('2026-09-01T00:00:00Z').toISOString(), '2026-10-18T16:00:00.000Z');
  assert.equal(deletionExpiry('2026-10-18T15:59:59.999Z').toISOString(), '2026-10-18T16:00:00.000Z');
});
test('cutoff instant and later deletions use next academic year', () => {
  assert.equal(deletionExpiry('2026-10-18T16:00:00Z').toISOString(), '2027-10-17T16:00:00.000Z');
  assert.equal(deletionExpiry('2026-11-18T00:00:00Z').toISOString(), '2027-10-17T16:00:00.000Z');
});
test('October beginning on Sunday counts complete Saturday Sunday weekends', () => {
  assert.equal(deletionExpiry('2023-09-01T00:00:00Z').toISOString(), '2023-10-22T16:00:00.000Z');
});
