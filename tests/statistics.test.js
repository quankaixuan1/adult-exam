const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, validateFilters } = require('../cloudfunctions/admin-api/statistics');
const rows = [
 { _id:'a', name:'甲', school:'学校一', createdAt:'2026-10-31T16:00:00Z', paymentStatus:'paid', paymentFinanceReviewedAt:'2026-11-30T16:00:00Z', actualPaidAmount:150, paymentBreakdown:{registration:50,exam:100} },
 { _id:'b', school:'学校二', createdAt:'2026-11-01T00:00:00Z', paymentStatus:'finance_pending', actualPaidAmount:200 },
 { _id:'c', school:'学校一', paymentStatus:'paid', actualPaidAmount:80 }
];
test('registration dates use China day boundaries',()=> {
 assert.equal(summarize(rows,{start:'2026-11-01',end:'2026-11-01'}).total,2);
});
test('payment filters use confirmation date, category and school',()=> {
 const r=summarize(rows,{mode:'payments',start:'2026-12-01',end:'2026-12-01',school:'学校一',category:'exam'});
 assert.equal(r.total,1); assert.equal(r.amount,10000); assert.equal(r.confirmedCount,1);
 assert.equal(r.categoryGroups.length,1); assert.equal(r.categoryGroups[0].amount,10000);
});
test('legacy totals and removed registration fees are unclassified, pending funds excluded from receipts',()=> {
 const r=summarize(rows,{mode:'payments'});
 assert.equal(r.amount,23000); assert.equal(r.confirmedCount,2);
 assert.equal(r.categoryGroups.find(g=>g.label==='未分类').amount,13000);
 assert.equal(r.missingDates,2);
 assert.throws(()=>summarize(rows,{mode:'payments',category:'registration'}));
});
test('invalid filters rejected',()=> {
 assert.throws(()=>validateFilters({start:'2026-12-01',end:'2026-11-01'}));
 assert.throws(()=>validateFilters({category:'bad'}));
});
test('details paginate without truncating totals',()=> {
 const r=summarize(Array.from({length:65},(_,i)=>({...rows[0],_id:String(i)})),{mode:'payments',page:3});
 assert.equal(r.rows.length,5); assert.equal(r.total,65); assert.equal(r.amount,975000);
});
