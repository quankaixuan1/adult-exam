const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateStudentNumber, registrationYear } = require('../cloudfunctions/admin-api/student-number');
test('continues existing numbering and persists each increment', async () => {
 let state;
 const tx = { collection: () => ({ doc: () => ({ get: async()=>({data:state}),set:async({data})=>{state=data;} }) }) };
 const query={orderBy(){return this;},limit(){return this;},get:async()=>({data:[{studentNo:'WY27-0011'}]})};
 const db={RegExp:x=>x,collection:()=>({where:()=>query})};
 assert.equal(await allocateStudentNumber(db,tx,'文一校区','2026-11-19T00:00:00+08:00'),'WY27-0012');
 assert.equal(await allocateStudentNumber(db,tx,'文一校区','2026-11-19T00:00:00+08:00'),'WY27-0013');
 assert.equal(await allocateStudentNumber(db,tx,''),'');
});
test('deployment copies match',()=>{
 const fs=require('node:fs'); const path=require('node:path');
 assert.equal(fs.readFileSync(path.join(__dirname,'../cloudfunctions/admin-api/student-number.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../cloudfunctions/student-api/student-number.js'),'utf8'));
});

test('registration year changes at midnight after September 15 in Shanghai', () => {
 assert.equal(registrationYear('2026-09-15T15:59:59.999Z'), 2026);
 assert.equal(registrationYear('2026-09-15T16:00:00.000Z'), 2027);
 assert.equal(registrationYear('2027-01-01T00:00:00+08:00'), 2027);
 assert.equal(registrationYear('2027-09-16T00:00:00+08:00'), 2028);
 assert.throws(() => registrationYear('invalid'));
});
test('number prefix uses original submission year when assigned later', async () => {
 const ids=[];
 const tx={collection:()=>({doc:id=>{ids.push(id);return {get:async()=>({data:{lastNumber:0}}),set:async()=>{}};}})};
 assert.equal(await allocateStudentNumber({},tx,'文一校区','2026-09-15T23:59:59+08:00'),'WY26-0001');
 assert.equal(await allocateStudentNumber({},tx,'文一校区','2026-09-16T00:00:00+08:00'),'WY27-0001');
 assert.notEqual(ids[0],ids[1]);
});
