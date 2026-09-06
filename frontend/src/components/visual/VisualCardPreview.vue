<script setup>
// 视觉卡预览：同一渲染函数产出 HTML（单一渲染源），CSS transform 仅用于显示缩放
// 导出走 exportVisualPNG（对 ref 指向的自然尺寸内层节点截图），预览/导出不同源即违规
import { computed, ref } from 'vue';
import { COVER_SIZE, SECTION_CARD_SIZE, renderCoverPoster, renderSectionCard } from '../../utils/visual-templates.js';

const props = defineProps({
  type: { type: String, default: 'cover' }, // cover | section
  data: { type: Object, required: true },
  themeId: { type: String, default: 'greenPink' },
  themeOverrides: { type: Object, default: () => ({}) },
  stylePreset: { type: String, default: 'journal' },
  previewWidth: { type: Number, default: 320 },
  composition: { type: String, default: '' },
});
// 内层自然尺寸节点引用：父组件导出时传给 exportVisualPNG
const scaledRef = ref(null);
defineExpose({ scaledRef });

const size = computed(() => (props.type === 'cover' ? COVER_SIZE : SECTION_CARD_SIZE));
const html = computed(() =>
  props.type === 'cover'
    ? renderCoverPoster(props.data, props.themeId, { overrides: props.themeOverrides, stylePreset: props.stylePreset, composition: props.composition })
    : renderSectionCard(props.data, props.themeId, { overrides: props.themeOverrides, stylePreset: props.stylePreset, composition: props.composition }),
);
// 显示缩放比 = 预览区宽度 / 模板固定宽（transform 只做显示，不进导出克隆节点）
const scale = computed(() => props.previewWidth / size.value.width);
</script>
<template>
  <!-- 外层定宽容器裁掉缩放后多余部分；内层保持自然尺寸由 transform 缩小显示 -->
  <div class="preview-wrap" :style="{ width: previewWidth + 'px', height: size.height * scale + 'px' }">
    <div ref="scaledRef" class="preview-scaled" v-html="html"
      :style="{ transform: `scale(${scale})`, transformOrigin: 'top left', width: size.width + 'px' }"></div>
  </div>
</template>
<style scoped>
.preview-wrap { overflow: hidden; border: 1px solid #eee; border-radius: 8px; }
.preview-scaled { background: #fafafa; }
</style>
