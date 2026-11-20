<script setup>
import { reactive, ref } from 'vue';
import { call } from '../services/api';
import { ChevronDown } from 'lucide-vue-next';
const props = defineProps({ token: String, registration: Object, entry: Object, staged: Boolean });
const emit = defineEmits(['saved', 'change']);
const info = props.entry.paymentInfo;
const draft = props.entry.recognitionDraft || {};
const localTime = value => value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 19) : '';
const form = reactive({ paidAt: info ? localTime(info.paidAt) : draft.paidAt || '', amount: info?.amount ?? draft.amount ?? '', transactionNo: info?.transactionNo || draft.transactionNo || '', channel: info?.channel || draft.channel || '' });
const busy = ref(false), error = ref(''), warning = ref(draft.warning || ''), confirmed = ref(false), collapsed = ref(!!info);
function changed() {
  if (props.staged) emit('change', { ...form, confirmed: confirmed.value });
}
function invalidate() {
  confirmed.value = false;
  changed();
}
async function scan() {
  busy.value = true; error.value = ''; invalidate();
  try { const result = await call('recognizePaymentProof', { token: props.token, ...(props.entry.base64 ? { base64: props.entry.base64 } : { registrationId: props.registration.id, proofIndex: props.entry.index }) }); Object.assign(form, result); warning.value = result.warning; changed(); }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function save() {
  busy.value = true; error.value = '';
  try { await call('confirmPaymentProof', { token: props.token, registrationId: props.registration.id, revision: props.registration.revision, proofIndex: props.entry.index, ...form, confirmed: confirmed.value }); collapsed.value = true; emit('saved'); }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
</script>
<template>
  <section class="recognition">
    <button type="button" class="recognition-toggle" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      <strong>{{ info ? '已核对付款信息' : '付款信息待核对' }}</strong>
      <span v-if="info">¥{{ info.amount }} · {{ info.paidAt ? localTime(info.paidAt).replace('T', ' ') : '时间未填写' }}</span>
      <ChevronDown :size="16" aria-hidden="true" />
    </button>
    <div v-if="!collapsed" class="recognition-content">
      <button type="button" class="outline" :disabled="busy" @click="scan">{{ busy ? '处理中…' : '识别 / 重新识别凭证' }}</button>
      <p v-if="warning" class="muted">{{ warning }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="fields">
        <label>实际付款时间（北京时间）<input v-model="form.paidAt" type="datetime-local" step="1" :disabled="busy" @input="invalidate"></label>
        <label>本张凭证金额（元）<input v-model="form.amount" type="number" min="0.01" step="0.01" :disabled="busy" @input="invalidate"></label>
        <label>交易单号（选填）<input v-model.trim="form.transactionNo" maxlength="80" :disabled="busy" @input="invalidate"></label>
        <label>支付渠道<select v-model="form.channel" :disabled="busy" @change="invalidate">
            <option value="">未识别</option>
            <option>微信</option>
            <option>支付宝</option>
            <option>银行转账</option>
            <option>其他</option>
          </select></label>
      </div>
      <label class="confirmation-checkbox"><input v-model="confirmed" @change="changed" type="checkbox" :disabled="busy">我已对照原图核对时间和金额</label>
      <small v-if="staged">勾选后随报名信息一起保存。</small>
      <button v-else type="button" class="primary" :disabled="busy || !confirmed" @click="save">确认保存付款信息</button>
      <small>此操作只保存凭证信息，不增加累计实收金额，也不代替财务审核。</small>
    </div>
  </section>
</template>
<style scoped>
.recognition {
  width: 100%;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid #e3d6bb;
  border-radius: 10px;
  display: grid;
  gap: 12px
}

.recognition-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer
}

.recognition-toggle span {
  margin-left: auto;
  color: #64748b;
  font-size: 12px
}

.recognition-toggle svg {
  flex-shrink: 0;
  transition: transform .2s
}

.recognition-toggle[aria-expanded="true"] svg {
  transform: rotate(180deg)
}

.recognition-content {
  display: grid;
  gap: 12px
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px
}

.fields label {
  display: grid;
  gap: 6px
}

.fields input,
.fields select {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  min-width: 0;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid #d9e1ee;
  border-radius: 8px;
  background: #fff;
  color: #17233c;
  font: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px
}

.fields input:focus,
.fields select:focus {
  border-color: #3974df;
  outline: none;
  box-shadow: 0 0 0 3px #3974df1c
}

.confirmation-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer
}

.confirmation-checkbox input {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  margin: 0
}

small {
  color: #64748b
}
</style>
