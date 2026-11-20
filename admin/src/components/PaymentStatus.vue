<script setup>
import { computed } from 'vue';
import { Check, Loader, X, Bell, HandCoins } from 'lucide-vue-next';
import { paymentStatusLabels } from '../services/registration';
const props = defineProps({ status: String, label: String });
const icon = computed(() => ({ paid: Check, finance_pending: Loader, teacher_pending: Loader, needs_changes: X, payment_rejected: X , awaiting_payment: HandCoins})[props.status] || Bell);
</script>
<template>
  <span class="payment-badge" :class="status || 'pending'">
    <component :is="icon" :size="16" :stroke-width="2" aria-hidden="true" />{{ label || paymentStatusLabels[status] || '未缴费' }}
  </span>
</template>
<style scoped>
.payment-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
  border: 1px solid #cbd5e1;
  background: #f1f5f9;
  color: #475569;
}

.finance_pending,
.teacher_pending {
  color: #92400e;
  background: #fff3cd;
  border-color: #e8b441;
}

.paid {
  color: #166534;
  background: #dcfce7;
  border-color: #86c99c;
}

.needs_changes,
.payment_rejected {
  color: #b42318;
  background: #fee4e2;
  border-color: #f3a8a2;
}
</style>
