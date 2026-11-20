<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { use } from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { init } from 'echarts/core';

use([PieChart, TitleComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps({
  items: { type: Array, default: () => [] },
  colors: { type: Array, required: true },
  label: { type: String, required: true }
});

const root = ref(null);
let chart;
let resizeObserver;
const total = () => props.items.reduce((sum, item) => sum + item.count, 0);

function render() {
  if (!chart) return;
  const hasData = props.items.length > 0;
  const chartData = hasData
    ? props.items.map(item => ({ name: item.label, value: item.count }))
    : [{ name: '暂无数据', value: 1, itemStyle: { color: '#e9eef6' } }];

  chart.setOption({
    animation: false,
    color: props.colors,
    title: {
      text: String(total()),
      subtext: '人',
      left: 'center',
      top: 'center',
      itemGap: 0,
      textStyle: { color: '#17233c', fontSize: 20, fontWeight: 700 },
      subtextStyle: { color: '#8491a5', fontSize: 11, lineHeight: 18 }
    },
    tooltip: {
      show: hasData,
      trigger: 'item',
      confine: false,
      renderMode: 'html',
      enterable: true,
      hideDelay: 150,
      transitionDuration: 0,
      position: (point, _params, _dom, _rect, size) => [
        size.viewSize[0] + 8,
        Math.max(0, Math.min(point[1] - size.contentSize[1] / 2, size.viewSize[1] - size.contentSize[1]))
      ],
      backgroundColor: '#17233c',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: params => `${params.name}<br/><strong>${params.value} 人</strong>（${params.percent}%）`
    },
    series: [{
      type: 'pie',
      radius: ['62%', '88%'],
      center: ['50%', '50%'],
      clockwise: true,
      padAngle: hasData ? 2 : 0,
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      emphasis: { scale: true, scaleSize: 5, itemStyle: { shadowBlur: 12, shadowColor: '#17233c26' } },
      data: chartData
    }]
  }, { notMerge: false, lazyUpdate: true, silent: true });
}

onMounted(() => {
  chart = init(root.value);
  render();
  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(root.value);
});

watch(
  () => props.items.map(item => `${item.label}\u0000${item.count}`).join('\u0001'),
  render
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="root" class="statistics-pie-chart" role="img" :aria-label="`${label}共${total()}人`"></div>
</template>

<style scoped>
.statistics-pie-chart {
  width: 180px;
  height: 180px;
  flex: 0 0 180px;
}
</style>
