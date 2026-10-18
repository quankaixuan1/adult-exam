<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { call } from './api';

const TOKEN_KEY = 'adultExamAdminSession';
const statusLabels = { pending: '待审核', approved: '已通过', rejected: '需补充' };
const mode = ref('loading');
const busy = ref(false);
const error = ref('');
const token = ref(localStorage.getItem(TOKEN_KEY) || '');
const authForm = reactive({ username: '', displayName: '主管理员', password: '', confirmPassword: '' });
const data = reactive({ admin: null, stats: { total: 0, pending: 0, approved: 0, rejected: 0 }, registrations: [], page: 1, pageSize: 30, filteredTotal: 0 });
const filter = ref('');
const search = ref('');
const selected = ref(null);
const review = reactive({ status: 'approved', remark: '' });

const rows = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return data.registrations;
  return data.registrations.filter(item => [item.name, item.phone, item.school, item.level, item.major].some(value => String(value || '').toLowerCase().includes(keyword)));
});

function showError(value) {
  error.value = value && value.message ? value.message : '操作未完成，请重试';
}

async function initialize() {
  error.value = '';
  try {
    const state = await call('bootstrapStatus');
    if (!state.initialized) mode.value = 'bootstrap';
    else if (token.value) await loadDashboard();
    else mode.value = 'login';
  } catch (e) {
    showError(e);
    mode.value = 'login';
  }
}

