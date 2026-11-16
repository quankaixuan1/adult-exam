const https = require('https');
let cached;
function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({ hostname: 'api.weixin.qq.com', path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) req.destroy(new Error('微信响应过大')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error('微信接口 HTTP ' + res.statusCode)); resolve({ buffer: Buffer.concat(chunks), type: res.headers['content-type'] || '' }); });
    });
    req.on('timeout', () => req.destroy(new Error('微信接口超时')));
    req.on('error', reject); req.end(body);
  });
}
function apiError(result) { const error = new Error('微信接口错误 ' + result.errcode); error.errCode = result.errcode; return error; }
async function generateCode(scene, request = post, page = 'pages/web-login/web-login') {
  // Referral codes are distributed to students and must open the published app.
  const versionKey = page === 'pages/referral/referral' ? 'WECHAT_REFERRAL_ENV_VERSION' : 'WECHAT_LOGIN_ENV_VERSION';
  const version = process.env[versionKey] || 'release';
  if (!['trial', 'develop', 'release'].includes(version)) throw new Error(versionKey + ' 配置无效');
  const secret = process.env.WECHAT_APP_SECRET;
  if (!secret) { const error = new Error('请在 admin-api 云函数环境变量中配置 WECHAT_APP_SECRET'); error.code = 'WECHAT_CONFIG_REQUIRED'; throw error; }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!cached || cached.expiresAt <= Date.now()) {
      const response = await request('/cgi-bin/stable_token', { grant_type: 'client_credential', appid: 'wxe1a773261a11fb90', secret });
      const data = JSON.parse(response.buffer.toString());
      if (!data.access_token) throw apiError(data);
      cached = { token: data.access_token, expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 0) - 120) * 1000 };
    }
    const response = await request('/wxa/getwxacodeunlimit?access_token=' + encodeURIComponent(cached.token), { scene, page, width: 280, check_path: version === 'release', env_version: version });
    if (response.type.startsWith('image/')) return { buffer: response.buffer };
    const data = JSON.parse(response.buffer.toString());
    if ([40001, 40014, 42001].includes(data.errcode) && attempt === 0) { cached = null; continue; }
    throw apiError(data);
  }
}
module.exports = { generateCode };
