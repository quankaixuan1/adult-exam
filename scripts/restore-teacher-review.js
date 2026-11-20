const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {memberById}=require('../cloudfunctions/admin-api/organization');
function run(type,command){const out=execFileSync('tcb',['-e','cloud1-d2gcxozkl4c789619','db','nosql','execute','--json','--command',JSON.stringify([{TableName:'admins',CommandType:type,Command:JSON.stringify(command)}])],{encoding:'utf8',timeout:60000});const r=JSON.parse(out.slice(out.indexOf('{')));if(r.error)throw Error(r.error.message);return r.data.results[0];}
const query={find:'admins',filter:{},projection:{_id:1,username:1,memberId:1,permissions:1,disabled:1},limit:1000};
const before=run('QUERY',query);
const targets=before.filter(a=>!a.disabled&&memberById(a.memberId)?.position==='teacher'&&!(a.permissions||[]).includes('registrations.review'));
fs.mkdirSync('backups',{recursive:true});fs.writeFileSync(`backups/teacher-review-${Date.now()}.json`,JSON.stringify(targets,null,2),{mode:0o600});
console.log(JSON.stringify({accounts:targets.map(a=>a.username),count:targets.length}));
if(process.argv[2]==='apply'){
 for(const a of targets)run('UPDATE',{update:'admins',updates:[{q:{_id:a._id,memberId:a.memberId,disabled:{$ne:true}},u:{$addToSet:{permissions:'registrations.review'}},multi:false}]});
 const after=run('QUERY',query);
 for(const a of targets){const b=after.find(x=>x._id===a._id);if(!b?.permissions.includes('registrations.review')||a.permissions.some(p=>!b.permissions.includes(p)))throw Error('Verification failed');}
 console.log('Verified '+targets.length+' teacher accounts');
}
