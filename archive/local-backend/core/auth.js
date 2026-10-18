const { randomBytes, createHash } = require('node:crypto');
const { AppError } = require('./errors');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const sessionHash = token => createHash('sha256').update('session:' + token).digest('hex');
function createAuthService(repository, wechat, now = Date.now) {
  return {
    configured: () => wechat.configured,
    async login(body) {
      if (!body || typeof body.code !== 'string' || !/^[\w-]{1,256}$/.test(body.code)) throw new AppError(400, '微信登录凭证无效，请重新登录');
      // Only the server-to-server exchange may determine identity.
      const identity = await wechat.exchange(body.code);
      const token = 'wxs_' + randomBytes(32).toString('hex');
      const expiresAt = new Date(now() + SESSION_MS).toISOString();
      const student = await repository.loginWithWechat({ ...identity, tokenHash: sessionHash(token), expiresAt, createdAt: new Date(now()).toISOString() });
      return { token, expiresAt, student };
    },
    async authenticate(token) {
      if (!/^wxs_[a-f0-9]{64}$/.test(token || '')) throw new AppError(401, '请先微信登录', 'LOGIN_REQUIRED');
      const student = await repository.findSession(sessionHash(token), new Date(now()).toISOString());
      if (!student) throw new AppError(401, '登录已过期，请重新微信登录', 'LOGIN_REQUIRED');
      return student;
    },
    async logout(token) {
      if (/^wxs_[a-f0-9]{64}$/.test(token || '')) await repository.revokeSession(sessionHash(token));
      return { ok: true };
    }
  };
}
module.exports = { createAuthService };
