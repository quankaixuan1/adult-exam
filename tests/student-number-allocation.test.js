const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateStudentNumber } = require('../cloudfunctions/admin-api/student-number');
test('continues existing numbering and persists each increment', async () => {
 let state;
 const tx = { collection: () => ({ doc: () => ({ get: async()=>({data:state}),set:async({data})=>{state=data;} }) }) };
 const query={orderBy(){return this;},limit(){return this;},get:async()=>({data:[{studentNo:'WY27-0011'}]})};
 const db={RegExp:x=>x,collection:()=>({where:()=>query})};
 assert.equal(await allocateStudentNumber(db,tx,'文一校区'),'WY27-0012');
 assert.equal(await allocateStudentNumber(db,tx,'文一校区'),'WY27-0013');
 assert.equal(await allocateStudentNumber(db,tx,''),'');
});
test('deployment copies match',()=>{
 const fs=require('node:fs'); const path=require('node:path');
 assert.equal(fs.readFileSync(path.join(__dirname,'../cloudfunctions/admin-api/student-number.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../cloudfunctions/student-api/student-number.js'),'utf8'));
});
