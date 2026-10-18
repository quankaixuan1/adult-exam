const { AppError } = require('../core/errors');
function createWechatProvider({ appId, appSecret, fetchImpl = fetch }) {
  const configured = /^wx[a-f0-9]{16}$/.test(appId || '') && /^[a-f0-9]{32}$/i.test(appSecret || '');
  return {
    configured,
    async exchange(code) {
      if (!configured) throw new AppError(503, '微信登录尚未配置，请联系机构管理员', 'WECHAT_NOT_CONFIGURED');
      const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
      url.search = new URLSearchParams({ appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' }).toString();
      let result;
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
        if (!response.ok) throw new Error('Upstream HTTP error');
        result = await response.json();
      } catch {
        // Never forward upstream URLs, errors or credentials to the client/logs.
        throw new AppError(502, '暂时无法连接微信，请稍后重新登录', 'WECHAT_UNAVAILABLE');
      }
      if (!result || typeof result !== 'object') throw new AppError(502, '微信登录响应异常，请稍后重试');
      if (result.errcode) {
        if ([40029, 40163, 40226].includes(Number(result.errcode))) throw new AppError(401, '微信登录凭证已失效，请重新登录', 'WECHAT_CODE_INVALID');
        if (Number(result.errcode) === 45011) throw new AppError(429, '微信登录过于频繁，请稍后重试');
        throw new AppError(502, '微信登录失败，请管理员检查服务配置', 'WECHAT_UNAVAILABLE');
      }
      if (typeof result.openid !== 'string' || !/^[\w-]{1,128}$/.test(result.openid)) throw new AppError(502, '微信登录响应异常，请稍后重试');
      // session_key and unionid are not needed for this single-app identity flow.
      return { appId, openId: result.openid };
    }
  };
}
module.exports = { createWechatProvider };
