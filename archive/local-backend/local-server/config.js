const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
function loadWechatConfig(root, env = process.env) {
  const configPath = path.join(root,'.private/wechat.env');
  const local = fs.existsSync(configPath) ? parseEnv(fs.readFileSync(configPath,'utf8')) : {};
  const projectAppId = JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8')).appid;
  const appId = env.WECHAT_APP_ID || local.WECHAT_APP_ID || projectAppId;
  if (appId !== projectAppId) throw new Error('微信登录 AppID 与小程序项目不一致，请检查本地配置');
  return {appId,appSecret:env.WECHAT_APP_SECRET || local.WECHAT_APP_SECRET || ''};
}
module.exports={loadWechatConfig};
