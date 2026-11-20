<script setup>
import HeaderFilterChoices from "../components/HeaderFilterChoices.vue";
import HierarchicalHeaderFilterChoices from "../components/HierarchicalHeaderFilterChoices.vue";
import TableHeaderFilter from "../components/TableHeaderFilter.vue";
import SensitiveValue from "../components/SensitiveValue.vue";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Download } from 'lucide-vue-next';
import { registrationXlsx } from '../services/registration-export';
import { call } from '../services/api';
import { registrationStageLabels, materialCount, showBoolean } from '../services/registration';
import PaymentStatus from '../components/PaymentStatus.vue';
import RegistrationDetail from '../components/RegistrationDetail.vue';
import RegistrationEditor from '../components/RegistrationEditor.vue';
const props = defineProps({ token: String, admin: Object });
const emit = defineEmits(['expired', 'admin']);
const error = ref('');
const data = reactive({ admin: null, stats: { total: 0, pending: 0, approved: 0, rejected: 0 }, registrations: [], page: 1, pageSize: 30, filteredTotal: 0 });
const isFinance = computed(() => (data.admin || props.admin)?.role !== 'super' && ['finance', 'financeStaff'].includes((data.admin || props.admin)?.position));
const search = ref(''), keyword = ref(''), selected = ref(null);
const startDate = ref('');
const endDate = ref('');
const selectedRowId = ref('');
const normalStages = ['registered', 'awaiting_payment', 'finance_pending', 'paid'];
function progressStages(item) {
  if (item.registrationStage !== 'needs_changes' || item.status === 'rejected') return normalStages;
  const steps = [...normalStages];
  steps[2] = 'needs_changes';
  return steps;
}
function currentProgressStage(item) {
  return item.status === 'rejected' ? 'registered' : item.registrationStage;
}
const editing = ref(false), editRecord = ref(null);
const canCreate = computed(() => data.admin?.role === 'super' || data.admin?.permissions?.includes('registrations.create'));
const canEdit = computed(() => data.admin?.role === 'super' || data.admin?.permissions?.includes('registrations.edit'));
const canDelete = computed(() => data.admin?.canDeleteRegistrations === true);
const deleting = ref(false);
const tableWrap = ref(null);
const pagination = ref(null);
const floatingTableScroll = ref(null);
const floatingTableScrollWidth = ref(0);
const floatingTableScrollStyle = ref({ display: 'none' });
let tableResizeObserver;
let tableIntersectionObserver;
let nativeScrollIntersectionObserver;
let tableVisible = false;
let nativeScrollVisible = false;
let tableScrollFrame;
let pendingTableScroll;
function updateFloatingTableScrollVisibility() {
  const hasHorizontalOverflow = tableWrap.value && tableWrap.value.scrollWidth > tableWrap.value.clientWidth + 1;
  const display = hasHorizontalOverflow && tableVisible && !nativeScrollVisible ? 'block' : 'none';
  if (floatingTableScrollStyle.value.display !== display) {
    floatingTableScrollStyle.value = { ...floatingTableScrollStyle.value, display };
  }
}
function updateFloatingTableScroll() {
  const table = tableWrap.value;
  if (!table) return;
  const bounds = table.getBoundingClientRect();
  const width = table.scrollWidth;
  const left = `${bounds.left}px`;
  const containerWidth = `${bounds.width}px`;
  if (floatingTableScrollWidth.value !== width) floatingTableScrollWidth.value = width;
  const currentStyle = floatingTableScrollStyle.value;
  if (currentStyle.left !== left || currentStyle.width !== containerWidth) {
    floatingTableScrollStyle.value = { ...currentStyle, left, width: containerWidth };
  }
  updateFloatingTableScrollVisibility();
}
function queueTableScrollSync(source, target) {
  pendingTableScroll = { source, target };
  if (tableScrollFrame !== undefined) return;
  tableScrollFrame = requestAnimationFrame(() => {
    tableScrollFrame = undefined;
    const pending = pendingTableScroll;
    pendingTableScroll = undefined;
    if (pending?.source && pending.target && pending.target.scrollLeft !== pending.source.scrollLeft) {
      pending.target.scrollLeft = pending.source.scrollLeft;
    }
  });
}
function handleTableScroll() {
  queueTableScrollSync(tableWrap.value, floatingTableScroll.value);
}
function handleFloatingTableScroll() {
  queueTableScrollSync(floatingTableScroll.value, tableWrap.value);
}
async function deleteRegistration(item) {
  if (deleting.value || !window.confirm(`确定删除“${item.name}”的报名记录吗？记录将移入最近删除，保留至本学年十月第三个周末结束，期间可由管理人员恢复。`)) return;
  deleting.value = true;
  error.value = '';
  try {
    await call('deleteRegistration', { token: props.token, registrationId: item.id });
    await Promise.all([loadDashboard(rows.value.length === 1 ? Math.max(1, data.page - 1) : data.page), loadFilterOptions()]);
  } catch (e) { showError(e); }
  finally { deleting.value = false; }
}
const filters = reactive({ studyCampus: '', registrationSource: '', unionMember: '', veteran: '', school: '', major: '', level: '', classId: '', campus: '', teacherName: '', registrationStage: '' });
const filterOptions = reactive({ studyCampus: [], registrationSource: [], school: [], major: [], level: [], classId: [], campus: [], teacherName: [], schoolMajors: [], campusTeachers: [] });
const rows = computed(() => data.registrations);

