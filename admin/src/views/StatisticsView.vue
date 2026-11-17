<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { call } from '../services/api';
import { statusLabels, paymentStatusLabels } from '../services/registration';
const props = defineProps({ token: String });
const emit = defineEmits(['expired']);
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const mode = ref('registrations'), period = ref('month'), anchor = ref(today());
const filters = reactive({ school: '', campus: '', teacherName: '', level: '', category: '', status: '', start: '', end: '' });
const dateBasis = ref('actual');
const result = ref(null), error = ref(''), busy = ref(false);
const labels = { school: '学校', campus: '校区', teacherName: '老师', level: '层次' };
const categories = { exam: '考试费', materials: '高复教材资料费', tuition: '高复学费' };
const range = computed(() => {
  if (period.value === 'all') return { start: '', end: '' };
  if (period.value === 'custom') return { start: filters.start, end: filters.end };
  const d = new Date(`${anchor.value}T00:00:00Z`); let end;
  if (period.value === 'week') { d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); end = new Date(d); end.setUTCDate(end.getUTCDate() + 6); }
  else if (period.value === 'month') { d.setUTCDate(1); end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); }
  else { d.setUTCMonth(0, 1); end = new Date(Date.UTC(d.getUTCFullYear(), 11, 31)); }
  return { start: d.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
});
const money = n => `¥${((n || 0) / 100).toFixed(2)}`;
async function refresh(page = 1) {
  if (busy.value) return;
  error.value = ''; busy.value = true;
  try {
    if (period.value === 'custom' && (!filters.start || !filters.end)) throw Error('请选择开始和结束日期');
    result.value = await call('registrationStatistics', { token: props.token, ...filters, ...range.value, mode: mode.value, dateBasis: dateBasis.value, granularity: period.value, page });
  } catch (e) { result.value = null; error.value = e.message; if (e.code === 'LOGIN_REQUIRED') emit('expired'); }
  finally { busy.value = false; }
}
function reset() { Object.keys(filters).forEach(k => filters[k] = ''); period.value = 'month'; anchor.value = today(); refresh(); }
function switchMode(value) { mode.value = value; reset(); }
function shift(direction) {
  const d = new Date(`${range.value.start}T00:00:00Z`);
  if (period.value === 'week') d.setUTCDate(d.getUTCDate() + 7 * direction);
  else if (period.value === 'month') d.setUTCMonth(d.getUTCMonth() + direction);
  else d.setUTCFullYear(d.getUTCFullYear() + direction);
  anchor.value = d.toISOString().slice(0, 10); refresh();
}
const maxTrend = computed(() => Math.max(1, ...(result.value?.trend || []).map(r => mode.value === 'payments' ? r.amount : r.count)));
function drill(field, value) { if (value === '未分配') return; filters[field] = value; refresh(); }
onMounted(refresh);
defineExpose({ refresh });
</script>
<template>
  <div class="statistics-view">
    <div class="tabs"><button :disabled="busy" :class="mode === 'registrations' ? 'primary' : 'outline'" @click="switchMode('registrations')">报名统计</button><button :disabled="busy" :class="mode === 'payments' ? 'primary' : 'outline'" @click="switchMode('payments')">缴费统计</button></div>
    <form class="panel" @submit.prevent="refresh()">
      <fieldset :disabled="busy">
        <div class="filters">
          <label>统计周期<select v-model="period">
              <option value="week">按周</option>
              <option value="month">按月</option>
              <option value="year">按年</option>
              <option value="custom">自定义</option>
              <option value="all">全部时间</option>
            </select></label>
          <label v-if="!['custom', 'all'].includes(period)">选择{{ period === 'week' ? '周内任一天' : period === 'month' ? '月份' : '年份' }}<input v-if="period === 'month'" type="month" :value="anchor.slice(0, 7)" required @input="anchor = $event.target.value + '-01'"><input v-else-if="period === 'year'" type="number" min="1900" max="9999" :value="anchor.slice(0, 4)" required @change="anchor = $event.target.value + '-01-01'"><input v-else v-model="anchor" type="date" required></label>
          <template v-if="period === 'custom'"><label>开始日期<input v-model="filters.start" type="date" required></label><label>结束日期<input v-model="filters.end" type="date" required></label></template>
          <label v-for="(label, key) in labels" :key="key">{{ label }}<select v-model="filters[key]">
              <option value="">全部{{ label }}</option>
              <option v-for="item in result?.options[key] || []" :key="item">{{ item }}</option>
            </select></label>
          <label v-if="mode === 'payments'">日期口径<select v-model="dateBasis"><option value="actual">实际付款时间</option><option value="finance">财务确认时间</option></select></label><label v-if="mode === 'payments'">缴费类别<select v-model="filters.category">
              <option value="">全部类别</option>
              <option v-for="(label, key) in categories" :value="key" :key="key">{{ label }}</option>
            </select></label>
          <!-- <label>状态<select v-model="filters.status">
              <option value="">全部状态</option>
              <option v-for="(label, key) in (mode === 'payments' ? paymentStatusLabels : statusLabels)" :value="key" :key="key">{{ label }}</option>
            </select></label> -->
        </div>
        <div class="actions"><button class="primary">查询</button><button type="button" class="outline" @click="reset">重置</button><template v-if="!['custom', 'all'].includes(period)"><button type="button" class="outline" @click="shift(-1)">上一期</button><button type="button" class="outline" @click="anchor = today(); refresh()">回到本期</button><button type="button" class="outline" @click="shift(1)">下一期</button></template></div>
      </fieldset>
    </form>
    <p class="muted">仅统计当前账号授权范围。{{ mode === 'payments' ? '按所选日期口径统计已确认实收。实际付款时间仅采用已人工核对、单张凭证金额与累计金额一致的记录；多凭证记录暂不分摊至各付款日期。无可用日期的记录仅在全部时间显示。' : '按报名创建时间统计。' }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="result">
      <div class="cards">
        <article><span>筛选记录数</span><strong>{{ result.total }}</strong></article><template v-if="mode === 'payments'">
          <article><span>已确认实收金额</span><strong>{{ money(result.amount) }}</strong></article>
          <article><span>已确认缴费人数 / 记录数</span><strong>{{ result.confirmedCount }}</strong></article>
        </template>
        <article v-for="(count, status) in result.statuses" :key="status"><span>{{ (mode === 'payments' ? paymentStatusLabels : statusLabels)[status] || status }}</span><strong>{{ count }}</strong></article>
      </div>
      <p v-if="mode === 'payments' && result.missingDates" class="muted">{{ result.missingDates }} 条缴费记录缺少当前口径可用日期，选择全部时间可核对。</p>
      <p v-if="!result.total" class="panel">当前筛选条件下暂无数据。</p>
      <div class="grids">
        <section class="panel">
          <h3>{{ mode === 'payments' ? '已确认实收趋势' : '报名趋势' }}</h3>
          <div v-for="item in result.trend" :key="item.label" class="bar-row"><span>{{ item.label }}</span>
            <div class="track">
              <div :style="{ width: `${(mode === 'payments' ? item.amount : item.count) / maxTrend * 100}%` }"></div>
            </div><b>{{ mode === 'payments' ? money(item.amount) : item.count }}</b>
          </div>
          <p v-if="!result.trend.length" class="muted">暂无可用日期数据</p>
        </section>
        <section v-if="mode === 'payments'" class="panel">
          <h3>缴费类别实收</h3>
          <div v-for="item in result.categoryGroups" :key="item.label" class="summary-row"><span>{{ item.label }}</span><b>{{ money(item.amount) }}</b></div>
        </section>
        <section v-for="(items, key) in result.groups" :key="key" class="panel">
          <h3>按{{ labels[key] }}汇总</h3><button v-for="item in items" :key="item.label" class="summary-row" :disabled="busy" @click="drill(key, item.label)"><span>{{ item.label }}</span><b>{{ item.count }} 条{{ mode === 'payments' ? ' · ' + money(item.amount) : '' }}</b></button>
          <p v-if="!items.length" class="muted">暂无数据</p>
        </section>
      </div>
      <section class="panel">
        <h3>{{ mode === 'payments' ? '缴费' : '报名' }}明细</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学生</th>
                <th>学校</th>
                <th>老师</th>
                <th>{{ mode === 'payments' ? (dateBasis === 'actual' ? '实际付款日期' : '财务确认日期') : '报名日期' }}</th>
                <th>状态</th><template v-if="mode === 'payments'">
                  <th>费用拆分</th>
                  <th>所选范围金额</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in result.rows" :key="row.id">
                <td>{{ row.name }}</td>
                <td>{{ row.school }}</td>
                <td>{{ row.teacherName }}</td>
                <td>{{ row.date || '未记录' }}</td>
                <td>{{ (mode === 'payments' ? paymentStatusLabels : statusLabels)[row.status] || row.status }}</td><template v-if="mode === 'payments'">
                  <td><span v-for="(amount, key) in row.parts" :key="key"><template v-if="amount">{{ categories[key] }} {{ money(amount) }}；</template></span></td>
                  <td>{{ money(row.amount) }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="actions"><button class="outline" :disabled="busy || result.page <= 1" @click="refresh(result.page - 1)">上一页</button><span>{{ result.page }} / {{ result.pages }}</span><button class="outline" :disabled="busy || result.page >= result.pages" @click="refresh(result.page + 1)">下一页</button></div>
      </section>
    </template>
  </div>
</template>
<style scoped>
.tabs,
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin: 16px 0
}

.panel {
  padding: 22px;
  margin-bottom: 20px
}

fieldset {
  border: 0;
  padding: 0;
  min-width: 0
}

.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px
}

label {
  display: grid;
  gap: 8px
}

.cards {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 20px 0
}

.cards article {
  background: white;
  border: 1px solid #e0e7ef;
  border-radius: 12px;
  padding: 20px;
  min-width: 160px;
  display: grid;
  gap: 12px
}

.cards strong {
  font-size: 26px
}

.grids {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px
}

.grids .panel {
  max-height: 420px;
  overflow: auto
}

.summary-row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid #edf1f6;
  background: transparent;
  text-align: left;
  color: inherit
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
  font-size: 12px
}

.track {
  flex: 1;
  background: #edf1f6;
  height: 12px;
  border-radius: 6px;
  overflow: hidden
}

.track div {
  height: 100%;
  background: #2b6de8
}

.table-wrap {
  overflow: auto
}

th,
td {
  padding: 12px;
  text-align: left;
  white-space: nowrap
}

table {
  width: 100%;
  border-collapse: collapse
}

td {
  border-bottom: 1px solid #edf1f6
}
</style>
