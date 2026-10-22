<script setup>
defineProps({ admin: Object, tab: String, error: String });
const emit = defineEmits(['update:tab', 'refresh', 'logout']);
</script>

<template>
<div class="dashboard-shell">
    <aside>
      <div class="brand"><span class="brand-mark small">成</span><div><b>招生管理</b><small>成人高考报名系统</small></div></div>
      <nav><button :class="{active: tab === 'registrations'}" @click="emit('update:tab', 'registrations')">报名审核</button><button :class="{active: tab === 'programs'}" @click="emit('update:tab', 'programs')">学校与专业</button><button v-if="admin?.role === 'super'" :class="{active: tab === 'accounts'}" @click="emit('update:tab', 'accounts')">账号与权限</button></nav>
      <div class="admin-box"><span>{{ admin?.displayName }}</span><small>{{ admin?.username }}</small><button @click="emit('logout')">退出登录</button></div>
    </aside>
    <main class="content">
      <header><div><p class="eyebrow">报名中心</p><h1>{{ tab === 'accounts' ? '账号与权限' : tab === 'programs' ? '学校与专业' : '报名审核' }}</h1></div><button class="outline" @click="emit('refresh')">刷新数据</button></header>
      <p v-if="error" class="error banner">{{ error }}</p>
      <slot/>
    </main>
  </div>
</template>

<style scoped>


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
