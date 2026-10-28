<script setup>
import { ref } from 'vue';
defineProps({ admin: Object, tab: String, error: String, notifications: { type: Array, default: () => [] },
  unreadTotal: Number, notificationError: String, refreshingNotifications: Boolean,
  openingNotification: Boolean, canReadNotifications: Boolean });
const emit = defineEmits(['update:tab', 'refresh', 'logout', 'open-notification', 'refresh-notifications']);
const notificationsOpen = ref(false);
const titles = { registration_completed: '新报名 · 模拟缴费已完成', material_uploaded: '报名材料已提交' };
function toggleNotifications() {
  notificationsOpen.value = !notificationsOpen.value;
  if (notificationsOpen.value) emit('refresh-notifications');
}
</script>

<template>
<div class="dashboard-shell">
    <aside>
      <div class="brand"><span class="brand-mark small">成</span><div><b>招生管理</b><small>成人高考报名系统</small></div></div>
      <nav><button :class="{active: tab === 'registrations'}" @click="emit('update:tab', 'registrations')">报名管理</button><button :class="{active: tab === 'programs'}" @click="emit('update:tab', 'programs')">学校与专业</button><button v-if="admin?.role === 'super'" :class="{active: tab === 'accounts'}" @click="emit('update:tab', 'accounts')">组织与账号</button></nav>
      <div class="admin-box"><span>{{ admin?.displayName }}</span><small>{{ admin?.username }}</small><button @click="emit('logout')">退出登录</button></div>
    </aside>
    <main class="content">
      <header>
        <div><p class="eyebrow">报名中心</p><h1>{{ tab === 'accounts' ? '组织与账号' : tab === 'programs' ? '学校与专业' : '报名管理' }}</h1></div>
        <div class="header-actions">
          <button v-if="canReadNotifications" class="outline notification-toggle" :aria-expanded="notificationsOpen" @click="toggleNotifications">
            消息 <span v-if="unreadTotal" class="unread-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</span>
          </button>
          <button class="outline" @click="emit('refresh')">刷新数据</button>
        </div>
      </header>
      <section v-if="notificationsOpen && canReadNotifications" class="notification-panel" aria-label="未读消息">
        <div class="notification-heading"><h2>未读消息 · {{ unreadTotal || 0 }}</h2><button class="link-button" :disabled="refreshingNotifications" @click="emit('refresh-notifications')">{{ refreshingNotifications ? '更新中…' : '更新消息' }}</button></div>
        <p v-if="notificationError" class="error">{{ notificationError }}</p>
        <p v-if="!notifications.length" class="muted">{{ refreshingNotifications ? '正在读取消息…' : '暂无未读消息' }}</p>
        <button v-for="item in notifications" :key="item.id" class="notification-item" :disabled="openingNotification" @click="emit('open-notification', item)">
          <strong>{{ titles[item.type] || '报名更新' }}</strong>
          <span>{{ item.studentName || '考生' }} · 点击查看报名详情</span>
          <small>{{ new Date(item.createdAt).toLocaleString('zh-CN') }}</small>
        </button>
        <p v-if="unreadTotal > notifications.length" class="muted">显示最近 20 条未读消息，查看后将显示更早的消息。</p>
      </section>
      <p v-if="error" class="error banner">{{ error }}</p>
      <slot/>
    </main>
  </div>
</template>

<style scoped>
.header-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.notification-toggle { display: inline-flex; align-items: center; gap: 8px; }
.unread-badge { background: #d83b3b; color: #fff; border-radius: 999px; padding: 2px 7px; font-size: 12px; }
.notification-panel { padding: 20px; margin-bottom: 22px; background: #fff; border: 1px solid #d9e1ee; border-radius: 12px; }
.notification-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.notification-heading h2 { margin: 0; font-size: 18px; }
.notification-item { display: grid; gap: 6px; width: 100%; text-align: left; padding: 16px 0; border: 0; border-bottom: 1px solid #edf1f6; background: transparent; color: #17233c; cursor: pointer; }
.notification-item small { color: #71809c; }
.notification-item:disabled { opacity: .6; cursor: wait; }


.dashboard-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 250px 1fr
}

.dashboard-shell>aside {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 26px 20px;
  background: #13223f;
  color: #fff;
  display: flex;
  flex-direction: column
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 6px 30px
}

.brand div {
  display: grid;
  gap: 4px
}

.brand small {
  font-size: 11px;
  color: #8fa6ca
}

nav {
  display: grid;
  gap: 7px
}

nav button {
  padding: 13px 15px;
  border: 0;
  border-radius: 9px;
  text-align: left;
  background: transparent;
  color: #91a7ca;
  cursor: pointer
}

nav button.active {
  background: #ffffff16;
  color: #fff;
  font-weight: 800
}

nav button:disabled {
  cursor: not-allowed
}

.admin-box {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid #ffffff17;
  display: grid;
  gap: 5px
}

.admin-box button {
  margin-top: 10px;
  padding: 8px;
  border: 1px solid #ffffff25;
  border-radius: 8px;
  background: transparent;
  color: #d9e5f8;
  cursor: pointer
}

.content {
  min-width: 0;
  padding: 42px clamp(24px, 4vw, 64px)
}

header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 28px
}

header h1 {
  margin: 0;
  font-size: 32px
}
@media(max-width:900px){.dashboard-shell{grid-template-columns:1fr}.dashboard-shell>aside{position:static;height:auto}.brand{padding-bottom:14px}nav{display:none}.admin-box{margin:0}.content{padding:24px}}
</style>
