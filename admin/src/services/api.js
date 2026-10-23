import cloudbase from '@cloudbase/js-sdk';
import { beginLoading, endLoading } from '../composables/useLoading';

const cloud = cloudbase.init({ env: 'cloud1-d2gcxozkl4c789619' });
let readyPromise;

async function ready() {
  if (!readyPromise) readyPromise = cloud.auth().signInAnonymously();
  return readyPromise;
}

export async function call(action, data = {}, options = {}) {
  const showLoading = options.loading !== false && action !== 'materialLink';
  if (showLoading) beginLoading();

  try {
    await ready();
    let response;
    try {
      response = await cloud.callFunction({ name: 'admin-api', data: { action, data } });
    } catch (cause) {
      const error = new Error('无法连接管理服务，请稍后重试');
      error.cause = cause;
      throw error;
    }
    const result = response && response.result;
    if (!result || result.ok !== true) {
      const error = new Error(result && result.message ? result.message : '管理服务暂时不可用');
      error.code = result && result.code;
      throw error;
    }
    return result.data;
  } finally {
    if (showLoading) endLoading();
  }
}
