<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { call } from '../services/api';
import { statusLabels, materialCount } from '../services/registration';
import RegistrationDetail from '../components/RegistrationDetail.vue';
const props = defineProps({ token: String, admin: Object });
const emit = defineEmits(['expired', 'admin']);
const error = ref('');
const data = reactive({ admin: null, stats: { total: 0, pending: 0, approved: 0, rejected: 0 }, registrations: [], page: 1, pageSize: 30, filteredTotal: 0 });
const filter = ref(''), search = ref(''), selected = ref(null);
const rows = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return keyword ? data.registrations.filter(item => [item.name,item.phone,item.school,item.level,item.major].some(v => String(v || '').toLowerCase().includes(keyword))) : data.registrations;
});
function showError(e) { error.value = e.message || '操作未完成，请重试'; if (e.code === 'LOGIN_REQUIRED') emit('expired'); }
async function loadDashboard(page = 1) {
  error.value = '';
  try { const result = await call('dashboard', { token: props.token, status: filter.value, page }); Object.assign(data,result); emit('admin',result.admin); }
  catch (e) { showError(e); }
}
async function openReview(item) {
  error.value = '';
  try { const result = await call('registrationDetail', { token: props.token, registrationId:item.id }); if (result.admin) { data.admin = result.admin; emit('admin', result.admin); } selected.value = result.registration; }
  catch (e) { showError(e); }
}
onMounted(() => loadDashboard());
defineExpose({ refresh: () => loadDashboard(data.page) });
</script>
<template>
<div class="registrations-view">
  <section class="stats"><article><span>全部报名</span><strong>{{data.stats.total}}</strong></article><article><span>待审核</span><strong>{{data.stats.pending}}</strong></article><article><span>已通过</span><strong>{{data.stats.approved}}</strong></article><article><span>需补充</span><strong>{{data.stats.rejected}}</strong></article></section>
  <section class="panel">
    <div class="toolbar"><input v-model="search" placeholder="搜索本页姓名、手机号、学校或专业"/><select v-model="filter" @change="loadDashboard(1)"><option value="">全部状态</option><option v-for="(label,key) in statusLabels" :key="key" :value="key">{{label}}</option></select></div>
    <div class="table-wrap"><table><thead><tr><th>考生</th><th>学校与专业</th><th>层次 / 班级</th><th>材料</th><th>提交时间</th><th>状态</th><th></th></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td><b>{{item.name}}</b><small>{{item.phone}}</small></td><td><b>{{item.school}}</b><small>{{item.major}}</small></td><td>{{item.level}}<small>{{item.classId || '待分班'}}</small></td><td>{{materialCount(item)}} / 4 项</td><td>{{new Date(item.createdAt).toLocaleString('zh-CN')}}</td><td><span class="status" :class="item.status">{{statusLabels[item.status]}}</span></td><td><button class="link-button" @click="openReview(item)">查看审核</button></td></tr><tr v-if="!rows.length"><td colspan="7" class="empty">暂无符合条件的报名记录</td></tr></tbody></table></div>
    <div class="pagination"><button class="outline" :disabled="data.page<=1" @click="loadDashboard(data.page-1)">上一页</button><span>第 {{data.page}} 页 · 共 {{data.filteredTotal}} 条</span><button class="outline" :disabled="data.page*data.pageSize>=data.filteredTotal" @click="loadDashboard(data.page+1)">下一页</button></div>
  </section>
  <p v-if="error" class="error banner">{{error}}</p>
  <RegistrationDetail v-if="selected" :registration="selected" :token="token" :admin="data.admin || admin" @close="selected=null" @saved="selected=null;loadDashboard(data.page)"/>
</div>
</template>
<style scoped>
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px}.stats article{padding:21px;border:1px solid #e3e8f1;border-radius:14px;background:#fff;box-shadow:0 6px 20px #1c335b0a}.stats span{display:block;color:#71809c;font-size:13px}.stats strong{display:block;margin-top:9px;font-size:28px}.toolbar{display:grid;grid-template-columns:1fr 170px;gap:12px;padding:18px;border-bottom:1px solid #e8edf4}.pagination{display:flex;align-items:center;justify-content:center;gap:18px;padding:20px;color:#71809c}@media(max-width:900px){.stats{grid-template-columns:1fr 1fr}.toolbar{grid-template-columns:1fr}}
</style>
