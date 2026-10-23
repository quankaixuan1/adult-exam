<script setup>
import { ref } from 'vue';
import { useAuth } from './composables/useAuth';
import { loading } from './composables/useLoading';
import AdminLayout from './layouts/AdminLayout.vue';
import LoginView from './views/LoginView.vue';
import ProgramsView from './views/ProgramsView.vue';
import AccountsView from './views/AccountsView.vue';
import RegistrationsView from './views/RegistrationsView.vue';
const { mode, busy, error, token, submitAuth, logout } = useAuth();
const tab = ref('registrations');
const admin = ref(null);
const registrations = ref(null);
const accounts = ref(null);
function refresh() { if (tab.value === 'accounts') accounts.value?.refresh(); else registrations.value?.refresh(); }
</script>

<template>
<main v-if="mode === 'loading'" class="center-screen"><div class="loader"></div><p>正在连接管理服务</p></main>
<LoginView v-else-if="mode !== 'dashboard'" :mode="mode" :busy="busy" :error="error" @submit="submitAuth"/>
<AdminLayout v-else :admin="admin" v-model:tab="tab" :error="error" @logout="logout" @refresh="refresh">
  <RegistrationsView ref="registrations" v-show="tab === 'registrations'" :token="token" :admin="admin" @admin="admin = $event" @expired="logout"/>
  <AccountsView v-if="tab === 'accounts' && admin?.role === 'super'" ref="accounts" :token="token"/>
  <ProgramsView v-if="tab === 'programs'"/>
</AdminLayout>
<Teleport to="body">
  <div v-if="mode === 'dashboard' && loading" class="global-loading">
    <div class="global-loading-card" role="status" aria-live="polite">
      <div class="loader" aria-hidden="true"></div>
      <span>正在加载，请稍候…</span>
    </div>
  </div>
</Teleport>
</template>

<style scoped>
.global-loading {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.25);
  cursor: wait;
}

.global-loading-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 28px;
  border-radius: 12px;
  background: #fff;
  color: #17233c;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.global-loading-card .loader {
  flex-shrink: 0;
  margin: 0;
}
</style>
