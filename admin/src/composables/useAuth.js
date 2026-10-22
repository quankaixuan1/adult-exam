import { ref, onMounted } from 'vue';
import { call } from '../services/api';
export function useAuth() {
const TOKEN_KEY = 'adultExamAdminSession';
const mode = ref('loading');
const busy = ref(false);
const error = ref('');
const token = ref(localStorage.getItem(TOKEN_KEY) || '');

function showError(e) { error.value = e.message || '操作未完成，请重试'; }
async function initialize() {
  error.value = '';
  try {
    const state = await call('bootstrapStatus');
    if (!state.initialized) mode.value = 'bootstrap';
    else if (token.value) { await call('dashboard', { token: token.value, page: 1 }); mode.value = 'dashboard'; }
    else mode.value = 'login';
  } catch (e) {
    showError(e);
    mode.value = 'login';
  }
}

async function submitAuth(authForm) {
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
    });
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
  try { if (token.value) await call('logout', { token: token.value }); } catch (_) {}
  token.value = '';
  localStorage.removeItem(TOKEN_KEY);
  mode.value = 'login';

}

onMounted(initialize);
return { mode, busy, error, token, submitAuth, logout };
}
