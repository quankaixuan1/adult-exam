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
    <h2>我的账号</h2>
    <p v-if="account">{{ account.displayName }} · {{ account.username }}</p>
    <template v-if="changed">
      <p role="status">密码修改成功，原登录会话已失效，请使用新密码重新登录。</p>
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
.account-card { max-width: 560px; padding: 28px; background: white; border-radius: 12px; }
form { display: grid; gap: 16px; }
label { display: grid; gap: 8px; }
</style>
