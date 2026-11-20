<script setup>
const props = defineProps({
  parentValue: [String, Array],
  childValue: [String, Array],
  groups: { type: Array, default: () => [] },
  childLabel: String
});
const emit = defineEmits(['update:parentValue', 'update:childValue', 'change']);
function selected(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}
function parentSelection(group) {
  const children = group.children || [];
  if (!children.length) return selected(props.parentValue).includes(group.parent) ? 'all' : 'none';
  const selectedChildren = children.filter(child => selected(props.childValue).includes(child)).length;
  if (selectedChildren === children.length) return 'all';
  return selectedChildren ? 'partial' : 'none';
}
function updateParent(group, checked) {
  const parents = selected(props.parentValue);
  const children = selected(props.childValue);
  const nextParents = checked
    ? [...new Set([...parents, group.parent])]
    : parents.filter(parent => parent !== group.parent);
  const otherSelectedGroups = props.groups.filter(item => nextParents.includes(item.parent));
  const otherChildren = new Set(otherSelectedGroups.flatMap(item => item.children || []));
  const nextChildren = checked
    ? [...new Set([...children, ...(group.children || [])])]
    : children.filter(child => !(group.children || []).includes(child) || otherChildren.has(child));
  emit('update:parentValue', nextParents.length ? nextParents : '');
  emit('update:childValue', nextChildren.length ? nextChildren : '');
}
function updateChild(group, child, checked) {
  const children = selected(props.childValue);
  const nextChildren = checked
    ? [...new Set([...children, child])]
    : children.filter(item => item !== child);
  const parents = selected(props.parentValue);
  const hasSelectedChildren = (group.children || []).some(item => nextChildren.includes(item));
  const nextParents = hasSelectedChildren
    ? [...new Set([...parents, group.parent])]
    : parents.filter(parent => parent !== group.parent);
  emit('update:parentValue', nextParents.length ? nextParents : '');
  emit('update:childValue', nextChildren.length ? nextChildren : '');
}
function clear() {
  emit('update:parentValue', '');
  emit('update:childValue', '');
}
function apply() {
  emit('change');
}
</script>
<template>
  <div class="hierarchical-choices">
    <div class="actions">
      <button type="button" class="clear" @click="clear">全部 / 清除筛选</button>
      <button type="button" class="apply" @click="apply">查询</button>
    </div>
    <div class="group-list">
      <fieldset v-for="group in groups" :key="group.parent" class="choice-group">
        <label class="choice">
          <input
            type="checkbox"
            :checked="parentSelection(group) === 'all'"
            :indeterminate="parentSelection(group) === 'partial'"
            @change="updateParent(group, $event.target.checked)"
          />
          <span>{{ group.parent }}</span>
        </label>
        <div v-if="group.children.length" class="child-heading">{{ childLabel }}</div>
        <label v-for="child in group.children" :key="child" class="choice child-choice">
          <input
            type="checkbox"
            :checked="selected(childValue).includes(child)"
            @change="updateChild(group, child, $event.target.checked)"
          />
          <span>{{ child }}</span>
        </label>
      </fieldset>
      <span v-if="!groups.length" class="empty">暂无选项</span>
    </div>
  </div>
</template>
<style scoped>
.hierarchical-choices {
  min-width: 0;
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

.group-list {
  max-height: min(60vh, 480px);
  overflow: auto;
}

.choice-group {
  min-width: 0;
  border: 0;
  border-bottom: 1px solid #e8edf4;
  margin: 0;
  padding: 7px 0;
}

.choice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 7px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.choice:hover {
  background: #eff6ff;
}

.child-choice {
  padding-left: 24px;
}

.child-heading {
  padding: 5px 7px 0 24px;
  color: #64748b;
  font-size: 11px;
}

.choice input {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  padding: 0;
  margin: 0;
  accent-color: #2563eb;
}

.choice span {
  overflow-wrap: anywhere;
}

.empty {
  color: #94a3b8;
  font-size: 12px;
}
</style>
