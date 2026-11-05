<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Download } from 'lucide-vue-next';
import { registrationXlsx } from '../services/registration-export';
import { call } from '../services/api';
import { statusLabels, paymentStatusLabels, materialCount } from '../services/registration';
import PaymentStatus from '../components/PaymentStatus.vue';
import RegistrationDetail from '../components/RegistrationDetail.vue';
import RegistrationEditor from '../components/RegistrationEditor.vue';
const props = defineProps({ token: String, admin: Object });
const emit = defineEmits(['expired', 'admin']);
const error = ref('');
const data = reactive({ admin: null, stats: { total: 0, pending: 0, approved: 0, rejected: 0 }, registrations: [], page: 1, pageSize: 30, filteredTotal: 0 });
const isFinance = computed(() => (data.admin || props.admin)?.role !== 'super' && ['finance', 'financeStaff'].includes((data.admin || props.admin)?.position));
const paymentFilterLabels = Object.fromEntries(Object.entries(paymentStatusLabels).filter(([key]) => key !== 'teacher_pending'));
const search = ref(''), keyword = ref(''), selected = ref(null);
const editing = ref(false), editRecord = ref(null), statistics = ref(null);
const statLabels = { campus: '按校区', teacherId: '按所属老师', level: '按层次', school: '按院校' };
const canCreate = computed(() => data.admin?.role === 'super' || data.admin?.permissions?.includes('registrations.create'));
const canEdit = computed(() => data.admin?.role === 'super' || data.admin?.permissions?.includes('registrations.edit'));
const filters = reactive({ school: '', major: '', level: '', classId: '', studyCampus: '', teacherName: '', status: '', paymentStatus: '' });
const filterOptions = reactive({ school: [], major: [], level: [], classId: [], studyCampus: [], teacherName: [] });
const filterFields = [
  { key: 'school', label: '学校' },
  { key: 'major', label: '专业' },
  { key: 'level', label: '层次' },
  { key: 'studyCampus', label: '就读校区' },
  { key: 'teacherName', label: '所属老师' }
];

const rows = computed(() => data.registrations);

function submitSearch() {
  keyword.value = search.value.trim();
  loadDashboard(1);
}

