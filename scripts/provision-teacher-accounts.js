const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { randomBytes, createHash, scryptSync } = require('node:crypto');
const { members } = require('../cloudfunctions/admin-api/organization');
const usernames = ['qwl','gjf','sp','dbw','lhm','rj','ywh','gyn','jc','zy','htt','kl','ycx','zql','ws','hyh','tls'];
const names = ['戚卫良','高建锋','邵萍','邓博文','刘慧敏','荣健','杨伟红','高燕妮','姜驰','周燕','黄婷婷','柯琳','应晨霞','周钱露','吴珊','何宇昊','屠老师'];
function run(table, type, command) {
  const out = execFileSync('tcb', ['-e','cloud1-d2gcxozkl4c789619','db','nosql','execute','--json','--command',JSON.stringify([{TableName:table,CommandType:type,Command:JSON.stringify(command)}])], {encoding:'utf8',timeout:60000});
  const result=JSON.parse(out.slice(out.indexOf('{')));
  if(result.error) throw new Error(result.error.message);
  return result.data.results[0];
}
function list() { return run('admins','QUERY',{find:'admins',filter:{},projection:{_id:1,username:1,displayName:1,memberId:1,disabled:1},limit:100}); }
if (members.length !== names.length || members.some((m,i)=>m.name!==names[i])) throw new Error('Roster changed; review mapping first');
const initialPassword = process.env.TEACHER_INITIAL_PASSWORD;
if (!initialPassword || initialPassword.length < 10) throw new Error('Provide TEACHER_INITIAL_PASSWORD (at least 10 characters)');
const existing=list();
fs.mkdirSync('backups',{recursive:true});
fs.writeFileSync(`backups/teacher-account-plan-${Date.now()}.json`,JSON.stringify({existing,accounts:members.map((m,i)=>({name:m.name,memberId:m.id,username:usernames[i]}))},null,2),{mode:0o600});
const documents=members.map((m,i)=>{
  const username=usernames[i];
  if(existing.some(a=>a.username===username)) throw new Error(`Account exists: ${username}`);
  const passwordSalt=randomBytes(16).toString('hex');
  return {_id:createHash('sha256').update(`admin:${username}`).digest('hex'),username,displayName:m.name,memberId:m.id,role:'staff',disabled:false,
    permissions:['registrations.view','registrations.create','registrations.edit','materials.view',...(m.position==='teacher'?[]:['registrations.review'])],schools:[],classIds:[],
    passwordSalt,passwordHash:scryptSync(initialPassword,passwordSalt,64).toString('hex'),sessionVersion:randomBytes(16).toString('hex'),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
});
run('admins','INSERT',{insert:'admins',documents,ordered:true});
const verified=list();
for(const doc of documents) if(!verified.some(a=>a._id===doc._id&&a.memberId===doc.memberId&&a.disabled===false)) throw new Error('Account verification failed');
const previous=existing.filter(a=>a._id!=='primary'&&members.some(m=>m.id===a.memberId)&&!usernames.includes(a.username));
if(previous.length) run('admins','UPDATE',{update:'admins',updates:previous.map(a=>({q:{_id:a._id,username:a.username},u:{$set:{disabled:true,sessionVersion:randomBytes(16).toString('hex'),updatedAt:new Date().toISOString()}},multi:false}))});
run('audit_logs','INSERT',{insert:'audit_logs',documents:[{action:'teacher_accounts_provisioned',actorType:'operator',createdAt:new Date().toISOString(),details:{accountIds:documents.map(d=>d._id),disabledAccountIds:previous.map(a=>a._id)}}]});
console.log(JSON.stringify({created:documents.length,accounts:verified.filter(a=>usernames.includes(a.username)).map(a=>({name:a.displayName,username:a.username})),disabled:previous.map(a=>a.username)},null,2));
