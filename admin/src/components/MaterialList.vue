<script setup>
import { onUnmounted, ref } from 'vue';
import { call } from '../services/api';
import { materialLabels, materialCount } from '../services/registration';
import MaterialPreview from './MaterialPreview.vue';
const props = defineProps({ registration: Object, token: String });
const error = ref('');
function showError(e) { error.value = e.message || '读取材料失败，请重试'; }
const openingMaterial = ref('');

const preview = ref(null);
let materialRequest = 0;
function closePreview() {
  materialRequest += 1;
  if (preview.value) URL.revokeObjectURL(preview.value.url);
  preview.value = null;
}
onUnmounted(closePreview);
async function openMaterial(kind, operation = 'view') {
  if (openingMaterial.value || !props.registration) return;
  const request = ++materialRequest;
  const registrationId = props.registration.id;
  openingMaterial.value = `${kind}:${operation}`;
  error.value = '';
  try {
    const result = await call('materialLink', { token: props.token, registrationId, kind });
    const response = await fetch(result.url, { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('读取材料失败，请重试');
    const extension = new URL(result.url).pathname.split('.').pop().toLowerCase();
    const mime = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[extension];
    if (!mime) throw new Error('暂不支持预览该格式');
    const blob = new Blob([await response.arrayBuffer()], { type: mime });
    if (request !== materialRequest || props.registration?.id !== registrationId) return;
    const url = URL.createObjectURL(blob);
    const name = props.registration.materials[kind].fileName || `${materialLabels[kind]}.${extension}`;
    if (operation === 'download') {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      if (preview.value) URL.revokeObjectURL(preview.value.url);
      preview.value = { url, name, type: extension === 'pdf' ? 'pdf' : 'image' };
    }
  } catch (e) { showError(e); }
  finally { openingMaterial.value = ''; }
}
</script>

<template>
<section class="material-list"><h3>报名材料 · {{ materialCount(registration) }} / 4 项</h3><div v-for="(label, kind) in materialLabels" :key="kind" class="material-item"><div><b>{{ label }}</b><small>{{ registration.materials?.[kind]?.fileName || '尚未上传' }}</small><small v-if="registration.materials?.[kind]">上传时间：{{ new Date(registration.materials[kind].uploadedAt).toLocaleString('zh-CN') }}</small></div><div class="material-actions"><button class="outline" :disabled="!registration.materials?.[kind] || !!openingMaterial" @click="openMaterial(kind, 'view')">{{ openingMaterial === kind + ':view' ? '加载中…' : '查看' }}</button><button class="outline" :disabled="!registration.materials?.[kind] || !!openingMaterial" @click="openMaterial(kind, 'download')">{{ openingMaterial === kind + ':download' ? '下载中…' : '下载' }}</button></div></div><p class="muted">核对材料后，在下方填写整体审核结果；需要补充时请写明具体材料。</p></section>
<p v-if="error" class="error">{{ error }}</p>
<MaterialPreview v-if="preview" :preview="preview" @close="closePreview"/>
</template>

<style scoped>


.material-list {
  margin: 24px 0
}

.material-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid #edf1f6
}

.material-item>div {
  min-width: 0
}

.material-item small {
  display: block;
  overflow-wrap: anywhere;
  margin-top: 6px
}

.material-item button {
  flex-shrink: 0
}

.material-actions{display:flex;gap:8px;flex-shrink:0}
@media(max-width:600px){.material-item{flex-wrap:wrap}}
</style>
