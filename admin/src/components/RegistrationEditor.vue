<script setup>
import { preparePaymentProof } from "../services/payment-proof-image";
import { computed, onMounted, reactive, ref, nextTick, watch } from 'vue';
import { validateIdNumber } from '../services/id-number';
import { call } from '../services/api';
import registrationSchema from '../services/registration-schema.json';
const selectOptions = { education: registrationSchema.educationOptions, politicalStatus: registrationSchema.politicalOptions };
const props = defineProps({ registration: Object, token: String });
const emit = defineEmits(['close', 'saved']);
const recognitionMessage = ref('');
const busy = ref(false), loading = ref(true), error = ref('');
const options = reactive({ campuses: [], members: [], programs: [], canAssign: false, memberId: '' });
const form = reactive({ unionMember: null, veteran: null, name: '', phone: '', gender: '', ethnicity: '', education: '', workUnit: '', note: '', registrationSource: '', referrer: '', currentAddress: '', politicalStatus: '', emergencyName: '', emergencyPhone: '', idNumber: '', studyCampus: '', actualPaidAmount: '', level: '', school: '', major: '', campus: '', teacherId: '', ...props.registration });
const isDevelopment = import.meta.env.DEV;
function fillTestRegistration() {
  if (!isDevelopment || props.registration || loading.value || busy.value) return;
  const member = options.members.find(m => m.id === options.memberId) || options.members.find(m => m.campus);
  const program = options.programs[0];
  if (!member || !program) { error.value = '请先加载老师和专业选项'; return; }
  Object.assign(form, {
    name: '测试考生', phone: '13800000000', gender: '女', ethnicity: '汉族',
    education: '专科', idNumber: '11010519491231002X', currentAddress: '测试地址（非真实资料）',
    politicalStatus: '群众', workUnit: '测试单位', unionMember: false, veteran: false,
    registrationSource: '新生', campus: member.campus || options.campuses[0],
    studyCampus: options.campuses[0], teacherId: member.id,
    level: program.level, school: program.school, major: program.major,
    note: '开发测试资料，请勿作为真实报名使用'
  });
}
const fieldErrors = reactive({});
const editorForm = ref(null);
const attempted = ref(false);
const feeParts = [['exam', '考试费'], ['materials', '高复教材资料费'], ['tuition', '高复学费']];
const breakdown = reactive({ exam: '', materials: '', tuition: '', ...props.registration?.paymentBreakdown });
const hasBreakdown = computed(() => feeParts.some(([key]) => breakdown[key] !== '' && breakdown[key] != null));
const paidTotal = computed(() => (feeParts.reduce((sum, [key]) => sum + Math.round(Number(breakdown[key] || 0) * 100), 0) / 100).toFixed(2));
function standardFees() {
  Object.assign(breakdown, { exam: form.level === '高起本' ? 160 : 120, materials: form.level === '高起本' ? 140 : 100, tuition: 380 });
}
const registrationSources = ['大一', '大二', '大三', '新生', '续报', '渠道', '动员'];
const levels = ['高起专', '专升本', '高起本'];
const personalFields = [
  ['name', '姓名', 40, true], ['phone', '手机号', 11, true], ['ethnicity', '民族', 20, true],
  ['education', '学历', 20, true], ['workUnit', '工作单位', 100], ['currentAddress', '现居住地址', 160, true],
  ['politicalStatus', '政治面貌', 20, true], ['emergencyName', '第二联系人', 40], ['emergencyPhone', '第二联系人电话', 11]
];
const schools = computed(() => [...new Set(options.programs.filter(p => p.level === form.level).map(p => p.school))]);
const majors = computed(() => options.programs.filter(p => p.level === form.level && p.school === form.school));
const programChanged = computed(() => !props.registration || ['level', 'school', 'major'].some(key => form[key] !== props.registration[key]));
const selectedProgram = computed(() => options.programs.find(p => p.level === form.level && p.school === form.school && p.major === form.major));
const feeText = computed(() => {
  if (!form.level) return '请先选择层次';
  if (!programChanged.value) return `${props.registration.duration || '—'} · ${props.registration.studyMode || '—'} · 原记录费用${props.registration.fee ?? '—'}元`;
  const rule = selectedProgram.value || options.programs.find(p => p.level === form.level);
  return rule ? `${rule.duration} · ${rule.studyMode} · 报名费${rule.fee}元` : '当前层次暂无费用信息';
});
onMounted(async () => {
  try {
    Object.assign(options, await call('registrationOptions', { token: props.token }));
    if (!props.registration && !options.canAssign) form.teacherId = options.memberId;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
});
function validateFields() {
  for (const key of Object.keys(fieldErrors)) if (key !== 'paymentProofUpload') delete fieldErrors[key];
  for (const [key, label, max, required] of [...personalFields, ['referrer', '介绍人', 40], ['note', '备注', 1000], ['school', '报考学校', 100, true], ['major', '报考专业', 100, true]]) {
    const value = String(form[key] || '').trim();
    if (required && !value) fieldErrors[key] = `请填写${label}`;
    else if (value.length > max) fieldErrors[key] = `${label}不能超过${max}字`;
  }
  if (!registrationSchema.genderOptions.includes(form.gender)) fieldErrors.gender = '请选择性别';
  for (const [key, options] of Object.entries(selectOptions)) {
    if (!options.includes(form[key])) fieldErrors[key] = key === 'education' ? '请选择当前学历' : '请选择政治面貌';
  }
  if (!form.idNumber && !props.registration?.hasIdentity) fieldErrors.idNumber = '请填写身份证号';
  if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone)) fieldErrors.phone = '请填写有效的11位手机号';
  if (!options.campuses.includes(form.campus)) fieldErrors.campus = '请选择报名校区';
  if (!options.members.some(member => member.id === form.teacherId)) fieldErrors.teacherId = '请选择所属老师';
  if (!levels.includes(form.level)) fieldErrors.level = '请选择报考层次';
  if (!registrationSources.includes(form.registrationSource)) fieldErrors.registrationSource = '请选择有效的报名来源';
  if (!options.campuses.includes(form.studyCampus)) fieldErrors.studyCampus = '请选择有效的就读校区';
  if (form.idNumber) {
    const message = validateIdNumber(form.idNumber);
    if (message) fieldErrors.idNumber = message;
  }
  if (form.emergencyName || form.emergencyPhone) {
    if (!form.emergencyName) fieldErrors.emergencyName = '请填写第二联系人姓名';
    if (!/^1[3-9]\d{9}$/.test(form.emergencyPhone)) fieldErrors.emergencyPhone = '请填写有效的11位联系人手机号';
  }
  if (form.actualPaidAmount !== '' && form.actualPaidAmount != null && !/^\d{1,8}(\.\d{1,2})?$/.test(String(form.actualPaidAmount))) fieldErrors.actualPaidAmount = '请输入非负金额，最多两位小数';
  if (hasBreakdown.value) for (const [key, label] of feeParts) {
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(breakdown[key] ?? ''))) fieldErrors[key] = `请填写${label}，最多两位小数`;
  }
  return Object.keys(fieldErrors).length === 0;
}
async function focusError() {
  await nextTick();
  const target = editorForm.value?.querySelector('[aria-invalid="true"]');
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target?.focus({ preventScroll: true });
}
watch(form, () => { if (attempted.value) validateFields(); }, { deep: true });
async function chooseProof(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length || busy.value) return;
  delete fieldErrors.paymentProofUpload;
  const previous = form.paymentProofUploads || [];
  if (previous.length + files.length > 5 || files.some(file => !['image/jpeg', 'image/png'].includes(file.type))) {
    error.value = '一次保存最多追加5张PNG或JPG凭证，请先保存已有图片后继续追加'; return;
  }
  busy.value = true;
  try {
    const uploads = [];
    for (const file of files) {
      const upload = await preparePaymentProof(file);
      recognitionMessage.value = `正在识别 ${file.name} 的付款金额和时间…`;
      try { upload.recognitionDraft = await call('recognizePaymentProof', { token: props.token, base64: upload.base64 }, { loading: false }); }
      catch (e) { upload.recognitionDraft = { warning: e.message || '识别失败，保存后可手动填写金额' }; }
      uploads.push(upload);
    }
    form.paymentProofUploads = [...previous, ...uploads];
    recognitionMessage.value = `已添加 ${form.paymentProofUploads.length} 条缴费记录；保存后请逐条核对付款时间和金额。`;
    error.value = '';
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
async function save() {
  if (busy.value || loading.value) return;
  attempted.value = true;
  if (!validateFields()) { error.value = '请检查标红的项目后再保存'; await focusError(); return; }
  busy.value = true; error.value = '';
  try {
    await call('saveRegistration', { ...form, ...(hasBreakdown.value ? { paymentBreakdown: Object.fromEntries(feeParts.map(([key]) => [key, breakdown[key]])) } : {}), token: props.token, registrationId: props.registration?.id, revision: props.registration?.revision });
    emit('saved');
  } catch (e) {
    error.value = e.message;
    if (e.code === 'INVALID_INPUT') {
      const labels = [...personalFields, ['referrer', '介绍人'], ['registrationSource', '报名来源'], ['note', '备注'], ['idNumber', '身份证'], ['studyCampus', '就读校区'], ['actualPaidAmount', '实际缴费金额'], ['paymentProofUpload', '凭证'], ['campus', '报名校区'], ['teacherId', '所属老师'], ['level', '层次'], ['school', '学校'], ['major', '专业']];
      for (const [key, label] of labels) if (e.message.includes(label)) fieldErrors[key] = e.message;
      await focusError();
    }
  }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="editor-backdrop" @click.self="!busy && emit('close')">
    <section class="editor-modal">
      <h2>{{ registration ? '修改报名信息' : '新增报名' }}</h2>
      <button v-if="isDevelopment && !registration" type="button" class="outline" :disabled="loading || busy" @click="fillTestRegistration">一键填入测试资料</button>
      <!-- <p class="muted">可选择任意报名校区。所属老师与报名校区分别记录；修改报考志愿后，学制和费用按层次确定。</p> -->
      <form ref="editorForm" novalidate @submit.prevent="save">
        <fieldset :disabled="busy || loading">
          <section class="info-section info-basic">
            <h3>基本信息</h3>
            <div class="editor-grid">
              <label v-for="[key, label, max, required] in personalFields" :key="key">{{ label }}<span v-if="required" class="required-marker"> *</span><select v-if="selectOptions[key]" v-model="form[key]" :required="required" :aria-invalid="!!fieldErrors[key]">
                  <option value="">未提供</option>
                  <option v-if="form[key] && !selectOptions[key].includes(form[key])" :value="form[key]">{{ form[key] }}（历史值）</option>
                  <option v-for="option in selectOptions[key]" :key="option" :value="option">{{ option }}</option>
                </select><input v-else v-model.trim="form[key]" :maxlength="max" :required="required" :aria-invalid="!!fieldErrors[key]" /><small v-if="fieldErrors[key]" class="field-error">{{ fieldErrors[key] }}</small></label>
              <label>身份证号<span v-if="!registration?.hasIdentity" class="required-marker"> *</span><input :required="!registration?.hasIdentity" v-model.trim="form.idNumber" :aria-invalid="!!fieldErrors.idNumber" maxlength="18" :placeholder="registration?.hasIdentity ? registration.idNumberMasked + '（留空保留）' : '请输入身份证号'" /><small v-if="fieldErrors.idNumber" class="field-error">{{ fieldErrors.idNumber }}</small></label>
              <label>性别<span class="required-marker"> *</span><select required v-model="form.gender" :aria-invalid="!!fieldErrors.gender">
                  <option value="">未提供</option>
                  <option>男</option>
                  <option>女</option>
                </select><small v-if="fieldErrors.gender" class="field-error">{{ fieldErrors.gender }}</small></label>




              <label>工会会员<select v-model="form.unionMember">
                  <option :value="null">未提供</option>
                  <option :value="true">是</option>
                  <option :value="false">否</option>
                </select></label>
              <label>退役军人<select v-model="form.veteran">
                  <option :value="null">未提供</option>
                  <option :value="true">是</option>
                  <option :value="false">否</option>
                </select></label>
            </div>
          </section>
          <section class="info-section info-program">
            <h3>志愿信息</h3>
            <div class="editor-grid">
              <label>就读校区 <span class="required-marker">*</span><select required v-model="form.studyCampus" :aria-invalid="!!fieldErrors.studyCampus">
                  <option value="">待定</option>
                  <option v-for="campus in options.campuses" :key="campus">{{ campus }}</option>
                </select><small v-if="fieldErrors.studyCampus" class="field-error">{{ fieldErrors.studyCampus }}</small></label>
              <label>报考层次 <span class="required-marker">*</span><select v-model="form.level" :aria-invalid="!!fieldErrors.level" required @change="form.school = ''; form.major = ''">
                  <option value="">请选择</option>
                  <option v-for="level in levels" :key="level">{{ level }}</option>
                </select><small v-if="fieldErrors.level" class="field-error">{{ fieldErrors.level }}</small></label>
              <label>报考学校 <span class="required-marker">*</span><input v-model.trim="form.school" :aria-invalid="!!fieldErrors.school" list="editor-schools" required maxlength="100" @change="form.major = ''" /><datalist id="editor-schools">
                  <option v-for="school in schools" :key="school" :value="school" />
                </datalist><small v-if="fieldErrors.school" class="field-error">{{ fieldErrors.school }}</small></label>
              <label>报考专业 <span class="required-marker">*</span><input v-model.trim="form.major" :aria-invalid="!!fieldErrors.major" list="editor-majors" required maxlength="100" /><datalist id="editor-majors">
                  <option v-for="program in majors" :key="program.id" :value="program.major" />
                </datalist><small v-if="fieldErrors.major" class="field-error">{{ fieldErrors.major }}</small></label>
            </div>
            <p>{{ feeText }}</p>
          </section>
          <section class="info-section info-payment">
            <h3>缴费信息</h3>
            <div class="editor-grid">
              <label>报名校区 <span class="required-marker">*</span><select v-model="form.campus" :aria-invalid="!!fieldErrors.campus" required :disabled="!!registration && !options.canAssign">
                  <option value="">请选择</option>
                  <option v-for="campus in options.campuses" :key="campus">{{ campus }}</option>
                </select><small v-if="fieldErrors.campus" class="field-error">{{ fieldErrors.campus }}</small></label>
              <label>所属老师 <span class="required-marker">*</span><select v-model="form.teacherId" :aria-invalid="!!fieldErrors.teacherId" required :disabled="!options.canAssign">
                  <option value="">请选择</option>
                  <option v-for="member in options.members" :key="member.id" :value="member.id">{{ member.name }} · {{
                    member.campus || '管理岗位' }}</option>
                </select><small v-if="fieldErrors.teacherId" class="field-error">{{ fieldErrors.teacherId }}</small></label>
              <label>报名来源 <span class="required-marker">*</span>
                <select required v-model="form.registrationSource" :aria-invalid="!!fieldErrors.registrationSource">
                  <option value="">未填写</option>
                  <option v-for="source in registrationSources" :key="source" :value="source">{{ source }}</option>
                </select>
                <small v-if="fieldErrors.registrationSource" class="field-error">{{ fieldErrors.registrationSource }}</small>
              </label>
              <label>介绍人<input v-model.trim="form.referrer" maxlength="40" placeholder="选填" :aria-invalid="!!fieldErrors.referrer" /><small v-if="fieldErrors.referrer" class="field-error">{{ fieldErrors.referrer }}</small></label>
              <label v-for="[key, label] in feeParts" :key="key">{{ label }}（元）<input v-model="breakdown[key]" type="number" min="0" max="99999999.99" step="1" :aria-invalid="!!fieldErrors[key]" placeholder="未填写" /><small v-if="fieldErrors[key]" class="field-error">{{ fieldErrors[key] }}</small></label>
              <div class="fee-summary">
                <div class="fee-summary-label">考前实际缴费合计：{{ hasBreakdown ? '¥' + paidTotal : form.actualPaidAmount == null || form.actualPaidAmount === '' ? '未填写' : '¥' + form.actualPaidAmount + '（历史总额，待补明细）' }}</div><button type="button" class="outline" :disabled="!form.level" @click="standardFees">按层次填入标准费用</button>
              </div>
              <p v-if="recognitionMessage" role="status">{{ recognitionMessage }}</p><div v-for="(upload,index) in form.paymentProofUploads || []" :key="index" class="payment-proof-upload"><img :src="'data:image/jpeg;base64,' + upload.base64" alt="待上传缴费凭证" style="width:80px;height:100px;object-fit:contain" /><strong>缴费记录 {{ index + 1 }} · {{ upload.fileName }}</strong><button type="button" class="outline" :disabled="busy" @click="form.paymentProofUploads.splice(index, 1)">删除此凭证</button><p>{{ upload.recognitionDraft?.paidAt || '时间未识别' }} · {{ upload.recognitionDraft?.amount ? '¥' + upload.recognitionDraft.amount : '金额未识别' }}</p><small>{{ upload.recognitionDraft?.warning }}</small></div><label class="payment-proof-field"><span>上传缴费凭证</span><input type="file" multiple accept="image/jpeg,image/png" @change="chooseProof" :aria-invalid="!!fieldErrors.paymentProofUpload" /><small>可多选或连续追加图片，每张图片为一条缴费记录。自动压缩并识别金额，每次保存最多追加5张，历史记录保留。</small><small v-if="fieldErrors.paymentProofUpload" class="field-error">{{ fieldErrors.paymentProofUpload }}</small></label>
            </div>
          </section>
          <label class="note-field">备注<textarea v-model.trim="form.note" maxlength="1000" rows="3" placeholder="选填，最多1000字" :aria-invalid="!!fieldErrors.note"></textarea><small v-if="fieldErrors.note" class="field-error">{{ fieldErrors.note }}</small></label>


          <p class="muted">院校或专业未列出时可直接输入。新录入记录的未填资料显示为未提供，上传凭证后待财务审核，通过后显示已缴费。</p>
          <p v-if="error" class="error">{{ error }}</p>
          <div class="editor-actions">
            <button class="primary" :disabled="busy || loading">{{ busy ? '保存中…' : '保存报名信息' }}</button>
            <button type="button" class="outline" @click="emit('close')">取消</button>
          </div>
        </fieldset>
      </form>
    </section>
  </div>
</template>
<style scoped>
.info-section {
  margin: 18px 0;
  padding: 18px;
  border: 1px solid;
  border-radius: 12px;
}

.info-section h3 {
  margin: 0 0 16px;
  color: #26344e;
  font-size: 17px;
}

.info-basic {
  background: #eff6ff;
  border-color: #d4e5fb;
}

.info-program {
  background: #f0f9f3;
  border-color: #d1ead9;
}

.info-payment {
  background: #fff8eb;
  border-color: #f1dfbb;
}

.info-section .detail-grid {
  padding: 0;
  background: transparent;
}

.fee-summary,
.payment-proof-field {
  display: grid;
  grid-template-rows: 24px 44px auto;
  align-content: start;
  gap: 7px;
  min-width: 0;
  margin: 0;
}

.fee-summary-label,
.payment-proof-field>span {
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
  color: inherit;
}

.fee-summary button,
.editor-grid .payment-proof-field input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  margin: 0;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 22px;
}

.note-field {
  grid-column: 1 / -1;
}

.note-field textarea {
  resize: vertical;
}

.required-marker {
  color: #c5221f;
  font-weight: 800;
  margin-left: 3px;
}

.editor-grid [aria-invalid="true"] {
  border: 2px solid #c5221f;
  background: #fff4f3;
}

.field-error {
  display: block;
  color: #b42318;
  margin-top: 6px;
  line-height: 1.5;
}

.editor-backdrop {
  position: fixed;
  inset: 0;
  background: #0b152b99;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 24px
}

.editor-modal {
  width: min(850px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: white;
  padding: 28px;
  border-radius: 16px
}

.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px
}

.editor-grid > * {
  min-width: 0;
}

.payment-proof-upload {
  grid-column: 1 / -1;
  overflow-wrap: anywhere;
}

.editor-grid input,
.editor-grid select,
.editor-grid textarea {
  display: block;
  width: 100%;
  padding: 10px;
  border: 1px solid #d9e1ee;
  border-radius: 8px;
  margin-top: 7px;
  box-sizing: border-box
}

.editor-grid input:not([type="file"]),
.editor-grid select {
  height: 44px;
  min-height: 44px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 22px;
}

.editor-actions {
  display: flex;
  gap: 12px
}

.editor-actions button {
  width: auto
}

fieldset {
  padding: 0;
  border: 0;
  min-width: 0
}

@media(max-width:650px) {
  .editor-grid {
    grid-template-columns: 1fr
  }
}
</style>
