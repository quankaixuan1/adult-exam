<script setup>
import { computed, ref, watch } from 'vue';
import { Eye, EyeOff } from 'lucide-vue-next';
import { call } from '../services/api';
const props = defineProps({ value: String, kind: { type: String, default: 'phone' }, registrationId: String, token: String });
const visible = ref(false), fullValue = ref(''), busy = ref(false), error = ref('');
let request = 0;
watch(() => [props.value, props.registrationId, props.token], () => { request++; visible.value = false; fullValue.value = ''; error.value = ''; busy.value = false; });
const label = computed(() => props.kind === 'idNumber' ? '身份证号' : '手机号');
const masked = computed(() => {
  if (!props.value) return '未提供';
  if (props.kind === 'idNumber') return props.value;
  return props.value.length > 7 ? `${props.value.slice(0, 3)}****${props.value.slice(-4)}` : '****';
});
async function toggle() {
  if (busy.value) return;
  if (visible.value) { visible.value = false; fullValue.value = ''; return; }
  error.value = '';
  if (props.kind !== 'idNumber') { fullValue.value = props.value; visible.value = true; return; }
  const current = ++request;
  busy.value = true;
  try {
    const result = await call('registrationIdentity', { token: props.token, registrationId: props.registrationId });
    if (current !== request) return;
    fullValue.value = result.idNumber || '未提供'; visible.value = true;
  } catch (e) { if (current === request) error.value = e.message || '读取失败，请重试'; }
  finally { if (current === request) busy.value = false; }
}
</script>
<template>
  <span class="sensitive-value">
    <span>{{ visible ? fullValue : masked }}</span>
    <button v-if="value" type="button" class="visibility-toggle" :disabled="busy" :aria-label="(visible ? '隐藏' : '显示完整') + label" :title="(visible ? '隐藏' : '显示完整') + label" :aria-pressed="visible" @click.stop="toggle">
      <EyeOff v-if="visible" :size="16" /><Eye v-else :size="16" />
    </button>
    <span v-if="error" class="reveal-error" role="alert">{{ error }}</span>
  </span>
</template>
<style scoped>
.sensitive-value { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.visibility-toggle { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 4px; border: 0; border-radius: 5px; background: transparent; color: #526783; cursor: pointer; }
.visibility-toggle:hover { background: #e2eaf5; }
.visibility-toggle:disabled { opacity: .5; cursor: wait; }
.reveal-error { flex-basis: 100%; color: #b42318; font-size: 12px; }
</style>
