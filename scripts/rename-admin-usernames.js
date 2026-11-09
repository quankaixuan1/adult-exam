const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {members}=require('../cloudfunctions/admin-api/organization');
const names=['qiweiliang','gaojianfeng','shaoping','dengbowen','liuhuimin','rongjian','yangweihong','gaoyanni','jiangchi','zhouyan','huangtingting','kelin','yingchenxia','zhouqianlu','wushan','heyuhao','tulaoshi'];
const mapping=Object.fromEntries(members.map((m,i)=>[m.id,names[i]+'01']));
function run(type,command){const out=execFileSync('tcb',['-e','cloud1-d2gcxozkl4c789619','db','nosql','execute','--json','--command',JSON.stringify([{TableName:'admins',CommandType:type,Command:JSON.stringify(command)}])],{encoding:'utf8',timeout:60000});const r=JSON.parse(out.slice(out.indexOf('{')));if(r.error)throw Error(r.error.message);return r.data.results[0];}
const before=run('QUERY',{find:'admins',filter:{},limit:1000});
const plan=before.map(a=>({id:a._id,old:a.username,next:a._id==='primary'?'quankaixuan01':mapping[a.memberId],name:a.displayName}));
if(plan.some(a=>!a.next)||new Set(plan.map(a=>a.next)).size!==plan.length)throw Error('Unknown account or duplicate username');
if(before.find(a=>a._id==='primary').username!=='quankaixuan'&&before.find(a=>a._id==='primary').username!=='quankaixuan01')throw Error('Primary changed');
fs.mkdirSync('backups',{recursive:true});
fs.writeFileSync(`backups/admin-username-before-${Date.now()}.json`,JSON.stringify(before,null,2),{mode:0o600});
if(process.argv[2]!=='apply'){console.log(JSON.stringify(plan,null,2));process.exit(0);}
for(const a of plan){if(a.old===a.next)continue;run('UPDATE',{update:'admins',updates:[{q:{_id:a.id,username:a.old},u:{$set:{username:a.next}},multi:false}]});}
const after=run('QUERY',{find:'admins',filter:{},limit:1000});
for(const a of before){const b=after.find(x=>x._id===a._id);const expected=plan.find(x=>x.id===a._id).next;if(!b||b.username!==expected)throw Error('Read-back failed');for(const k of Object.keys(a)){if(k==='username'||k==='lastLoginAt')continue;if(JSON.stringify(a[k])!==JSON.stringify(b[k]))throw Error('Unexpected change: '+k);}}
console.log(JSON.stringify({verified:after.length,accounts:plan.map(a=>({name:a.name,username:a.next}))},null,2));
