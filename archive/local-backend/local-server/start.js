const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { SQLiteRepository } = require('../repositories/sqlite');
const { createApp } = require('./app');
const { loadWechatConfig } = require('./config');
const { createWechatProvider } = require('../providers/wechat');
process.umask(0o077);
const dir = path.resolve(__dirname,'../../../.private');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
fs.chmodSync(dir,0o700);
const wechat = createWechatProvider(loadWechatConfig(path.resolve(__dirname,'../../..')));
const keyPath = path.join(dir,'data.key');
const dbPath = path.join(dir,'registrations.db');
if (!fs.existsSync(keyPath)) {
  if (fs.existsSync(dbPath)) throw new Error('数据库密钥缺失，请恢复原密钥，不能生成替代密钥');
  fs.writeFileSync(keyPath,randomBytes(32),{mode:0o600,flag:'wx'});
}
const repository = new SQLiteRepository(dbPath,fs.readFileSync(keyPath));
const server = createApp(repository,{wechat}).listen(3000,'0.0.0.0',()=>{
  console.log('本地报名服务已启动：http://127.0.0.1:3000（仅供开发测试）');
  console.log(wechat.configured ? '微信登录已配置。' : '微信登录待配置：请在 .private/wechat.env 中填写 WECHAT_APP_SECRET 后重启。');
});
server.on('error',err=> { console.error('服务启动失败：'+err.code); repository.close(); process.exitCode=1; });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=> { repository.close(); process.exit(0); }));
