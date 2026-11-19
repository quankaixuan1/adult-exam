const { execFileSync } = require('node:child_process');
const { createHash, randomBytes } = require('node:crypto');
function run(table,type,command) {
 let out;
 try { out=execFileSync('tcb',['-e','cloud1-d2gcxozkl4c789619','db','nosql','execute','--json','--command',JSON.stringify([{TableName:table,CommandType:type,Command:JSON.stringify(command)}])],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}); }
 catch { throw new Error('Cloud database command failed'); }
 const r=JSON.parse(out.slice(out.indexOf('{')));if(r.error)throw new Error('Cloud database rejected command');
 const result=r.data.results[0]; if(result.writeErrors?.length || result.ok===0) throw new Error('Database write failed');return result;
}
const rows=run('admins','QUERY',{find:'admins',filter:{username:{$in:['wushan01','wushan02']}},projection:{_id:1,username:1,memberId:1},limit:10});
if(rows.length!==2 || rows.some(r=>!['jingji-wu','wenyi-wu'].includes(r.memberId)))throw Error('Unexpected account mapping');
for(const row of rows){
 const memberId=row.username==='wushan01'?'wenyi-wu':'jingji-wu';
 if(row.memberId===memberId)continue;
 run('admins','UPDATE',{update:'admins',updates:[{q:{_id:row._id,memberId:row.memberId},u:{$set:{memberId,sessionVersion:randomBytes(16).toString('hex'),updatedAt:new Date().toISOString()}},multi:false}]});
}
const verified=run('admins','QUERY',{find:'admins',filter:{username:{$in:['wushan01','wushan02']}},projection:{username:1,memberId:1},limit:10});
if(verified.some(r=>r.memberId!==(r.username==='wushan01'?'wenyi-wu':'jingji-wu')))throw Error('Verification failed');
run('audit_logs','INSERT',{insert:'audit_logs',documents:[{actorType:'operator',action:'teacher_account_campus_changed',details:{before:rows,after:verified},createdAt:new Date().toISOString()}]});
console.log(JSON.stringify(verified));
