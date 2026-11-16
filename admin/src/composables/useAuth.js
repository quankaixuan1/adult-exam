import { ref, onMounted, onUnmounted } from 'vue';
import { call } from '../services/api';
export function useAuth() {
const TOKEN_KEY = 'adultExamAdminSession';
const mode = ref('loading');
const busy = ref(false);
const error = ref('');
const token = ref(localStorage.getItem(TOKEN_KEY) || '');

const recovery = ref(false);
const qr = ref(null);
const qrBusy = ref(false);
let timer, generation = 0;
function stopWechat() { generation++; clearTimeout(timer); qr.value = null; qrBusy.value = false; }
async function startWechat(recover = false) {
  recovery.value = recover === true;
  stopWechat(); const current = generation; qrBusy.value = true; error.value = '';
  try {
    const challenge = await call('createWebLogin', {}, { loading: false });
    if (current !== generation) return;
    qr.value = challenge;
    async function poll() {
      if (current !== generation) return;
      if (Date.now() >= challenge.expiresAt) { stopWechat(); error.value = '二维码已过期，请重新获取'; return; }
      try {
        const result = await call('pollWebLogin', { id: challenge.id, secret: challenge.secret }, { loading: false });
        if (current !== generation) return;
        if (result.status === 'confirmed') {
          stopWechat(); token.value = result.token; localStorage.setItem(TOKEN_KEY, result.token); mode.value = 'dashboard'; return;
        }
        timer = setTimeout(poll, 2000);
      } catch (e) { if (current === generation) { stopWechat(); showError(e); } }
    }
    timer = setTimeout(poll, 2000);
  } catch (e) { if (current === generation) showError(e); }
  finally { if (current === generation) qrBusy.value = false; }
}
onUnmounted(stopWechat);
function showError(e) { error.value = e.message || '操作未完成，请重试'; }
async function initialize() {
  error.value = '';
  try {
    const state = await call('bootstrapStatus', {}, { loading: false });
    if (!state.initialized) mode.value = 'bootstrap';
    else if (token.value) { await call('dashboard', { token: token.value, page: 1 }, { loading: false }); mode.value = 'dashboard'; }
    else mode.value = 'login';
  } catch (e) {
    showError(e);
    mode.value = 'login';
  }
}

async function submitAuth(authForm) {
  stopWechat();
  recovery.value = false;
  if (busy.value) return;
  error.value = '';
  if (mode.value === 'bootstrap' && authForm.password !== authForm.confirmPassword) {
    error.value = '两次输入的密码不一致';
    return;
  }
  busy.value = true;
  try {
    const result = await call(mode.value === 'bootstrap' ? 'bootstrap' : 'login', {
      username: authForm.username,
      displayName: authForm.displayName,
      password: authForm.password
    }, { loading: false });
    token.value = result.token;
    localStorage.setItem(TOKEN_KEY, result.token);
    authForm.password = '';
    authForm.confirmPassword = '';
    mode.value = 'dashboard';
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function logout() {
  stopWechat();
  try { if (token.value) await call('logout', { token: token.value }); } catch (_) {}
  token.value = '';
  localStorage.removeItem(TOKEN_KEY);
  mode.value = 'login';

}

onMounted(initialize);
return { recovery, mode, busy, error, token, submitAuth, logout, qr, qrBusy, startWechat, stopWechat };
}
