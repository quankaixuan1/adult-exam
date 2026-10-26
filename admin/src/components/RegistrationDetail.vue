<script setup>
import { computed, reactive, ref } from 'vue';
import { call } from '../services/api';
import { statusLabels, showValue, showBoolean } from '../services/registration';
import MaterialList from './MaterialList.vue';
const props = defineProps({ registration: Object, token: String, admin: Object });
const emit = defineEmits(['close', 'saved']);
const selected = computed(() => props.registration);
const paymentStatusText = computed(() => ({ pending: '待模拟缴费', demo_completed: '已完成模拟缴费（未真实付款）' })[props.registration.paymentStatus] || '未核验');
const canViewMaterials = computed(() => props.admin?.role === 'super' || props.admin?.permissions?.includes('materials.view'));
const canReview = computed(() => props.admin?.role === 'super' || props.admin?.permissions?.includes('registrations.review'));
const busy = ref(false);
const error = ref('');
const review = reactive({ status: props.registration.status, remark: props.registration.reviewRemark || '' });
function showError(e) { error.value = e.message || '操作未完成，请重试'; }
async function saveReview() {
  if (!props.registration || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await call('review', { token: props.token, registrationId: props.registration.id, revision: props.registration.revision, status: review.status, remark: review.remark });
    emit('saved');
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
<div  class="modal-backdrop" @click.self="emit('close')"><section class="modal"><button class="close" @click="emit('close')">×</button><p class="eyebrow">报名详情</p><h2>{{ selected.name }}</h2><p class="muted">以下为已保存的报名资料；“未提供”表示该记录缺少对应数据。</p><MaterialList v-if="canViewMaterials" :registration="selected" :token="token"/><section v-else class="permission-notice"><h3>报名材料</h3><p>当前账号没有证件材料查看权限，请联系主管理员在“账号与权限”中授权。</p></section><h3>报名资料</h3><div class="detail-grid"><span>联系电话<b>{{ showValue(selected.phone) }}</b></span><span>身份证号<b>{{ showValue(selected.idNumberMasked) }}</b></span><span>性别与民族<b>{{ showValue(selected.gender) }} · {{ showValue(selected.ethnicity) }}</b></span><span>学历<b>{{ showValue(selected.education) }}</b></span><span>工作单位<b>{{ selected.workUnit || '未填写' }}</b></span><span>学制 / 学习形式<b>{{ showValue(selected.duration) }} / {{ showValue(selected.studyMode) }}</b></span><span>政治面貌<b>{{ showValue(selected.politicalStatus) }}</b></span><span>现居住地址<b>{{ showValue(selected.currentAddress) }}</b></span><span>第二联系人<b>{{ selected.emergencyName ? selected.emergencyName + ' · ' + selected.emergencyPhone : '未填写' }}</b></span><span>工会会员 / 退役军人<b>{{ showBoolean(selected.unionMember) }} / {{ showBoolean(selected.veteran) }}</b></span><span>报考层次<b>{{ showValue(selected.level) }}</b></span><span>学校<b>{{ showValue(selected.school) }}</b></span><span>专业<b>{{ showValue(selected.major) }}</b></span><span>历史费用合计<b>{{ selected.fee == null ? '待核对' : '¥' + selected.fee }}</b></span><span>班级<b>{{ selected.classId || '待分班' }}</b></span><span>报名老师<b>{{ selected.teacherName || '未提供' }}</b></span><span>学生编号<b>{{ selected.studentNo || '未提供' }}</b></span><span>来源<b>{{ selected.source === 'excel-original-990' ? '原表导入，第' + selected.sourceRow + '行' : '小程序' }}</b></span><span>支付状态<b>{{ paymentStatusText }}</b></span><span>当前状态<b>{{ statusLabels[selected.status] }}</b></span></div><section v-if="canReview" class="review-panel"><h3>报名审核</h3><label>审核结果<select v-model="review.status"><option value="approved">审核通过</option><option value="rejected">需要补充材料</option><option value="pending">继续待审核</option></select></label><label>审核备注<textarea v-model="review.remark" maxlength="500" placeholder="驳回时请说明需要补充或修改的内容"></textarea></label><p v-if="error" class="error">{{ error }}</p><button class="primary" :disabled="busy" @click="saveReview">{{ busy ? '保存中…' : '保存审核结果' }}</button></section><p v-else class="permission-notice">当前账号没有报名审核权限，请联系主管理员授权。</p></section></div>
</template>

<style scoped>


.modal-backdrop {
  position: fixed;
  inset: 0;
  padding: 30px;
  background: #0b152b99;
  display: grid;
  place-items: center;
  z-index: 20
}

.modal {
  position: relative;
  width: min(640px, 100%);
  max-height: 90vh;
  padding: 30px;
  border-radius: 16px;
  background: #fff;
  overflow: auto
}

.modal h2 {
  margin: 0 0 22px;
  font-size: 28px
}

.close {
  position: absolute;
  right: 20px;
  top: 17px;
  border: 0;
  background: transparent;
  color: #71809c;
  font-size: 28px;
  cursor: pointer
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 18px;
  border-radius: 12px;
  background: #f6f8fc
}

.detail-grid span {
  color: #7a879c;
  font-size: 12px
}

.detail-grid b {
  display: block;
  margin-top: 6px;
  color: #26344e;
  font-size: 14px
}
.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-grid span{min-width:0}.detail-grid b{white-space:normal;overflow-wrap:anywhere;line-height:1.6;min-height:1.6em}
@media(max-width:900px){.detail-grid{grid-template-columns:1fr}}
.review-section{margin-top:24px;padding-top:18px;border-top:1px solid #e3e8f1;scroll-margin-top:16px}.review-jump{margin-bottom:12px}
.review-panel{margin-top:24px;border-top:1px solid #e3e8f1;padding-top:16px}.permission-notice{padding:16px;background:#fff5dc;border-radius:10px;color:#76602d}
</style>
