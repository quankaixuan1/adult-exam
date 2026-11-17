const test = require('node:test');
const assert = require('node:assert/strict');
const { planStudentNumbers } = require('../scripts/student-number-plan');
test('numbers follow registration time within each campus with stable ties', () => {
 const records = [
  {_id:'b',studyCampus:'文一校区',createdAt:'2026-11-02T00:00:00Z'},
  {_id:'a',studyCampus:'文一校区',createdAt:'2026-11-01T00:00:00Z'},
  {_id:'c',studyCampus:'经济校区',createdAt:'2026-11-01T00:00:00Z'},
 ];
 const result = planStudentNumbers(records,{campusField:'studyCampus',year:'27'});
 assert.deepEqual(result.changes.map(x=>[x.id,x.studentNo]),[['a','WY27-0001'],['b','WY27-0002'],['c','ZJ27-0001']]);
 const updated=records.map(r=>({...r,studentNo:result.changes.find(c=>c.id===r._id).studentNo}));
 assert.equal(planStudentNumbers(updated,{campusField:'studyCampus',year:'27'}).changes.length,0);
});
test('Shanghai year boundaries and invalid records are handled explicitly', () => {
 const result=planStudentNumbers([{_id:'a',campus:'下沙校区',createdAt:'2026-12-31T16:00:00Z'},{_id:'b',createdAt:'invalid'}],{campusField:'campus',year:'registration'});
 assert.equal(result.changes[0].studentNo,'XS27-0001'); assert.equal(result.skipped.length,1);
});
