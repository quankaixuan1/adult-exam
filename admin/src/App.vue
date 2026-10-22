<script setup>
import { ref } from 'vue';
import { useAuth } from './composables/useAuth';
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
</template>
