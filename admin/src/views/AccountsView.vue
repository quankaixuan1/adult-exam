<script setup>
import { onMounted, reactive, ref } from 'vue';
import { call } from '../services/api';
const props = defineProps({ token: String });
const accounts = ref([]), schools = ref([]), classIds = ref([]), error = ref(''), busy = ref(false), message = ref('');
const permissions = { 'registrations.view': '查看报名', 'registrations.review': '审核报名', 'materials.view': '查看及下载材料' };
const form = reactive({ username: '', displayName: '', password: '', permissions: ['registrations.view'], schools: [], classIds: [], disabled: false });
const editing = ref(false);
function reset() { editing.value = false; Object.assign(form, { username: '', displayName: '', password: '', permissions: ['registrations.view'], schools: [], classIds: [], disabled: false }); }
async function load() {
  try { const result = await call('accounts', { token: props.token }); accounts.value = result.accounts; schools.value = result.schools; classIds.value = result.classIds; }
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
onMounted(load);
defineExpose({ refresh: load });
</script>
<template>
  <section class="panel account-panel">
    <h2>账号与权限</h2>
    <p class="muted">主管理员拥有全部权限。其他账号只可操作授权学校或班级的记录；两种范围取并集。未分配范围时无法查看学生。</p>
    <div class="table-wrap"><table><thead><tr><th>名称 / 账号</th><th>授权范围</th><th>权限</th><th>状态</th><th></th></tr></thead><tbody>
      <tr v-for="account in accounts" :key="account.id"><td><b>{{ account.displayName }}</b><small>{{ account.username }}</small></td><td>{{ account.role === 'super' ? '全部' : [...account.schools, ...account.classIds].join('、') || '未分配' }}</td><td>{{ account.role === 'super' ? '全部' : account.permissions.map(p => permissions[p]).join('、') }}</td><td>{{ account.disabled ? '已停用' : '启用' }}</td><td><button v-if="account.role !== 'super'" class="link-button" @click="edit(account)">修改权限 / 重置密码</button></td></tr>
    </tbody></table></div>
    <form class="account-form" @submit.prevent="save">
      <h3>{{ editing ? '修改账号' : '新增账号' }}</h3>
      <label>登录账号<input v-model.trim="form.username" :disabled="editing" required pattern="[a-z0-9_-]{4,32}" placeholder="4–32位字母、数字、下划线或短横线"/></label>
      <label>名称<input v-model.trim="form.displayName" required maxlength="40"/></label>
      <label>{{ editing ? '重置密码（留空保留原密码）' : '初始密码' }}<input v-model="form.password" type="password" :required="!editing" minlength="10" maxlength="128" autocomplete="new-password"/></label>
      <fieldset><legend>功能权限</legend><label v-for="(label,key) in permissions" :key="key" class="check"><input type="checkbox" v-model="form.permissions" :value="key"/>{{ label }}</label></fieldset>
      <fieldset><legend>学校范围（含该校所有班级）</legend><label v-for="school in schools" :key="school" class="check"><input type="checkbox" v-model="form.schools" :value="school"/>{{ school }}</label></fieldset>
      <fieldset><legend>指定班级范围</legend><label v-for="id in classIds" :key="id" class="check"><input type="checkbox" v-model="form.classIds" :value="id"/>{{ id }}</label><p v-if="!classIds.length" class="muted">暂无班级编号</p></fieldset>
      <label class="check"><input type="checkbox" v-model="form.disabled"/>停用该账号</label>
      <p v-if="error" class="error">{{ error }}</p><p v-if="message" class="muted">{{ message }}</p>
      <div class="actions"><button class="primary" :disabled="busy">{{ busy ? '保存中…' : '保存账号与权限' }}</button><button type="button" class="outline" @click="reset">清空 / 新增</button></div>
    </form>
  </section>
</template>
<style scoped>
.account-panel{padding:24px}.account-panel h2{margin-top:0}.account-form{max-width:760px;margin-top:30px}.account-form>label{display:block;margin:16px 0}.account-form input:not([type=checkbox]){display:block;width:100%;padding:12px;border:1px solid #d9e1ee;border-radius:9px;margin-top:8px}.check{display:inline-flex!important;align-items:center;gap:8px;margin:8px 18px 8px 0!important}.check input{width:auto}fieldset{border:1px solid #e3e8f1;border-radius:10px;padding:16px;margin:16px 0}legend{font-weight:700}.actions{display:flex;gap:12px}.actions .primary{width:auto}
</style>
