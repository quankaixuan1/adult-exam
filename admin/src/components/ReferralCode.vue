<script setup>
import { ref, watch } from 'vue';
import { call } from '../services/api';
const props = defineProps({ token: String, admin: Object });
const code = ref(null), busy = ref(false), error = ref('');
async function generate(refresh = false) {
  if (busy.value) return; busy.value = true; error.value = '';
  try {
    code.value = await call('createReferral', { token: props.token, refresh });
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
watch(() => props.admin?.memberId || props.admin?.id === 'primary', eligible => {
  if (eligible && !code.value) generate();
}, { immediate: true });
</script>
<template>
  <section class="panel referral">
    <h2>报名二维码</h2>
    <p class="referral-intro">分享二维码，学生扫码即可填写报名信息。</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="referral-content" :aria-busy="busy">
      <div class="qr-block">
        <img v-if="code" :src="code.image" alt="学生报名二维码" width="240" height="240" />
        <div v-else class="qr-placeholder skeleton" aria-hidden="true"></div>
        <strong v-if="code">{{ code.teacherName }}</strong>
        <span v-else class="name-placeholder skeleton" aria-hidden="true"></span>
        <p v-if="code" class="muted">{{ code.campus || '校区待分配' }}</p>
        <span v-else class="campus-placeholder skeleton" aria-hidden="true"></span>
      </div>
      <div class="referral-details">
        <div class="actions">
          <template v-if="code">
            <a class="primary" :href="code.image" download="学生报名二维码.png">下载二维码</a>
            <button type="button" class="outline" :disabled="busy" @click="generate(true)">{{ busy ? '更新中…' : '更新二维码' }}</button>
          </template>
          <button v-else type="button" class="primary" :disabled="busy" @click="generate()">
            {{ busy ? '读取中…' : '查看二维码' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.referral {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(23, 35, 60, .04);
}

h2 {
  margin: 0 0 8px;
  font-size: 19px;
  line-height: 1.4;
}

.referral-intro {
  margin: 0 0 20px;
  color: #71809c;
  font-size: 13px;
  line-height: 1.6;
}

.referral-content {
  flex: 1;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  margin-top: 0;
}

.qr-block {
  display: grid;
  justify-items: center;
  gap: 4px;
}

.qr-block strong {
  margin-top: 8px;
}

.qr-block img {
  display: block;
  width: min(220px, 100%);
  height: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.qr-placeholder {
  width: min(220px, 100%);
  aspect-ratio: 1;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.name-placeholder,
.campus-placeholder {
  display: block;
  border-radius: 999px;
}

.name-placeholder {
  width: 72px;
  height: 16px;
  margin-top: 8px;
}

.campus-placeholder {
  width: 96px;
  height: 12px;
}

.skeleton {
  background: #edf1f7;
}

.qr-block .muted {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.referral-details {
  display: grid;
  justify-items: center;
  gap: 10px;
  width: 100%;
  text-align: center;
}

.referral-details strong {
  font-size: 16px;
}

.referral .actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.referral .actions > :only-child {
  grid-column: 1 / -1;
}

.referral .actions a,
.referral .actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 42px;
  padding: 9px 10px;
  border-radius: 9px;
  font-size: 13px;
  text-align: center;
  text-decoration: none;
  white-space: nowrap;
}

.referral .actions a.primary {
  width: auto;
}

@media (max-width: 520px) {
  .referral {
    padding: 20px;
  }
}
</style>
