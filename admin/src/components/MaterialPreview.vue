<script setup>
defineProps({ preview: Object });
const emit = defineEmits(['close']);
</script>

<template>
<div  class="preview-backdrop" @click.self="emit('close')"><section class="preview-dialog" role="dialog" aria-modal="true" aria-label="材料预览"><header><strong>{{ preview.name }}</strong><button class="outline" @click="emit('close')">关闭预览</button></header><img v-if="preview.type === 'image'" :src="preview.url" :alt="preview.name"/><iframe v-else :src="preview.url" title="PDF材料预览"></iframe></section></div>
</template>

<style scoped>
.preview-backdrop{position:fixed;inset:0;z-index:40;background:#0b152bcc;padding:24px;display:grid;place-items:center}.preview-dialog{width:min(1100px,100%);height:90vh;background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden}.preview-dialog header{padding:16px 20px;margin:0;gap:20px;align-items:center;border-bottom:1px solid #e3e8f1}.preview-dialog header strong{overflow-wrap:anywhere;min-width:0}.preview-dialog header button{flex-shrink:0}.preview-dialog img{min-height:0;flex:1;width:100%;object-fit:contain;background:#eef1f6}.preview-dialog iframe{flex:1;width:100%;border:0;min-height:0}
.preview-dialog header{display:flex;justify-content:space-between}@media(max-width:600px){.preview-backdrop{padding:8px}}
</style>
