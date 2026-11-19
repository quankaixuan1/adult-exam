<script setup>
import { computed, onMounted, ref } from 'vue';
import { call } from '../services/api';
const props = defineProps({ token: String, admin: Object });
const emit = defineEmits(['expired', 'restored']);
const error = ref('');
const canDelete = computed(() => props.admin?.canDeleteRegistrations === true);
function showError(e) { error.value = e.message || '操作未完成，请重试'; if (e.code === 'LOGIN_REQUIRED') emit('expired'); }
const deletedRows = ref([]), deletedPage = ref(1), deletedBusy = ref(false);
async function loadDeleted(page = 1) {
  error.value = '';
  deletedBusy.value = true;
  try {
    const result = await call('recentlyDeleted', { token: props.token, page });
    deletedRows.value = result.records; deletedPage.value = result.page;
  } catch (e) { showError(e); }
  finally { deletedBusy.value = false; }
}
async function restoreDeleted(item) {
  if (deletedBusy.value || !window.confirm(`恢复“${item.name}”的报名记录？`)) return;
  error.value = '';
  deletedBusy.value = true;
  try {
    await call('restoreRegistration', { token: props.token, id: item.id });
    await loadDeleted(deletedRows.value.length === 1 ? Math.max(1, deletedPage.value - 1) : deletedPage.value);
    emit('restored');
  } catch (e) { showError(e); }
  finally { deletedBusy.value = false; }
}
const formatDeletedDate = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
onMounted(() => loadDeleted());
defineExpose({ refresh: () => loadDeleted(deletedPage.value) });
</script>
<template>
      <section class="panel recently-deleted-view" aria-label="最近删除">
        <p v-if="error" class="error">{{ error }}</p>
        <p class="retention-note muted">每年十月第三个周末周日结束（北京时间）到期；截止后删除的记录保留至下一年截止日，到期后不可恢复。仅显示你有权查看的记录。</p>
        <p v-if="deletedBusy" class="retention-note muted" role="status">正在处理…</p>
        <div class="table-wrap"><table>
          <thead><tr><th>考生</th><th>学校与专业</th><th>老师</th><th>删除时间</th><th>保留至</th><th class="row-actions">操作</th></tr></thead>
          <tbody><tr v-for="item in deletedRows" :key="item.id">
            <td><b>{{ item.name }}</b></td><td><b>{{ item.school || '—' }}</b><small>{{ item.major || '—' }}</small></td><td>{{ item.teacherName || '—' }}</td>
            <td>{{ formatDeletedDate(item.deletedAt) }}</td><td>{{ formatDeletedDate(item.expiresAt) }}</td>
            <td class="row-actions"><button v-if="canDelete" class="link-button" :disabled="deletedBusy" @click="restoreDeleted(item)">恢复</button></td>
          </tr><tr v-if="!deletedRows.length"><td colspan="6" class="empty">暂无最近删除记录</td></tr></tbody>
        </table></div>
        <div class="pagination"><button class="outline" :disabled="deletedBusy || deletedPage === 1" @click="loadDeleted(deletedPage - 1)">上一页</button>
        <span>第 {{ deletedPage }} 页</span>
        <button class="outline" :disabled="deletedBusy || deletedRows.length < 30" @click="loadDeleted(deletedPage + 1)">下一页</button></div>
      </section>
</template>

<style scoped>
.retention-note { margin: 0; padding: 18px; border-bottom: 1px solid #e8edf4; line-height: 1.7; }
.recently-deleted-view table { border-collapse: separate; border-spacing: 0; }
.row-actions { position: sticky; right: 0; z-index: 1; background: #fff; border-left: 1px solid #e3e8f1; box-shadow: -6px 0 8px -6px rgba(28, 51, 91, 0.2); white-space: nowrap; }
th.row-actions { z-index: 2; background: #fafbfd; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 20px; color: #71809c; }
</style>
