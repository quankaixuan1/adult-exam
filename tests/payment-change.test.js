const test = require('node:test');
const assert = require('node:assert/strict');
const { paymentChanged } = require('../cloudfunctions/admin-api/payment-change');
const current = { actualPaidAmount: '600.00', paymentBreakdown: { tuition: '300', materials: 200, exam: 100 } };
test('unchanged payment survives reordered keys, numeric strings and removed registration fee field', () => {
  assert.equal(paymentChanged(current, { actualPaidAmount: 600, paymentBreakdown: { exam: 100, materials: 200, tuition: 300 } }), false);
  assert.equal(paymentChanged(current, { phone: '13800000000' }), false);
});
test('real total changes, clearing and redistribution still require review', () => {
  assert.equal(paymentChanged(current, { actualPaidAmount: 601 }), true);
  assert.equal(paymentChanged(current, { actualPaidAmount: null }), true);
  assert.equal(paymentChanged(current, { paymentBreakdown: { exam: 200, materials: 100, tuition: 300 } }), true);
  assert.equal(paymentChanged({ actualPaidAmount: 600 }, { actualPaidAmount: 600, paymentBreakdown: current.paymentBreakdown }), true);
});
