<script setup>
import { ref } from 'vue';
import { call } from '../services/api';
const props = defineProps({ token: String });
const code = ref(null), busy = ref(false), error = ref('');
async function generate() {
  if (busy.value) return; busy.value = true; error.value = '';
  try {
    code.value = await call('createReferral', { token: props.token });
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="referral"><button class="outline" :disabled="busy" @click="generate">{{ busy ? '生成中…' : '我的学生报名二维码' }}</button>
    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="code"><img :src="code.image" alt="学生报名二维码" width="240" height="240" />
      <p>{{ code.teacherName }} · {{ code.campus || '校区待分配' }}</p><a :href="code.image" download="学生报名二维码.png">下载二维码</a><button @click="code = null">收起</button>
    </div>
  </section>
</template>
<style scoped>
.referral {
  margin-bottom: 20px
}

.referral img {
  display: block;
  margin: 16px 0
}

.referral a {
  margin-right: 20px
}
</style>