async function submitAuth() {
  if (busy.value) return;
  error.value = '';
  if (mode.value === 'bootstrap' && authForm.password !== authForm.confirmPassword) {
    error.value = '两次输入的密码不一致';
    return;
  }
  busy.value = true;
  try {
    const result = await call(mode.value === 'bootstrap' ? 'bootstrap' : 'login', {
      username: authForm.username,
      displayName: authForm.displayName,
      password: authForm.password
    });
    token.value = result.token;
    localStorage.setItem(TOKEN_KEY, result.token);
    authForm.password = '';
    authForm.confirmPassword = '';
    await loadDashboard();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function loadDashboard(page = 1) {
  error.value = '';
  try {
    const result = await call('dashboard', { token: token.value, status: filter.value, page });
    Object.assign(data, result);
    mode.value = 'dashboard';
  } catch (e) {
    if (e.code === 'LOGIN_REQUIRED') {
      token.value = '';
      localStorage.removeItem(TOKEN_KEY);
      mode.value = 'login';
    }
    showError(e);
  }
}

function openReview(item) {
  selected.value = item;
  review.status = item.status === 'pending' ? 'approved' : item.status;
  review.remark = item.reviewRemark || '';
}

async function saveReview() {
  if (!selected.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await call('review', { token: token.value, registrationId: selected.value.id, status: review.status, remark: review.remark });
    selected.value = null;
    await loadDashboard(data.page);
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}

async function logout() {
  try { if (token.value) await call('logout', { token: token.value }); } catch (_) {}
  token.value = '';
  localStorage.removeItem(TOKEN_KEY);
  mode.value = 'login';
  data.registrations = [];
}

onMounted(initialize);
</script>

<template>
  <main v-if="mode === 'loading'" class="center-screen"><div class="loader"></div><p>正在连接管理服务</p></main>

  <main v-else-if="mode === 'bootstrap' || mode === 'login'" class="auth-shell">
    <section class="auth-copy">
      <div class="brand-mark">成</div>
      <p class="eyebrow">2026 招生服务</p>
      <h1>成人高考报名<br />管理后台</h1>
      <p>集中处理报名审核、专业配置与数据导出。</p>
    </section>
    <section class="auth-card">
      <p class="eyebrow">{{ mode === 'bootstrap' ? '首次使用' : '管理员登录' }}</p>
      <h2>{{ mode === 'bootstrap' ? '建立主管理员' : '欢迎回来' }}</h2>
      <p class="muted">{{ mode === 'bootstrap' ? '该步骤完成后不能再次自助初始化。' : '请输入管理账号继续。' }}</p>
      <form @submit.prevent="submitAuth">
        <label>账号<input v-model.trim="authForm.username" autocomplete="username" placeholder="4–32 位字母或数字" /></label>
        <label v-if="mode === 'bootstrap'">显示名称<input v-model.trim="authForm.displayName" maxlength="40" /></label>
        <label>密码<input v-model="authForm.password" type="password" autocomplete="current-password" placeholder="至少 10 位" /></label>
        <label v-if="mode === 'bootstrap'">确认密码<input v-model="authForm.confirmPassword" type="password" autocomplete="new-password" /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="busy">{{ busy ? '处理中…' : mode === 'bootstrap' ? '创建并进入后台' : '登录' }}</button>
      </form>
    </section>
  </main>

  <div v-else class="dashboard-shell">
    <aside>
      <div class="brand"><span class="brand-mark small">成</span><div><b>招生管理</b><small>成人高考报名系统</small></div></div>
      <nav><button class="active">报名审核</button><button disabled>学校与专业</button><button disabled>Excel 数据</button></nav>
      <div class="admin-box"><span>{{ data.admin?.displayName }}</span><small>{{ data.admin?.username }}</small><button @click="logout">退出登录</button></div>
    </aside>
    <main class="content">
      <header><div><p class="eyebrow">报名中心</p><h1>报名审核</h1></div><button class="outline" @click="loadDashboard(data.page)">刷新数据</button></header>
      <p v-if="error" class="error banner">{{ error }}</p>
      <section class="stats">
        <article><span>全部报名</span><strong>{{ data.stats.total }}</strong></article>
        <article><span>待审核</span><strong>{{ data.stats.pending }}</strong></article>
        <article><span>已通过</span><strong>{{ data.stats.approved }}</strong></article>
        <article><span>需补充</span><strong>{{ data.stats.rejected }}</strong></article>
      </section>
      <section class="panel">
        <div class="toolbar"><input v-model="search" placeholder="搜索姓名、手机号、学校或专业" /><select v-model="filter" @change="loadDashboard(1)"><option value="">全部状态</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">需补充</option></select></div>
        <div class="table-wrap"><table><thead><tr><th>考生</th><th>学校与专业</th><th>层次</th><th>提交时间</th><th>状态</th><th></th></tr></thead><tbody>
          <tr v-for="item in rows" :key="item.id"><td><b>{{ item.name }}</b><small>{{ item.phone }}</small></td><td><b>{{ item.school }}</b><small>{{ item.major }}</small></td><td>{{ item.level }}</td><td>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</td><td><span class="status" :class="item.status">{{ statusLabels[item.status] }}</span></td><td><button class="link-button" @click="openReview(item)">查看审核</button></td></tr>
          <tr v-if="!rows.length"><td colspan="6" class="empty">暂无符合条件的报名记录</td></tr>
        </tbody></table></div>
      </section>
    </main>
  </div>

  <div v-if="selected" class="modal-backdrop" @click.self="selected = null"><section class="modal"><button class="close" @click="selected = null">×</button><p class="eyebrow">报名详情</p><h2>{{ selected.name }}</h2><div class="detail-grid"><span>联系电话<b>{{ selected.phone }}</b></span><span>身份证号<b>{{ selected.idNumberMasked }}</b></span><span>性别与民族<b>{{ selected.gender }} · {{ selected.ethnicity }}</b></span><span>学历<b>{{ selected.education }}</b></span><span>政治面貌<b>{{ selected.politicalStatus }}</b></span><span>现居住地址<b>{{ selected.currentAddress }}</b></span><span>第二联系人<b>{{ selected.emergencyName ? selected.emergencyName + ' · ' + selected.emergencyPhone : '未填写' }}</b></span><span>工会会员 / 退役军人<b>{{ selected.unionMember ? '是' : '否' }} / {{ selected.veteran ? '是' : '否' }}</b></span><span>报考层次<b>{{ selected.level }}</b></span><span>学校<b>{{ selected.school }}</b></span><span>专业<b>{{ selected.major }}</b></span><span>报名费用<b>¥{{ selected.fee }}</b></span><span>当前状态<b>{{ statusLabels[selected.status] }}</b></span></div><label>审核结果<select v-model="review.status"><option value="approved">审核通过</option><option value="rejected">需要补充材料</option><option value="pending">继续待审核</option></select></label><label>审核备注<textarea v-model="review.remark" maxlength="500" placeholder="驳回时请说明需要补充或修改的内容"></textarea></label><p v-if="error" class="error">{{ error }}</p><button class="primary" :disabled="busy" @click="saveReview">{{ busy ? '保存中…' : '保存审核结果' }}</button></section></div>
</template>
