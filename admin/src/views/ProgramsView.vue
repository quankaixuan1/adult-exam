<script setup>
import programs from '../programs.json';
</script>

<template>
<section class="panel"><p class="catalog-note">与当前小程序招生计划一致，共 {{ programs.length }} 个报考选项。费用为报名费用，不代表已支付。</p><div class="table-wrap"><table><thead><tr><th>学校</th><th>层次</th><th>专业</th><th>学制</th><th>学习形式</th><th>报名费</th></tr></thead><tbody><tr v-for="p in programs" :key="p.id"><td>{{ p.school }}</td><td>{{ p.level }}</td><td>{{ p.major }}</td><td>{{ p.duration }}</td><td>{{ p.studyMode }}</td><td>¥{{ p.fee }}</td></tr></tbody></table></div></section>
</template>

<style scoped>


.catalog-note {
  padding: 16px 20px;
  color: #71809c
}
</style>
