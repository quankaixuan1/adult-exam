<script setup>
import { onMounted, reactive, ref } from 'vue';
import { call } from '../services/api';
const props = defineProps({ token: String });
const accounts = ref([]), schools = ref([]), classIds = ref([]), error = ref(''), busy = ref(false), message = ref('');
const organization = reactive({ campuses: [], members: [], positions: {} });
const permissions = { 'registrations.view': '查看与统计', 'registrations.create': '新增报名', 'registrations.edit': '修改报名', 'registrations.review': '审核报名', 'materials.view': '查看及下载材料' };
const form = reactive({ username: '', displayName: '', password: '', memberId: '', permissions: ['registrations.view'], schools: [], classIds: [], disabled: false });
const editing = ref(false);
function reset() { editing.value = false; Object.assign(form, { username: '', displayName: '', password: '', memberId: '', permissions: ['registrations.view'], schools: [], classIds: [], disabled: false }); }
function selectMember() {
  const member = organization.members.find(item => item.id === form.memberId);
  if (!member) return;
  form.displayName = member.name;
  form.permissions = ['registrations.view', 'registrations.create', 'registrations.edit', 'materials.view'];
  if (member.position !== 'teacher') form.permissions.push('registrations.review');
}
function scopeLabel(account) {
  if (account.dataScope === 'all' || account.role === 'super') return '全部校区';
  if (account.dataScope === 'campus') return `${account.campus}及本人名下的跨校区报名`;
  if (account.dataScope === 'own') return '本人名下（含跨校区）';
  return [...account.schools, ...account.classIds].join('、') || '未分配';
}
async function load() {
  try { const result = await call('accounts', { token: props.token }); accounts.value = result.accounts; schools.value = result.schools; classIds.value = result.classIds; Object.assign(organization, result.organization); }
  catch (e) { error.value = e.message; }
}
function edit(account) { editing.value = true; message.value = ''; error.value = ''; Object.assign(form, { ...account, password: '', permissions: [...account.permissions], schools: [...account.schools], classIds: [...account.classIds] }); }
async function save() {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try { await call('saveAccount', { token: props.token, ...form }); await load(); reset(); message.value = '已保存。权限变更后，该账号需要重新登录。'; }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function removeAccount(account) {
  if (busy.value || account.role === 'super') return;
  if (!window.confirm(`确定删除账号“${account.displayName}”（${account.username}）？\n删除后无法继续登录，已有登录会话失效。报名记录和组织成员资料会保留。`)) return;
  busy.value = true; error.value = ''; message.value = '';
  try {
    await call('deleteAccount', { token: props.token, accountId: account.id, username: account.username });
    accounts.value = accounts.value.filter(item => item.id !== account.id);
    if (form.username === account.username) reset();
    message.value = '账号已删除，已有登录会话已失效。报名记录和组织成员资料已保留。';
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
onMounted(load);
defineExpose({ refresh: load });
</script>
<template>
  <section class="panel account-panel">
    <h2>账号与权限</h2>
    <p class="muted">管理岗位管理全部校区；校区负责人管理本校区及本人名下的跨校区报名；报名老师管理本人名下信息。账号绑定组织成员后按人员编号授权。同名老师分别管理，账号权限仅主管理员可配置。</p>
    <div class="org-grid">
      <section v-for="campus in ['', ...organization.campuses]" :key="campus" class="org-card">
        <h3>{{ campus || '管理岗位' }}</h3>
        <p v-for="member in organization.members.filter(m => m.campus === campus)" :key="member.id">
          <b>{{ member.name }}</b> · {{ organization.positions[member.position] }}
          <small>{{ accounts.some(a => a.memberId === member.id && !a.disabled) ? '已开通账号' : '待开通账号' }}</small>
        </p>
      </section>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" class="muted" role="status">{{ message }}</p>
    <div class="table-wrap"><table><thead><tr><th>名称 / 账号</th><th>授权范围</th><th>权限</th><th>状态</th><th></th></tr></thead><tbody>
      <tr v-for="account in accounts" :key="account.id"><td><b>{{ account.displayName }}</b><small>{{ account.username }} · {{ organization.positions[account.position] || '自定义权限' }}</small></td><td>{{ scopeLabel(account) }}</td><td>{{ account.role === 'super' ? '全部' : account.permissions.map(p => permissions[p]).join('、') }}</td><td>{{ account.disabled ? '已停用' : '启用' }}</td><td><button v-if="account.role !== 'super'" class="link-button" :disabled="busy" @click="edit(account)">修改权限 / 重置密码</button><button v-if="account.role !== 'super'" class="link-button delete-account" :disabled="busy" @click="removeAccount(account)">删除账号</button></td></tr>
    </tbody></table></div>
    <form class="account-form" @submit.prevent="save">
      <h3>{{ editing ? '修改账号' : '新增账号' }}</h3>
      <label>组织成员<select v-model="form.memberId" :required="!editing" @change="selectMember"><option value="">{{ editing ? '旧账号授权（尚未绑定）' : '请选择组织成员' }}</option><option v-for="member in organization.members" :key="member.id" :value="member.id">{{ member.name }} · {{ member.campus || '管理岗位' }} · {{ organization.positions[member.position] }}</option></select></label>
      <label>登录账号<input v-model.trim="form.username" :disabled="editing" required pattern="[a-z0-9_-]{4,32}" placeholder="4–32位字母、数字、下划线或短横线"/></label>
      <label>名称<input v-model.trim="form.displayName" required maxlength="40"/></label>
      <label>{{ editing ? '重置密码（留空保留原密码）' : '初始密码' }}<input v-model="form.password" type="password" :required="!editing" minlength="10" maxlength="128" autocomplete="new-password"/></label>
      <fieldset><legend>功能权限</legend><label v-for="(label,key) in permissions" :key="key" class="check"><input type="checkbox" v-model="form.permissions" :value="key"/>{{ label }}</label></fieldset>
      <fieldset v-if="!form.memberId && editing"><legend>旧账号学校范围（绑定组织成员后停用）</legend><label v-for="school in schools" :key="school" class="check"><input type="checkbox" v-model="form.schools" :value="school"/>{{ school }}</label></fieldset>
      <fieldset v-if="!form.memberId && editing"><legend>旧账号班级范围</legend><label v-for="id in classIds" :key="id" class="check"><input type="checkbox" v-model="form.classIds" :value="id"/>{{ id }}</label></fieldset>
      <label class="check"><input type="checkbox" v-model="form.disabled"/>停用该账号</label>
      <div class="actions"><button class="primary" :disabled="busy">{{ busy ? '保存中…' : '保存账号与权限' }}</button><button type="button" class="outline" @click="reset">清空 / 新增</button></div>
    </form>
  </section>
</template>
<style scoped>
.delete-account{color:#c0392b;margin-left:12px}

.org-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:20px 0}.org-card{padding:16px;background:#f6f8fc;border-radius:10px}.org-card h3{margin-top:0}.org-card p{font-size:13px}.org-card small{display:block;color:#71809c;margin-top:4px}.account-form select{display:block;width:100%;padding:12px;margin-top:8px}
.account-panel{padding:24px}.account-panel h2{margin-top:0}.account-form{max-width:760px;margin-top:30px}.account-form>label{display:block;margin:16px 0}.account-form input:not([type=checkbox]){display:block;width:100%;padding:12px;border:1px solid #d9e1ee;border-radius:9px;margin-top:8px}.check{display:inline-flex!important;align-items:center;gap:8px;margin:8px 18px 8px 0!important}.check input{width:auto}fieldset{border:1px solid #e3e8f1;border-radius:10px;padding:16px;margin:16px 0}legend{font-weight:700}.actions{display:flex;gap:12px}.actions .primary{width:auto}
</style>