function resetSearch() {
  search.value = '';  // 清空输入 
  keyword.value = ''; // 清空实际发送给后端的关键词 
  Object.keys(filters).forEach(key => { filters[key] = ''; });
  loadDashboard(1);   // 重新加载第一页
}
// const rows = computed(() => {
//   const keyword = search.value.trim().toLowerCase();
//   return keyword ? data.registrations.filter(item => [item.name, item.phone, item.school, item.level, item.major].some(v => String(v || '').toLowerCase().includes(keyword))) : data.registrations;
// });
function showError(e) { error.value = e.message || '操作未完成，请重试'; if (e.code === 'LOGIN_REQUIRED') emit('expired'); }
async function loadFilterOptions() {
  try {
    const result = await call('registrationFilters', { token: props.token }, { loading: false });
    Object.assign(filterOptions, result);
  } catch (e) {
    showError(e);
  }
}
let requestId = 0;
async function loadDashboard(page = 1, options = {}) {
  const currentId = ++requestId;
  error.value = '';
  try {
    const result = await call('dashboard', {
      token: props.token,
      status: filters.status,
      paymentStatus: filters.paymentStatus,
      keyword: keyword.value,
      school: filters.school,
      major: filters.major,
      level: filters.level,
      classId: filters.classId,
      studyCampus: filters.studyCampus,
      teacherName: filters.teacherName,
      page
    }, options);
    if (currentId !== requestId) return;
    Object.assign(data, result);
    emit('admin', result.admin);
  }
  catch (e) { if (currentId === requestId) showError(e); }
}
const exporting = ref(false);
const exportCount = ref(0);
async function exportRegistrations() {
  if (exporting.value) return;
  exporting.value = true; exportCount.value = 0; error.value = '';
  const query = { ...filters, keyword: keyword.value, token: props.token };
  try {
    const records = new Map();
    for (let page = 1; ; page++) {
      const result = await call('dashboard', { ...query, page, exportIdentity: true }, { loading: false });
      for (const record of result.registrations) records.set(record.id, record);
      exportCount.value = records.size;
      if (page * result.pageSize >= result.filteredTotal || result.registrations.length === 0) break;
    }
    if (!records.size) { error.value = '当前筛选条件下没有可导出的记录'; return; }
    const url = URL.createObjectURL(new Blob([await registrationXlsx([...records.values()])], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `报名记录-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })}.xlsx`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { showError(e); }
  finally { exporting.value = false; }
}
async function openReview(item) {
  return openRegistration(item.id);
}
async function editRegistration(item = null) {
  if (item && !await openRegistration(item.id)) return;
  editRecord.value = item ? selected.value : null;
  selected.value = null;
  editing.value = true;
}
async function showStatistics() {
  try { statistics.value = (await call('registrationStatistics', { token: props.token })).groups; }
  catch (e) { showError(e); }
}
async function savedRegistration() {
  editing.value = false;
  await Promise.all([loadDashboard(data.page), loadFilterOptions(), statistics.value ? showStatistics() : Promise.resolve()]);
}
async function openRegistration(registrationId) {
  error.value = '';
  try {
    const result = await call('registrationDetail', { token: props.token, registrationId });
    if (result.admin) { data.admin = result.admin; emit('admin', result.admin); }
    selected.value = result.registration;
    return true;
  }
  catch (e) { showError(e); return false; }
}
onMounted(() => Promise.all([
  loadDashboard(1, { loading: false }),
  loadFilterOptions()
]));
defineExpose({ refresh: () => loadDashboard(data.page), openRegistration });
</script>
<template>
  <div class="registrations-view">
    <div class="registration-actions"><button v-if="canCreate" class="primary" @click="editRegistration()">新增报名</button><button class="outline" @click="showStatistics">统计分析</button><span class="muted">统计和查询仅包含当前账号有权查看的记录</span></div>
    <section v-if="statistics" class="panel analysis-panel">
      <div class="analysis-heading">
        <h2>授权范围统计</h2><button class="link-button" @click="statistics = null">收起</button>
      </div>
      <div class="analysis-grid">
        <section v-for="(items, key) in statistics" :key="key">
          <h3>{{ statLabels[key] }}</h3>
          <p v-if="!items.length" class="muted">暂无数据</p>
          <div v-for="item in items" :key="item.key" class="analysis-row"><span>{{ item.label }}</span><b>{{ item.count }}</b></div>
        </section>
      </div>
    </section>
    <section class="stats">
      <article><span>全部报名</span><strong>{{ data.stats.total }}</strong></article>
      <article><span>{{ isFinance ? '待财务审核' : '报名待审核' }}</span><strong>{{ data.stats.pending }}</strong></article>
      <article><span>{{ isFinance ? '已缴费' : '报名已通过' }}</span><strong>{{ data.stats.approved }}</strong></article>
      <article><span>{{ isFinance ? '缴费审核未通过' : '报名需补充' }}</span><strong>{{ data.stats.rejected }}</strong></article>
    </section>
    <section class="panel">
      <form class="toolbar" @submit.prevent="submitSearch">
        <div class="search-box">
          <input v-model="search" maxlength="100" placeholder="搜索全部授权记录的姓名或手机号" />
          <button class="primary" type="submit">搜索</button>
          <button class="outline" type="button" @click="resetSearch">重置</button>
          <button class="outline export-button" type="button" :disabled="exporting" @click="exportRegistrations"><Download :size="16" :stroke-width="2" aria-hidden="true" />{{ exporting ? `导出中（${exportCount}）` : '导出' }}</button>
        </div>

      </form>
      <div class="filter-bar">
        <label><span>报名状态</span><select v-model="filters.status" @change="loadDashboard(1)">
          <option value="">全部报名状态</option><option v-for="(label, key) in statusLabels" :key="key" :value="key">{{ label }}</option>
        </select></label>
        <label><span>缴费状态</span><select v-model="filters.paymentStatus" @change="loadDashboard(1)">
          <option value="">全部缴费状态</option><option v-for="(label, key) in paymentFilterLabels" :key="key" :value="key">{{ label }}</option>
        </select></label>
        <label v-for="field in filterFields" :key="field.key">
          <span>{{ field.label }}</span>
          <select v-model="filters[field.key]" @change="loadDashboard(1)">
            <option value="">全部{{ field.label }}</option>
            <option v-for="value in filterOptions[field.key]" :key="value" :value="value">
              {{ value }}
            </option>
          </select>
        </label>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>缴费状态</th>
              <th>考生</th>
              <th>学校与专业</th>
              <th>层次</th>
              <th>就读校区 / 所属老师</th>
              <th>材料</th>
              <th>提交时间</th>
              <th>报名状态</th>

              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td>
                <PaymentStatus :status="item.paymentStatus" />
              </td>

              <td><b>{{ item.name }}</b><small>{{ item.phone }}</small></td>
              <td><b>{{ item.school }}</b><small>{{ item.major }}</small></td>
              <td>{{ item.level }}</td>
              <td>{{ item.studyCampus || '待定' }}<small>{{ item.teacherName || '待分配' }}</small></td>
              <td>{{ materialCount(item) }} / 4 项</td>
              <td>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</td>
              <td><span class="status" :class="item.status">{{ statusLabels[item.status] }}</span></td>

              <td><button class="link-button" @click="openReview(item)">查看详情</button><button v-if="canEdit" class="link-button" @click="editRegistration(item)">修改</button></td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="8" class="empty">暂无符合条件的报名记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination"><button class="outline" :disabled="data.page <= 1" @click="loadDashboard(data.page - 1)">上一页</button><span>第 {{ data.page }} 页 · 共 {{ data.filteredTotal }}
          条</span><button class="outline" :disabled="data.page * data.pageSize >= data.filteredTotal" @click="loadDashboard(data.page + 1)">下一页</button></div>
    </section>
    <p v-if="error" class="error banner">{{ error }}</p>
    <RegistrationDetail v-if="selected" :registration="selected" :token="token" :admin="data.admin || admin" @close="selected = null" @saved="selected = null; loadDashboard(data.page)" />
    <RegistrationEditor v-if="editing" :registration="editRecord" :token="token" @close="editing = false" @saved="savedRegistration" />
  </div>
</template>
<style scoped>
.export-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.registration-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap
}

.registration-actions button {
  width: auto
}

.analysis-panel {
  padding: 20px;
  margin-bottom: 20px
}

.analysis-heading {
  display: flex;
  justify-content: space-between
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 24px
}

.analysis-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #edf1f6
}

.search-box {
  display: flex;
  align-items: stretch;
  gap: 10px;
  min-width: 0;
}

.search-box input {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
}

.search-box button {
  flex: 0 0 auto;
  width: auto;
  white-space: nowrap;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 22px
}

.stats article {
  padding: 21px;
  border: 1px solid #e3e8f1;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 6px 20px #1c335b0a
}

.stats span {
  display: block;
  color: #71809c;
  font-size: 13px
}

.stats strong {
  display: block;
  margin-top: 9px;
  font-size: 28px
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: 18px;
  border-bottom: 1px solid #e8edf4
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 20px;
  color: #71809c
}

.filter-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding: 18px;
  border-bottom: 1px solid #e8edf4;
}

.filter-bar label {
  min-width: 0;
}

.filter-bar label>span {
  font-size: 13px;
  color: #71809c;
}

.filter-bar select {
  width: 100%;
  min-width: 0;
}

@media(max-width:900px) {
  .stats {
    grid-template-columns: 1fr 1fr
  }

  .toolbar {
    grid-template-columns: 1fr
  }

  .filter-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media(max-width:500px) {
  .filter-bar {
    grid-template-columns: 1fr;
  }
}
</style>