function submitSearch() {
  keyword.value = search.value.trim();
  loadDashboard(1);
}

function resetSearch() {
  search.value = '';  // 清空输入 
  keyword.value = ''; // 清空实际发送给后端的关键词 
  startDate.value = '';
  endDate.value = '';
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
      ...filters,
      token: props.token,
      keyword: keyword.value,
      school: filters.school,
      major: filters.major,
      level: filters.level,
      classId: filters.classId,
      campus: filters.campus,
      teacherName: filters.teacherName,
      startDate: startDate.value,
      endDate: endDate.value,
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
  const query = { ...filters, keyword: keyword.value, startDate: startDate.value, endDate: endDate.value, token: props.token };
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
async function savedRegistration() {
  editing.value = false;
  await Promise.all([loadDashboard(data.page), loadFilterOptions()]);
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
async function refreshPaymentDetails() {
  if (!selected.value) return;
  await Promise.all([openRegistration(selected.value.id), loadDashboard(data.page)]);
}
onMounted(async () => {
  await Promise.all([
    loadDashboard(1, { loading: false }),
    loadFilterOptions()
  ]);
  await nextTick();
  tableIntersectionObserver = new IntersectionObserver(([entry]) => {
    tableVisible = entry.isIntersecting;
    updateFloatingTableScrollVisibility();
  });
  if (tableWrap.value) tableIntersectionObserver.observe(tableWrap.value);
  nativeScrollIntersectionObserver = new IntersectionObserver(([entry]) => {
    nativeScrollVisible = entry.isIntersecting;
    updateFloatingTableScrollVisibility();
  }, { rootMargin: '0px 0px 18px 0px' });
  if (pagination.value) nativeScrollIntersectionObserver.observe(pagination.value);
  updateFloatingTableScroll();
  tableResizeObserver = new ResizeObserver(updateFloatingTableScroll);
  if (tableWrap.value) tableResizeObserver.observe(tableWrap.value);
  const table = tableWrap.value?.querySelector('table');
  if (table) tableResizeObserver.observe(table);
});
watch(() => data.registrations, async () => {
  await nextTick();
  updateFloatingTableScroll();
});
onBeforeUnmount(() => {
  tableResizeObserver?.disconnect();
  tableIntersectionObserver?.disconnect();
  nativeScrollIntersectionObserver?.disconnect();
  if (tableScrollFrame !== undefined) cancelAnimationFrame(tableScrollFrame);
});
defineExpose({ refresh: () => loadDashboard(data.page), openRegistration });
</script>
<template>
  <div class="registrations-view">
    <div class="registration-actions"><button v-if="canCreate" class="primary" @click="editRegistration()">新增报名</button><span class="muted">统计和查询仅包含当前账号有权查看的记录</span></div>
    <section class="stats">
      <article><span>全部报名</span><strong>{{ data.stats.total }}</strong></article>
      <article><span>{{ isFinance ? '待财务审核' : '报名待审核' }}</span><strong>{{ data.stats.pending }}</strong></article>
      <article><span>{{ isFinance ? '已缴费' : '报名已通过' }}</span><strong>{{ data.stats.approved }}</strong></article>
      <article><span>{{ isFinance ? '缴费审核未通过' : '报名需补充' }}</span><strong>{{ data.stats.rejected }}</strong></article>
    </section>
    <section class="panel">
      <form class="toolbar" @submit.prevent="submitSearch">
        <div class="search-box">
          <input v-model="search" maxlength="100" placeholder="搜索考生姓名" />
          <div class="date-range">
            <label>
              <input v-model="startDate" type="date" aria-label="报名开始日期" />
            </label>
            <span class="date-range-separator">至</span>
            <label>
              <span class="visually-hidden">结束日期</span>
              <input v-model="endDate" type="date" aria-label="报名结束日期" />
            </label>
          </div>
          <button class="primary" type="submit">搜索</button>
          <button class="outline" type="button" @click="resetSearch">重置</button>
          <button class="outline export-button" type="button" :disabled="exporting" @click="exportRegistrations">
            <Download :size="16" :stroke-width="2" aria-hidden="true" />{{ exporting ? `导出中（${exportCount}）` : '导出' }}
          </button>
        </div>

      </form>
      <div ref="tableWrap" class="table-wrap" @scroll="handleTableScroll">
        <table>
          <thead>
            <tr>
              <th>
                <TableHeaderFilter label="状态" :active="!!filters.registrationStage">
                  <HeaderFilterChoices v-model="filters.registrationStage" label="状态" :options="registrationStageLabels" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <th>考生</th>
              <th>
                <TableHeaderFilter label="学校与专业" :active="!!(filters.school || filters.major)">
                  <HierarchicalHeaderFilterChoices v-model:parent-value="filters.school" v-model:child-value="filters.major" child-label="专业" :groups="filterOptions.schoolMajors" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <th>
                <TableHeaderFilter label="层次" :active="!!(filters.level)">
                  <HeaderFilterChoices v-model="filters.level" label="层次" :options="filterOptions.level" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <th>
                <TableHeaderFilter label="工会" :active="!!filters.unionMember">
                  <HeaderFilterChoices v-model="filters.unionMember" label="工会" :options="{ true: '是', false: '否' }" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <th>
                <TableHeaderFilter label="退伍" :active="!!filters.veteran">
                  <HeaderFilterChoices v-model="filters.veteran" label="退伍" :options="{ true: '是', false: '否' }" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <th>
                <TableHeaderFilter label="校区/老师" :active="!!(filters.campus || filters.teacherName)">
                  <HierarchicalHeaderFilterChoices v-model:parent-value="filters.campus" v-model:child-value="filters.teacherName" child-label="老师" :groups="filterOptions.campusTeachers" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <th>
                <TableHeaderFilter label="来源" :active="!!(filters.registrationSource)">
                  <HeaderFilterChoices v-model="filters.registrationSource" label="来源" :options="filterOptions.registrationSource" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <th>
                <TableHeaderFilter label="就读校区" :active="!!(filters.studyCampus)">
                  <HeaderFilterChoices v-model="filters.studyCampus" label="就读校区" :options="filterOptions.studyCampus" @change="loadDashboard(1)" />
                </TableHeaderFilter>
              </th>
              <!-- <th>材料</th> -->
              <th>提交时间</th>

              <th class="row-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="item in rows" :key="item.id">
            <tr :class="{ 'selected-row': selectedRowId === item.id }" :aria-selected="selectedRowId === item.id" tabindex="0" @click="selectedRowId = item.id" @keydown.enter.self="selectedRowId = item.id" @keydown.space.self.prevent="selectedRowId = item.id">
              <td>
                <PaymentStatus :status="item.registrationStage" :label="registrationStageLabels[item.registrationStage]" />
              </td>

              <td><b>{{ item.name }}</b>
                <!-- <small><SensitiveValue :value="item.phone" :registration-id="item.id" /></small> -->
                <small>{{ item.studentNo }}</small>
              </td>
              <td><b>{{ item.school }}</b><small>{{ item.major }}</small></td>
              <td>{{ item.level }}</td>
              <td>{{ showBoolean(item.unionMember) }}</td>
              <td>{{ showBoolean(item.veteran) }}</td>
              <td>{{ item.campus || '待定' }}<small>{{ item.teacherName || '待分配' }}</small></td>
              <td>{{ item.registrationSource || '未提供' }}</td>
              <td>{{ item.studyCampus || '未提供' }}</td>
              <!-- <td>{{ materialCount(item) }} / 4 项</td> -->
              <td><time class="submission-date" :datetime="item.createdAt" :title="new Date(item.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })">{{ new Date(item.createdAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}</time></td>

              <td class="row-actions"><button class="link-button" @click="openReview(item)">查看详情</button><button v-if="canEdit" class="link-button" @click="editRegistration(item)">修改</button><button v-if="canDelete" class="link-button delete-button" :disabled="deleting" @click="deleteRegistration(item)">删除</button></td>
            </tr>
            <tr v-if="selectedRowId === item.id" class="student-progress">
              <td colspan="11">
                <ol :aria-label="item.name + '的报名进度'">
                  <li v-for="(stage, index) in progressStages(item)" :key="stage"
                    :class="{ reached: index <= progressStages(item).indexOf(currentProgressStage(item)) }"
                    :aria-current="stage === currentProgressStage(item) ? 'step' : undefined">
                    <span>{{ registrationStageLabels[stage] }}</span>
                  </li>
                </ol>
              </td>
            </tr>
            </template>
            <tr v-if="!rows.length">
              <td colspan="11" class="empty">暂无符合条件的报名记录</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div ref="pagination" class="pagination"><button class="outline" :disabled="data.page <= 1" @click="loadDashboard(data.page - 1)">上一页</button><span>第 {{ data.page }} 页 · 共 {{ data.filteredTotal }}
          条</span><button class="outline" :disabled="data.page * data.pageSize >= data.filteredTotal" @click="loadDashboard(data.page + 1)">下一页</button></div>
    </section>
    <p v-if="error" class="error banner">{{ error }}</p>
    <RegistrationDetail v-if="selected" :registration="selected" :token="token" :admin="data.admin || admin" @close="selected = null" @saved="selected = null; loadDashboard(data.page)" @payment-saved="refreshPaymentDetails" />
    <RegistrationEditor v-if="editing" :registration="editRecord" :token="token" @close="editing = false" @saved="savedRegistration" />
    <div ref="floatingTableScroll" class="floating-table-scroll" :style="floatingTableScrollStyle" role="region" tabindex="0" aria-label="报名表横向滚动" @scroll="handleFloatingTableScroll">
      <div :style="{ width: `${floatingTableScrollWidth}px` }"></div>
    </div>
  </div>
</template>
<style scoped>
.table-wrap { container-type: inline-size; }
.student-progress td { padding-inline: 0; background: #f8faff; }
.student-progress ol { position: sticky; left: 0; display: flex; box-sizing: border-box; width: 100%; max-width: 100cqi; margin: 0; padding: 0; list-style: none; }
.student-progress li { position: relative; flex: 1; padding-top: 16px; text-align: center; font-size: 12px; color: #64748b; }
.student-progress li::before { content: ''; position: absolute; left: 50%; top: 3px; width: 9px; height: 9px; border-radius: 50%; background: #cbd5e1; transform: translateX(-50%); z-index: 1; }
.student-progress li + li::after { content: ''; position: absolute; left: -50%; right: 50%; top: 6px; height: 3px; background: #cbd5e1; }
.student-progress li.reached::before, .student-progress li.reached::after { background: #2563eb; }
.student-progress li[aria-current="step"] { font-weight: 700; color: #1d4ed8; }
.student-progress li[aria-current="step"]::before { box-shadow: 0 0 0 3px #bfdbfe; }

.submission-date {
  cursor: help;
}

.registrations-view table {
  border-collapse: separate;
  border-spacing: 0;
}

.registrations-view tbody tr {
  cursor: pointer;
}

.registrations-view tbody tr.selected-row>td {
  background: #eaf2ff;
}

.registrations-view tbody tr.selected-row>td.row-actions {
  background: #fff;
}

.floating-table-scroll {
  position: fixed;
  bottom: 0;
  z-index: 20;
  height: 18px;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid #ccd6e6;
  border-bottom: 0;
  background: #f8fafc;
  box-shadow: 0 -3px 12px #172b4d1a;
}

.floating-table-scroll>div {
  height: 1px;
}

.delete-button {
  color: #dc2626;
}

.registrations-view .row-actions .link-button {
  border-radius: 5px;
  transition: color .15s ease, background-color .15s ease, box-shadow .15s ease;
}

.registrations-view .row-actions .link-button:hover:not(:disabled) {
  background: #eaf2ff;
  box-shadow: 0 0 8px 2px #3b82f522;
}

.registrations-view .row-actions .delete-button:hover:not(:disabled) {
  background: #fee2e2;
  box-shadow: 0 0 8px 2px #ef444422;
}

.row-actions {
  position: sticky;
  right: 0;
  z-index: 1;
  background: #fff;
  border-left: 1px solid #e3e8f1;
  box-shadow: -6px 0 8px -6px rgba(28, 51, 91, 0.2);
  white-space: nowrap;
}

th.row-actions {
  z-index: 2;
  background: #fafbfd;
}

.export-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

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

.search-box > input {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.date-range label {
  display: grid;
  gap: 4px;
  color: #71809c;
  font-size: 12px;
}

.date-range input {
  width: 150px;
  min-width: 0;
  height: 46px;
  margin: 0;
  padding: 7px 8px;
  border: 1px solid #d9e1ee;
  border-radius: 8px;
  background: #fff;
  color: #17233c;
}

.date-range-separator {
  color: #71809c;
  font-size: 12px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

@media(max-width:900px) {
  .stats {
    grid-template-columns: 1fr 1fr
  }

  .toolbar {
    grid-template-columns: 1fr
  }

  .search-box {
    flex-wrap: wrap;
  }

  .search-box > input {
    flex: 1 1 100%;
  }

  .date-range {
    flex: 1 1 100%;
  }
}

@media(max-width:500px) {
  .date-range label {
    flex: 1 1 0;
  }

  .date-range input {
    width: 100%;
  }
}
</style>
