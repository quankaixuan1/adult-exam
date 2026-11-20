<script setup>
import { computed } from 'vue';
const props = defineProps({ modelValue: [String, Array], options: { type: [Array, Object], default: () => [] }, label: String });
const emit = defineEmits(['update:modelValue', 'change']);
const choices = computed(() => Array.isArray(props.options) ? props.options.map(value => ({ value, label: value })) : Object.entries(props.options).map(([value, label]) => ({ value, label })));
const selected = computed(() => Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : []);
function update(value, checked) {
  const next = checked ? [...new Set([...selected.value, value])] : selected.value.filter(item => item !== value);
  emit('update:modelValue', next.length ? next : '');
}
function clear() { emit('update:modelValue', ''); }
function apply() { emit('change'); }
</script>
<template>
  <fieldset class="choices">
    <legend>{{ label }}</legend>
    <div class="actions">
      <button type="button" class="clear" @click="clear">全部 / 清除筛选</button>
      <button type="button" class="apply" @click="apply">查询</button>
    </div>
    <div class="choice-list">
      <label v-for="item in choices" :key="item.value"><input type="checkbox" :checked="selected.includes(item.value)" @change="update(item.value, $event.target.checked)" /><span>{{ item.label }}</span></label>
      <span v-if="!choices.length" class="empty">暂无选项</span>
    </div>
  </fieldset>
</template>
<style scoped>
.choices {
  min-width: 0;
  border: 0;
  margin: 0;
  padding: 0;
}

legend {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
}

.clear {
  display: inline-flex;
  align-items: center;
  width: auto;
  height: 28px;
  border: 0;
  background: transparent;
  color: #2563eb;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.apply {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.apply:hover {
  background: #1d4ed8;
}

.choice-list {
  /* max-height: 220px; */
  overflow: auto;
  display: grid;
  gap: 3px;
}

.choice-list label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 7px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.choice-list label:hover {
  background: #eff6ff;
}

.choice-list input[type=checkbox] {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  padding: 0;
  margin: 0;
  accent-color: #2563eb;
}

.choice-list span {
  overflow-wrap: anywhere;
}

.empty {
  color: #94a3b8;
  font-size: 12px;
}
</style>
