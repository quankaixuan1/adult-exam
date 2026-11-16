<script setup>
import { onMounted, ref } from 'vue';
import { call } from '../services/api';

const programs = ref([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const catalog = await call('catalog');
    programs.value = catalog.programs;
  } catch (cause) {
    error.value = cause.message || '招生专业目录加载失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
<section class="panel">
  <p v-if="loading" class="catalog-note">正在加载招生专业目录…</p>
  <p v-else-if="error" class="catalog-note error">{{ error }}</p>
  <template v-else>
    <p class="catalog-note">与当前招生计划 API 一致，共 {{ programs.length }} 个报考选项。费用为报名费用，不代表已支付。</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>学校</th><th>层次</th><th>专业</th><th>学制</th><th>学习形式</th><th>考试科目类别</th><th>报名费</th></tr></thead>
        <tbody>
          <tr v-for="program in programs" :key="program.id">
            <td>{{ program.school }}</td><td>{{ program.level }}</td><td>{{ program.major }}</td>
            <td>{{ program.duration }}</td><td>{{ program.studyMode }}</td>
            <td>{{ program.examCategory || '—' }}</td><td>¥{{ program.fee }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</section>
</template>

<style scoped>
.catalog-note {
  padding: 16px 20px;
  color: #71809c;
}

.error {
  color: #b42318;
}
</style>
