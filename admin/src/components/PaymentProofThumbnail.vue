<script setup>
import { ref, watch } from 'vue';
import { call } from '../services/api';
const props = defineProps({ token: String, registrationId: String, proofIndex: Number });
const emit = defineEmits(['open']);
const url = ref(''), error = ref(''), loading = ref(false), retry = ref(0);
watch(() => [props.token, props.registrationId, props.proofIndex, retry.value], async (_, __, onCleanup) => {
  let active = true, objectUrl = '';
  const controller = new AbortController();
  onCleanup(() => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
  url.value = ''; error.value = ''; loading.value = true;
  try {
    const result = await call('materialLink', { token: props.token, registrationId: props.registrationId, kind: 'paymentProof', proofIndex: props.proofIndex }, { loading: false });
    if (!active) return;
    const response = await fetch(result.url, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('读取失败');
    const blob = await response.blob();
    if (!active) return;
    objectUrl = URL.createObjectURL(blob); url.value = objectUrl;
  } catch (e) { if (active) error.value = '缩略图加载失败，点击重试'; }
  finally { if (active) loading.value = false; }
}, { immediate: true });
</script>
<template>
  <button type="button" class="proof-thumbnail" :disabled="loading" :aria-label="error || '放大查看缴费凭证'" @click="error ? retry++ : emit('open')">
    <span v-if="loading">加载中…</span>
    <span v-else-if="error">{{ error }}</span>
    <img v-else-if="url" :src="url" alt="缴费凭证缩略图，点击放大" @error="error = '缩略图加载失败，点击重试'" />
  </button>
</template>
<style scoped>
.proof-thumbnail { display: flex; align-items: center; justify-content: center; flex: 0 0 112px; width: 112px; height: 132px; padding: 6px; border: 1px solid #e3d5b7; border-radius: 8px; background: #fff; color: #65728a; cursor: zoom-in; overflow: hidden; font-size: 12px; }
.proof-thumbnail img { width: 100%; height: 100%; object-fit: contain; }
.proof-thumbnail:disabled { cursor: wait; }
</style>
