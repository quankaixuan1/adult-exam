import { onMounted, onUnmounted, ref, watch } from 'vue';
import { call } from '../services/api';

const POLL_INTERVAL_MS = 10000;

export function useNotifications({ token, enabled, onExpired }) {
  const notifications = ref([]);
  const unreadTotal = ref(0);
  const error = ref('');
  const refreshing = ref(false);
  let timer;
  let generation = 0;
  let disposed = false;

  function stopTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  async function refresh() {
    if (disposed || !enabled.value || document.hidden || refreshing.value) return;
    stopTimer();
    const current = generation;
    const session = token.value;
    refreshing.value = true;
    try {
      const result = await call('notifications', { token: session }, { loading: false });
      if (current !== generation) return;
      notifications.value = result.notifications;
      unreadTotal.value = result.unreadTotal;
      error.value = '';
    } catch (e) {
      if (current !== generation) return;
      error.value = e.message || '消息读取失败';
      if (e.code === 'FORBIDDEN') {
        notifications.value = [];
        unreadTotal.value = 0;
      }
      if (e.code === 'LOGIN_REQUIRED') onExpired?.();
    } finally {
      if (current === generation) {
        refreshing.value = false;
        if (!disposed && enabled.value && !document.hidden) timer = setTimeout(refresh, POLL_INTERVAL_MS);
      }
    }
  }

  async function markRead(id) {
    const current = generation;
    await call('readNotification', { token: token.value, notificationId: id }, { loading: false });
    if (current !== generation) return;
    // An earlier poll must not restore the notification we just acknowledged.
    generation += 1;
    refreshing.value = false;
    stopTimer();
    notifications.value = notifications.value.filter(item => item.id !== id);
    unreadTotal.value = Math.max(0, unreadTotal.value - 1);
    await refresh();
  }

  function visibilityChanged() {
    if (document.hidden) stopTimer();
    else refresh();
  }

  watch([enabled, token], () => {
    generation += 1;
    stopTimer();
    notifications.value = [];
    unreadTotal.value = 0;
    refreshing.value = false;
    error.value = '';
    refresh();
  }, { immediate: true });

  onMounted(() => {
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
  });
  onUnmounted(() => {
    disposed = true;
    generation += 1;
    stopTimer();
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
  });

  return { notifications, unreadTotal, error, refreshing, refresh, markRead };
}
