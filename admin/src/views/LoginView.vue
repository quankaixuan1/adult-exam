<script setup>
import { reactive } from 'vue';
defineProps({ mode: String, busy: Boolean, error: String, qr: Object, qrBusy: Boolean });
const emit = defineEmits(['submit', 'wechat', 'cancel-wechat']);
const authForm = reactive({ username: '', displayName: '主管理员', password: '', confirmPassword: '' });
function submit() { emit('submit', { ...authForm }); authForm.password = ''; authForm.confirmPassword = ''; }
</script>

<template>
<main  class="auth-shell">
    <section class="auth-copy">
      <div class="brand-mark">成</div>
      <p class="eyebrow">2026 招生服务</p>
      <h1>成人高考报名<br />管理后台</h1>
      <!-- <p>集中查看报名信息、核对报名材料与招生计划。</p> -->
    </section>
    <section class="auth-card">
      <p class="eyebrow">{{ mode === 'bootstrap' ? '首次使用' : '管理员登录' }}</p>
      <h2>{{ mode === 'bootstrap' ? '建立主管理员' : '欢迎回来' }}</h2>
      <p class="muted">{{ mode === 'bootstrap' ? '该步骤完成后不能再次自助初始化。' : '请输入管理账号继续。' }}</p>
      <form @submit.prevent="submit">
        <label>账号<input v-model.trim="authForm.username" autocomplete="username" placeholder="2–32 位字母或数字" /></label>
        <label v-if="mode === 'bootstrap'">显示名称<input v-model.trim="authForm.displayName" maxlength="40" /></label>
        <label>密码<input v-model="authForm.password" type="password" autocomplete="current-password" placeholder="至少 10 位" /></label>
        <label v-if="mode === 'bootstrap'">确认密码<input v-model="authForm.confirmPassword" type="password" autocomplete="new-password" /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">{{ busy ? '处理中…' : mode === 'bootstrap' ? '创建并进入后台' : '登录' }}</button>
      </form>
      <section v-if="mode !== 'bootstrap'" class="wechat-login">
        <button type="button" class="wechat-button" :disabled="busy || qrBusy" @click="emit('wechat')">{{ qrBusy ? '正在生成二维码…' : qr ? '刷新微信登录码' : '微信扫码登录' }}</button>
        <template v-if="qr">
          <img :src="qr.image" alt="微信登录小程序码" width="220" height="220" />
          <p class="muted">微信扫一扫，在小程序确认登录。二维码三分钟有效。</p>
          <button type="button" @click="emit('cancel-wechat')">取消扫码</button>
        </template>
        <p class="muted">首次使用请先在小程序首页绑定老师管理账号。</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.wechat-login { text-align:center; margin-top:24px; padding-top:20px; border-top:1px solid #e3e8f1; }
.wechat-login img { display:block; margin:16px auto; }
.wechat-button {
  width: 100%;
  min-height: 48px;
  padding: 14px 20px;
  border: 0;
  border-radius: 10px;
  background: #07a35a;
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}

.wechat-button:disabled {
  opacity: .6;
  cursor: not-allowed;
}


.auth-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.05fr .95fr;
  background: #fff
}

.auth-copy {
  padding: 10vh 9vw;
  color: #fff;
  background: linear-gradient(145deg, #13254a, #245cc4);
  display: flex;
  flex-direction: column;
  justify-content: center
}

.auth-copy .eyebrow {
  color: #aac8ff
}

.auth-copy h1 {
  margin: 10px 0 24px;
  font-size: clamp(42px, 5vw, 72px);
  line-height: 1.08
}

.auth-copy>p:last-child {
  max-width: 420px;
  color: #d5e3ff;
  font-size: 17px
}

.auth-card {
  width: min(430px, 80%);
  margin: auto
}

.auth-card h2 {
  margin: 0;
  font-size: 32px
}

.auth-card form {
  margin-top: 30px
}
@media(max-width:900px){.auth-shell{grid-template-columns:1fr}.auth-copy{display:none}.auth-card{padding:60px 0}}
</style>
