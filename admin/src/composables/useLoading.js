import { computed, ref } from 'vue';

const pendingCount = ref(0);

export const loading = computed(() => pendingCount.value > 0);

export function beginLoading() {
  pendingCount.value += 1;
}

export function endLoading() {
  pendingCount.value = Math.max(0, pendingCount.value - 1);
}
