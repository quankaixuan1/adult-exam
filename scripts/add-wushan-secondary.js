const { execFileSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
function run(table,type,command) {
 let out;
 try { out=execFileSync('tcb',['-e','cloud1-d2gcxozkl4c789619','db','nosql','execute','--json','--command',JSON.stringify([{TableName:table,CommandType:type,Command:JSON.stringify(command)}])],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}); }
 catch { throw new Error('Cloud database command failed'); }
 const r=JSON.parse(out.slice(out.indexOf('{')));if(r.error)throw new Error('Cloud database rejected command');
 const result=r.data.results[0]; if(result.writeErrors?.length || result.ok===0) throw new Error('Database write failed');return result;
}
const rows=run('admins','QUERY',{find:'admins',filter:{username:{$in:['wushan01','wushan02']}},limit:10});
const source=rows.find(a=>a.username==='wushan01');
if(!source || source.disabled || source.memberId!=='jingji-wu')throw new Error('Source account unavailable or mapping changed');
const summary={username:'wushan02',displayName:source.displayName,memberId:source.memberId,permissions:source.permissions};
if(process.argv[2]!=='apply'){console.log(JSON.stringify({...summary,exists:rows.some(a=>a.username==='wushan02') }));process.exit(0);}
if(rows.some(a=>a.username==='wushan02'))throw new Error('Account already exists; no changes made');
const now=new Date().toISOString();
const doc={_id:createHash('sha256').update('admin:wushan02').digest('hex'),...summary,role:'staff',disabled:false,schools:source.schools||[],classIds:source.classIds||[],passwordSalt:source.passwordSalt,passwordHash:source.passwordHash,sessionVersion:randomBytes(16).toString('hex'),createdAt:now,updatedAt:now};
if(!doc.passwordSalt||!doc.passwordHash)throw new Error('Source password unavailable');
run('admins','INSERT',{insert:'admins',documents:[doc],ordered:true});
const check=run('admins','QUERY',{find:'admins',filter:{_id:doc._id},projection:{username:1,memberId:1,permissions:1,disabled:1},limit:1});
if(check[0]?.username!=='wushan02'||check[0].memberId!==source.memberId||JSON.stringify(check[0].permissions)!==JSON.stringify(source.permissions)||check[0].disabled!==false)throw new Error('Verification failed');
run('audit_logs','INSERT',{insert:'audit_logs',documents:[{actorType:'operator',action:'secondary_teacher_account_created',details:{accountId:doc._id,sourceAccountId:source._id,memberId:source.memberId},createdAt:now}]});
console.log(JSON.stringify({...summary,verified:true}));
