<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { Filter, X } from 'lucide-vue-next';
defineProps({ label: String, active: Boolean, horizontal: Boolean });
const open = ref(false), trigger = ref(null), panel = ref(null);
const position = ref({ left: '0px', top: '0px' });
function leave(event) {
  if (!trigger.value?.contains(event.relatedTarget) && !panel.value?.contains(event.relatedTarget)) close();
}
function hoverOpen() { if (!open.value) show(false); }
function close(restoreFocus = false) {
  open.value = false;
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('keydown', keydown);
  window.removeEventListener('resize', reposition);
  document.removeEventListener('scroll', scroll, true);
  if (restoreFocus) trigger.value?.focus();
}
function outside(event) {
  if (!trigger.value?.contains(event.target) && !panel.value?.contains(event.target)) close();
}
function keydown(event) { if (event.key === 'Escape') { event.preventDefault(); close(true); } }
function scroll(event) { if (!panel.value?.contains(event.target)) close(); }
function reposition() {
  if (!trigger.value || !panel.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const bounds = panel.value.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8));
  const below = anchor.bottom;
  const top = below + bounds.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - bounds.height);
  position.value = { left: `${left}px`, top: `${top}px` };
}
async function show(focus = true) {
  if (open.value) return;
  open.value = true;
  await nextTick();
  if (!open.value) return;
  reposition();
  if (focus) panel.value?.querySelector('select, input')?.focus({ preventScroll: true });
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', keydown);
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', scroll, true);
}
function focusout(event) {
  if (!panel.value?.contains(event.relatedTarget) && !trigger.value?.contains(event.relatedTarget)) close();
}
onBeforeUnmount(() => close());
</script>
<template>
  <button ref="trigger" type="button" class="header-filter-trigger" :class="{ active, opened: open }" :title="'筛选' + label" :aria-label="'筛选' + label" :aria-expanded="open" aria-haspopup="dialog" @mouseenter="hoverOpen" @mouseleave="leave" @keydown.enter.prevent="show()" @keydown.space.prevent="show()" @keydown.down.prevent="show()" @focusout="focusout">
    <span>{{ label }}</span>
    <Filter :size="13" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <section v-if="open" ref="panel" class="header-filter-popup" :class="{ horizontal }" :style="position" role="dialog" :aria-label="label + '筛选'" @mouseleave="leave" @focusout="focusout">
      <div class="header-filter-title"><span>筛选{{ label }}</span><button type="button" class="header-filter-close" aria-label="关闭筛选" @click="close(true)">
          <X :size="16" />
        </button></div>
      <div class="header-filter-controls">
        <slot />
      </div>
      <p>可勾选多项，未勾选时显示全部。</p>
    </section>
  </Teleport>
</template>
<style scoped>
.header-filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: auto;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.header-filter-trigger svg {
  opacity: .65;
  flex-shrink: 0;
}

.header-filter-trigger:hover,
.header-filter-trigger.active,
.header-filter-trigger.opened {
  color: #2563eb;
}

.header-filter-trigger.active svg {
  opacity: 1;
}

.header-filter-trigger:focus-visible {
  outline: 2px solid #93b4f5;
  outline-offset: 4px;
  border-radius: 3px;
}

.header-filter-popup {
  position: fixed;
  z-index: 100;
  width: 248px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  color: #26344e;
  box-shadow: 0 12px 36px #172b4d29, 0 2px 6px #172b4d0d;
  text-align: left;
}

.header-filter-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
}

.header-filter-close {
  display: inline-flex;
  width: auto;
  padding: 4px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.header-filter-close:hover {
  background: #f1f5f9;
}

.header-filter-controls {
  display: grid;
  gap: 10px;
}

.header-filter-controls :deep(select),
.header-filter-controls :deep(input:not([type="checkbox"])) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 9px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #f8fafc;
  color: #26344e;
  font-size: 13px;
}

.header-filter-controls :deep(select:focus),
.header-filter-controls :deep(input:focus) {
  outline: 2px solid #bfdbfe;
  border-color: #60a5fa;
}

.header-filter-popup p {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #8491a5;
}
.header-filter-popup.horizontal { width: 480px; }
.horizontal .header-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.horizontal .header-filter-controls > :deep(:nth-child(2)) { border-left: 1px solid #e2e8f0; padding-left: 16px; }
</style>
