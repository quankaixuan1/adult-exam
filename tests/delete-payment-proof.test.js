const test = require('node:test');
const assert = require('node:assert/strict');
const factory = require('../cloudfunctions/admin-api/delete-payment-proof');
function setup(record) {
 let patch, audit;
 const tx={collection:name=>({doc:()=>({get:async()=>({data:record}),update:async({data})=>{patch=data;},set:async({data})=>{audit=data;}})})};
 const remove=factory({db:{command:{remove:()=> 'REMOVE'}},ApiError:Error,requirePermission:()=>{},scopedRegistration:async()=>record,withTransaction:async(db,fn)=>fn(tx),canAccess:(admin)=>admin.allowed});
 return {remove,patch:()=>patch,audit:()=>audit};
}
test('removing a proof preserves others and requires renewed review',async()=>{
 const s=setup({revision:2,paymentStatus:'paid',paymentProofs:[{fileId:'a'},{fileId:'b'}]});
 await s.remove({allowed:true,_id:'teacher'},{registrationId:'id',proofIndex:0,revision:2});
 assert.deepEqual(s.patch().paymentProofs,[{fileId:'b'}]); assert.equal(s.patch().paymentStatus,'finance_pending');
 assert.equal(s.audit().details.removedProof.fileId,'a');
});
test('legacy last proof clears legacy reference; stale and unauthorized requests fail',async()=>{
 const s=setup({revision:2,materials:{paymentProof:{fileId:'a'}}});
 await assert.rejects(s.remove({allowed:false},{proofIndex:0,revision:2}));
 await assert.rejects(s.remove({allowed:true},{proofIndex:0,revision:1}));
 assert.equal(s.patch(),undefined);
 await s.remove({allowed:true},{proofIndex:0,revision:2});
 assert.equal(s.patch()['materials.paymentProof'],'REMOVE');assert.equal(s.patch().paymentStatus,'pending');
});
