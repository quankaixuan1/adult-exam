<script setup>
import { ref, reactive, onMounted } from 'vue';
import { call } from '../services/api';
const props = defineProps({ token: String, recovery: Boolean });
const emit = defineEmits(['changed']);
const account = ref(null), busy = ref(false), error = ref(''), changed = ref(false);
const form = reactive({ password: '', newPassword: '', confirmPassword: '' });
onMounted(async () => {
  try { account.value = await call('myAccount', { token: props.token }); }
  catch (e) { error.value = e.message; }
});
async function submit() {
  if (busy.value) return;
  error.value = '';
  if (form.newPassword !== form.confirmPassword) { error.value = '两次新密码输入不一致'; return; }
  busy.value = true;
  try {
    await call('changePassword', { token: props.token, ...form, recovery: props.recovery });
    Object.assign(form, { password: '', newPassword: '', confirmPassword: '' });
    changed.value = true;
  } catch (e) { error.value = e.message || '修改失败，请重试'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="account-card">
    <h2>安全管理</h2>
    <p v-if="account" class="account-identity">{{ account.displayName }} · {{ account.username }}</p>
    <template v-if="changed">
      <p class="success-message" role="status">密码修改成功，原登录会话已失效，请使用新密码重新登录。</p>
      <button class="primary" @click="emit('changed')">返回登录</button>
    </template>
    <form v-else @submit.prevent="submit">
      <h3>{{ recovery ? '重设密码' : '修改密码' }}</h3>
      <p class="muted">{{ recovery ? '已通过微信验证，请在扫码后10分钟内设置新密码。' : '修改密码后，所有设备需要重新登录。' }}</p>
      <label v-if="!recovery">原密码<input v-model="form.password" type="password" autocomplete="current-password" required maxlength="128" /></label>
      <label>新密码<input v-model="form.newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="128" placeholder="10至128位" /></label>
      <label>确认新密码<input v-model="form.confirmPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="128" /></label>
      <button class="primary" :disabled="busy">{{ busy ? '保存中…' : '保存新密码' }}</button>
    </form>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.account-card {
  width: 100%;
  min-width: 0;
  padding: 24px;
  border: 1px solid #e3e8f1;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(23, 35, 60, .04);
}
h2 {
  margin: 0 0 18px;
  font-size: 19px;
  line-height: 1.4;
}
.account-identity {
  margin: -6px 0 20px;
  color: #71809c;
  font-size: 13px;
}
form { display: grid; gap: 12px; }
h3 { margin: 0; font-size: 15px; }
form .muted { margin: -6px 0 2px; font-size: 13px; line-height: 1.6; }
label { display: grid; gap: 7px; color: #43516b; font-size: 13px; font-weight: 700; }
label input {
  width: 100%;
  min-width: 0;
  padding: 11px 13px;
  border: 1px solid #d9e1ee;
  border-radius: 9px;
  background: #fff;
  color: #17233c;
  outline: none;
}
label input:focus {
  border-color: #3974df;
  box-shadow: 0 0 0 3px #3974df1c;
}
.account-card .primary { margin-top: 4px; }
.success-message {
  margin: 0 0 18px;
  padding: 12px 14px;
  border-radius: 9px;
  background: #eef7f1;
  color: #267345;
  font-size: 14px;
  line-height: 1.6;
}
@media (max-width: 520px) {
  .account-card { padding: 20px; }
}
</style>
