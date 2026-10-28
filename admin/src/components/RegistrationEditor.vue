<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { call } from '../services/api';
const props = defineProps({ registration: Object, token: String });
const emit = defineEmits(['close', 'saved']);
const busy = ref(false), loading = ref(true), error = ref('');
const options = reactive({ campuses: [], members: [], programs: [], canAssign: false, memberId: '' });
const form = reactive({ name: '', phone: '', gender: '', ethnicity: '', education: '', workUnit: '', currentAddress: '', politicalStatus: '', emergencyName: '', emergencyPhone: '', classId: '', level: '', school: '', major: '', campus: '', teacherId: '', ...props.registration });
const levels = ['高起专', '专升本', '高起本'];
const personalFields = [
  ['name', '姓名', 40, true], ['phone', '手机号', 11, true], ['ethnicity', '民族', 20],
  ['education', '学历', 20], ['workUnit', '工作单位', 100], ['currentAddress', '现居住地址', 160],
  ['politicalStatus', '政治面貌', 20], ['emergencyName', '第二联系人', 40], ['emergencyPhone', '第二联系人电话', 11], ['classId', '班级', 100]
];
const schools = computed(() => [...new Set(options.programs.filter(p => p.level === form.level).map(p => p.school))]);
const majors = computed(() => options.programs.filter(p => p.level === form.level && p.school === form.school));
const programChanged = computed(() => !props.registration || ['level', 'school', 'major'].some(key => form[key] !== props.registration[key]));
const feeText = computed(() => !form.level ? '请先选择层次' : programChanged.value ? (form.level === '高起本' ? '5年 · 非脱产 · 报名费680元' : '2.5年 · 非脱产 · 报名费600元') : `${props.registration.duration || '—'} · ${props.registration.studyMode || '—'} · 原记录费用${props.registration.fee ?? '—'}元`);
onMounted(async () => {
  try {
    Object.assign(options, await call('registrationOptions', { token: props.token }));
    if (!props.registration && !options.canAssign) form.teacherId = options.memberId;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
});
async function save() {
  if (busy.value || loading.value) return;
  busy.value = true; error.value = '';
  try {
    await call('saveRegistration', { ...form, token: props.token, registrationId: props.registration?.id, revision: props.registration?.revision });
    emit('saved');
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="editor-backdrop" @click.self="!busy && emit('close')"><section class="editor-modal">
    <h2>{{ registration ? '修改报名信息' : '新增报名' }}</h2>
    <p class="muted">可选择任意报名校区。所属老师与报名校区分别记录；修改报考志愿后，学制和报名费按层次确定。</p>
    <form @submit.prevent="save">
      <fieldset :disabled="busy || loading">
        <div class="editor-grid">
          <label v-for="[key,label,max,required] in personalFields" :key="key">{{ label }}{{ required ? ' *' : '' }}<input v-model.trim="form[key]" :maxlength="max" :required="required" /></label>
          <label>性别<select v-model="form.gender"><option value="">未提供</option><option>男</option><option>女</option></select></label>
          <label>报名校区 *<select v-model="form.campus" required :disabled="!!registration && !options.canAssign"><option value="">请选择</option><option v-for="campus in options.campuses" :key="campus">{{ campus }}</option></select></label>
          <label>所属老师 *<select v-model="form.teacherId" required :disabled="!options.canAssign"><option value="">请选择</option><option v-for="member in options.members" :key="member.id" :value="member.id">{{ member.name }} · {{ member.campus || '管理岗位' }}</option></select></label>
          <label>报考层次 *<select v-model="form.level" required @change="form.school = ''; form.major = ''"><option value="">请选择</option><option v-for="level in levels" :key="level">{{ level }}</option></select></label>
          <label>报考学校 *<input v-model.trim="form.school" list="editor-schools" required maxlength="100" @change="form.major = ''"/><datalist id="editor-schools"><option v-for="school in schools" :key="school" :value="school"/></datalist></label>
          <label>报考专业 *<input v-model.trim="form.major" list="editor-majors" required maxlength="100"/><datalist id="editor-majors"><option v-for="program in majors" :key="program.id" :value="program.major"/></datalist></label>
        </div>
        <p>{{ feeText }}</p>
        <label><input v-model="form.isExamPrepClass" type="checkbox"/> 高考复习班</label>
        <p class="muted">院校或专业未列出时可直接输入。新录入记录的未填资料显示为未提供，保存不会标记缴费完成。</p>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="editor-actions"><button class="primary" :disabled="busy || loading">{{ busy ? '保存中…' : '保存报名信息' }}</button><button type="button" class="outline" @click="emit('close')">取消</button></div>
      </fieldset>
    </form>
  </section></div>
</template>
<style scoped>
.editor-backdrop{position:fixed;inset:0;background:#0b152b99;z-index:30;display:grid;place-items:center;padding:24px}.editor-modal{width:min(850px,100%);max-height:90vh;overflow:auto;background:white;padding:28px;border-radius:16px}.editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.editor-grid input,.editor-grid select{display:block;width:100%;padding:10px;border:1px solid #d9e1ee;border-radius:8px;margin-top:7px;box-sizing:border-box}.editor-actions{display:flex;gap:12px}.editor-actions button{width:auto}fieldset{padding:0;border:0;min-width:0}@media(max-width:650px){.editor-grid{grid-template-columns:1fr}}
</style>
