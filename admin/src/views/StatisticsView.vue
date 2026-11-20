<script setup>
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { call } from '../services/api';
import { statusLabels, paymentStatusLabels } from '../services/registration';
const StatisticsPieChart = defineAsyncComponent(() => import('../components/StatisticsPieChart.vue'));
const props = defineProps({ token: String });
const emit = defineEmits(['expired']);
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const mode = ref('registrations'), period = ref('month'), anchor = ref(today());
const filters = reactive({ category: '', status: '', start: '', end: '' });
const dateBasis = ref('actual');
const result = ref(null), error = ref(''), busy = ref(false);
const categories = { exam: '考试费', materials: '高复教材资料费', tuition: '高复学费' };
const registrationDimensions = ['campus', 'school', 'level', 'teacherName', 'registrationSource'];
const pieColors = ['#3974df', '#12a594', '#f4a62a', '#8b6fe8', '#ef6b68', '#24a6c7', '#83b848', '#ed8645', '#6484d8', '#bd6cad'];
const range = computed(() => {
  if (period.value === 'all') return { start: '', end: '' };
  if (period.value === 'custom') return { start: filters.start, end: filters.end };
  const d = new Date(`${anchor.value}T00:00:00Z`); let end;
  if (period.value === 'week') { d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); end = new Date(d); end.setUTCDate(end.getUTCDate() + 6); }
  else if (period.value === 'month') { d.setUTCDate(1); end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); }
  else { d.setUTCMonth(0, 1); end = new Date(Date.UTC(d.getUTCFullYear(), 11, 31)); }
  return { start: d.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
});
const academicRange = computed(() => {
  const currentDate = today();
  const year = Number(currentDate.slice(0, 4));
  const startYear = currentDate >= `${year}-09-15` ? year : year - 1;
  return { academicStart: `${startYear}-09-15`, academicEnd: `${startYear + 1}-09-14` };
});
const money = n => `¥${((n || 0) / 100).toFixed(2)}`;
async function refresh(page = 1) {
  if (busy.value) return;
  error.value = ''; busy.value = true;
  try {
    if (period.value === 'custom' && (!filters.start || !filters.end)) throw Error('请选择开始和结束日期');
    result.value = await call('registrationStatistics', { token: props.token, ...filters, ...range.value, ...(mode.value === 'registrations' ? academicRange.value : {}), mode: mode.value, dateBasis: dateBasis.value, granularity: period.value, page });
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
const pieTotal = items => items.reduce((sum, item) => sum + item.count, 0);
onMounted(refresh);
defineExpose({ refresh });
</script>
<template>
  <div class="statistics-view">
    <div class="tabs">
      <button :disabled="busy" :class="mode === 'registrations' ? 'primary' : 'outline'" @click="switchMode('registrations')">报名统计</button>
      <button :disabled="busy" :class="mode === 'payments' ? 'primary' : 'outline'" @click="switchMode('payments')">缴费统计</button>
    </div>
    <form class="panel" @submit.prevent="refresh()">
      <fieldset :disabled="busy">
        <div class="filters">
          <label>统计周期<select v-model="period">
              <option value="week">{{ mode === 'registrations' ? '本周' : '按周' }}</option>
              <option value="month">{{ mode === 'registrations' ? '本月' : '按月' }}</option>
              <option v-if="mode === 'payments'" value="year">按年</option>
              <option v-if="mode === 'payments'" value="custom">自定义</option>
              <option v-if="mode === 'payments'" value="all">全部时间</option>
            </select></label>
          <label v-if="!['custom', 'all'].includes(period)">选择{{ period === 'week' ? '周内任一天' : period === 'month' ? '月份' : '年份' }}<input v-if="period === 'month'" type="month" :value="anchor.slice(0, 7)" required @click="$event.currentTarget.showPicker?.()" @input="anchor = $event.target.value + '-01'"><input v-else-if="period === 'year'" type="number" min="1900" max="9999" :value="anchor.slice(0, 4)" required @change="anchor = $event.target.value + '-01-01'"><input v-else v-model="anchor" type="date" required @click="$event.currentTarget.showPicker?.()"></label>
          <template v-if="period === 'custom'"><label>开始日期<input v-model="filters.start" type="date" required @click="$event.currentTarget.showPicker?.()"></label><label>结束日期<input v-model="filters.end" type="date" required @click="$event.currentTarget.showPicker?.()"></label></template>
          <label v-if="mode === 'payments'">日期口径<select v-model="dateBasis">
              <option value="actual">实际付款时间</option>
              <option value="finance">财务确认时间</option>
            </select></label><label v-if="mode === 'payments'">缴费类别<select v-model="filters.category">
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
    <p class="muted">仅统计当前账号授权范围。{{ mode === 'payments' ? '按所选日期口径统计已确认实收。实际付款时间仅采用已人工核对、单张凭证金额与累计金额一致的记录；多凭证记录暂不分摊至各付款日期。无可用日期的记录仅在全部时间显示。' : `按报名创建时间统计；累计学年为${academicRange.academicStart}至${academicRange.academicEnd}。` }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <template v-if="result">
      <section v-if="mode === 'registrations'" class="registration-statistics">
        <div class="registration-statistics-header">
          <strong>统计维度</strong>
          <strong>小计（{{ period === 'week' ? '本周' : '本月' }}）</strong>
          <strong>累计（本学年）</strong>
        </div>
        <section v-for="key in registrationDimensions" :key="key" class="registration-statistics-row">
          <h3>{{ result.registrationGroups?.[key]?.label || key }}</h3>
          <div v-for="column in ['subtotal', 'academicYear']" :key="column" class="pie-summary">
            <StatisticsPieChart
              :items="result.registrationGroups?.[key]?.[column] || []"
              :colors="pieColors"
              :label="result.registrationGroups?.[key]?.label || key"
            />
            <ul class="pie-legend" :class="{ 'pie-legend-expanded': key === 'teacherName' }">
              <li v-for="(item, index) in result.registrationGroups?.[key]?.[column] || []" :key="item.label">
                <i :style="{ background: pieColors[index % pieColors.length] }"></i><span>{{ item.label }}</span><b>{{ item.count }}</b>
              </li>
              <li v-if="!result.registrationGroups?.[key]?.[column]?.length" class="pie-empty">暂无数据</li>
            </ul>
          </div>
        </section>
      </section>
      <template v-else>
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
      </div>
      </template>
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

.tabs {
  flex-wrap: nowrap;
}

.tabs button {
  flex: 1;
  width: auto;
  min-width: 0;
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

.filters input,
.filters select {
  width: 100%;
  min-width: 0;
  height: 44px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #d9e1ee;
  border-radius: 9px;
  background: #fff;
  color: #17233c;
  font: inherit;
}

.filters input:focus,
.filters select:focus {
  border-color: #3974df;
  outline: none;
  box-shadow: 0 0 0 3px #3974df1c;
}

.registration-statistics {
  display: grid;
  gap: 12px;
  margin: 20px 0;
}

.registration-statistics-header,
.registration-statistics-row {
  display: grid;
  grid-template-columns: minmax(88px, .55fr) repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

.registration-statistics-header {
  align-items: center;
  padding: 16px;
  border: 1px solid #a9c2ed;
  border-radius: 12px;
  background: #dce9ff;
  color: #244777;
  font-size: 13px;
}

.registration-statistics-row {
  padding: 16px;
  border: 1px solid #e3e8f1;
  border-radius: 12px;
  background: #fff;
}

.registration-statistics-row h3 {
  margin: 0;
  font-size: 15px;
}

.pie-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.pie-legend {
  display: grid;
  flex: 1;
  min-width: 0;
  max-width: 170px;
  max-height: 180px;
  gap: 5px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.pie-legend-expanded {
  max-height: none;
  overflow: visible;
}

.pie-legend li {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.pie-legend i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.pie-legend span {
  overflow-wrap: anywhere;
}

.pie-legend b {
  font-variant-numeric: tabular-nums;
}

.pie-legend .pie-empty {
  display: block;
  color: #94a3b8;
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

@media (max-width: 700px) {
  .registration-statistics-header {
    display: none;
  }

  .registration-statistics-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .registration-statistics-row h3 {
    grid-column: 1 / -1;
  }

  .pie-summary {
    flex-direction: column;
    align-items: stretch;
  }

  .pie-legend {
    max-width: none;
  }

  .pie-summary :deep(.statistics-pie-chart) {
    align-self: center;
  }
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

</style>
