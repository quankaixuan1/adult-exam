const { randomBytes, createHash } = require('crypto');
const { generateCode } = require('./wechat-code');
const hash = value => createHash('sha256').update(value).digest('hex');
module.exports = ({ db, cloud, ApiError, withTransaction, adminDocument, createSession, qrGenerator = generateCode }) => {
  const collection = 'admin_web_logins';
  const fail = () => { throw new ApiError('二维码已失效，请在网页刷新后重试', 'LOGIN_EXPIRED'); };
  async function account() {
    const { OPENID, APPID } = cloud.getWXContext();
    if (!OPENID || APPID !== 'wxe1a773261a11fb90') throw new ApiError('请使用微信小程序确认登录', 'FORBIDDEN');
    let binding;
    try { binding = (await db.collection('admin_wechat_bindings').doc(hash(`wechat-admin:${APPID}:${OPENID}`)).get()).data; }
    catch (_) { throw new ApiError('请先在小程序首页绑定老师管理账号', 'FORBIDDEN'); }
    const admin = binding && await adminDocument(binding.adminId);
    if (!admin || admin.disabled || admin.createdAt !== binding.accountCreatedAt) throw new ApiError('请先绑定有效的老师管理账号', 'FORBIDDEN');
    return admin;
  }
  async function read(store, id) {
    if (!/^[a-f0-9]{32}$/.test(id || '')) fail();
    let record;
    try { record = (await store.collection(collection).doc(id).get()).data; } catch (_) { fail(); }
    if (!record || record.expiresAt <= Date.now() || record.status === 'consumed') fail();
    return record;
  }
  return async (action, data) => {
    if (action === 'createWebLogin') {
      const id = randomBytes(16).toString('hex');
      const secret = randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 180000;
      let code;
      try {
        code = await qrGenerator(id);
      } catch (error) {
        if (error.code === 'WECHAT_CONFIG_REQUIRED') throw new ApiError(error.message, error.code);
        const rawCode = String(error.errCode || error.code || 'UNKNOWN').slice(0, 80);
        console.error('wechat_qr_failed', JSON.stringify({ code: rawCode, message: String(error.errMsg || error.message || '').replace(/(access_token|secret|token)=[^ &]+/gi, '$1=[redacted]').slice(0, 800) }));
        throw new ApiError('微信登录码生成失败（' + rawCode + '），请联系管理员', 'QR_FAILED');
      }
      if (String(code && code.errCode) === '-501001') throw new ApiError('微信登录码权限未配置：请在云开发控制台为 admin-api 授权 wxacode.getUnlimited，并发布包含微信登录页的小程序', 'QR_PERMISSION_DENIED');
      if (!code.buffer || (code.errCode && code.errCode !== 0)) throw new ApiError('生成微信登录码失败，请稍后重试', 'QR_FAILED');
      await db.collection(collection).add({ data: { _id: id, secretHash: hash(secret), status: 'pending', expiresAt } });
      return { id, secret, expiresAt, image: `data:image/png;base64,${Buffer.from(code.buffer).toString('base64')}` };
    }
    if (action === 'confirmWebLogin') {
      const admin = await account();
      await withTransaction(db, async tx => {
        const record = await read(tx, data.id);
        if (record.status !== 'pending') fail();
        await tx.collection(collection).doc(data.id).update({ data: { status: 'confirmed', adminId: admin._id, accountCreatedAt: admin.createdAt, sessionVersion: admin.sessionVersion || 0 } });
      });
      return { confirmed: true };
    }
    if (action === 'pollWebLogin') {
      const adminId = await withTransaction(db, async tx => {
        const record = await read(tx, data.id);
        if (typeof data.secret !== 'string' || hash(data.secret) !== record.secretHash) fail();
        if (record.status === 'pending') return null;
        const admin = await adminDocument(record.adminId);
        if (!admin || admin.disabled || admin.createdAt !== record.accountCreatedAt || (admin.sessionVersion || 0) !== record.sessionVersion) fail();
        await tx.collection(collection).doc(data.id).update({ data: { status: 'consumed' } });
        return admin;
      });
      return adminId ? { status: 'confirmed', ...await createSession(adminId) } : { status: 'pending' };
    }
  };
};
