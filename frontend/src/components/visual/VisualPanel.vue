<script setup>
// 视觉设计面板（V1.0 Phase 1）：Mock 数据驱动，验证模板渲染 + PNG 导出闭环
// Phase 3 接入真实文章数据（title/正文图片），此处 Mock 结构即最终 data 契约
import { ref, reactive } from 'vue';
import { exportVisualPNG } from '../../utils/visual-export.js';
import { COVER_SIZE, SECTION_CARD_SIZE } from '../../utils/visual-templates.js';
import VisualCardPreview from './VisualCardPreview.vue';
import VisualTemplateSelector from './VisualTemplateSelector.vue';

const props = defineProps({ taskId: String, title: String, themeId: String, themeOverrides: Object });

// Mock 数据（契约与 visual-templates 一致）：Phase 3 替换为任务真实数据
const coverData = reactive({
  org: '深圳信息职业技术大学',
  title: props.title || '山海电白青春突击队',
  subtitle: '文旅调研实践纪实',
  tags: ['社会实践', '文旅调研'],
  place: '深圳龙岗 · 茂名电白',
  date: '2026年8月',
  imageUrl: '', // 空 = 纯色占位（Phase 3 接 Storage 真实图）
});
const cardData = reactive({ partNum: 1, title: '旧址参观学党史', subtitle: '追溯红色足迹', imageUrl: '' });
const stylePreset = ref('journal');
const exporting = ref(false);
const exportError = ref('');
// 两个预览组件的实例引用（导出时取其 scaledRef 指向的自然尺寸节点）
const coverPreviewRef = ref(null);
const sectionPreviewRef = ref(null);

// 导出：预览节点即导出节点（同一 DOM 克隆），失败提示第几张图，不生成缺图 PNG
async function onExport(type) {
  exporting.value = true;
  exportError.value = '';
  try {
    const cmp = type === 'cover' ? coverPreviewRef.value : sectionPreviewRef.value;
    const el = cmp?.scaledRef;
    const size = type === 'cover' ? COVER_SIZE : SECTION_CARD_SIZE;
    if (!el) throw new Error('预览节点未就绪，请刷新重试');
    await exportVisualPNG(el, `${type}-${Date.now()}.png`, size);
  } catch (e) {
    exportError.value = e.message; // 图片失败/截图失败明确提示，不静默
  } finally {
    exporting.value = false;
  }
}
</script>
<template>
  <div class="visual-panel">
    <h3>视觉设计（Mock 数据 · Phase 3 接真实数据）</h3>
    <VisualTemplateSelector v-model="stylePreset" />
    <div class="preview-col">
      <p class="card-label">封面 Cover Poster</p>
      <VisualCardPreview ref="coverPreviewRef" type="cover" :data="coverData" :theme-id="themeId"
        :theme-overrides="themeOverrides || {}" :style-preset="stylePreset" :preview-width="320" />
      <button :disabled="exporting" @click="onExport('cover')">{{ exporting ? '导出中…' : '导出封面 PNG' }}</button>
    </div>
    <div class="preview-col">
      <p class="card-label">章节卡 Section Card</p>
      <VisualCardPreview ref="sectionPreviewRef" type="section" :data="cardData" :theme-id="themeId"
        :theme-overrides="themeOverrides || {}" :style-preset="stylePreset" :preview-width="200" />
      <button :disabled="exporting" @click="onExport('section')">{{ exporting ? '导出中…' : '导出章节卡 PNG' }}</button>
    </div>
    <p v-if="exportError" class="export-error">导出失败：{{ exportError }}</p>
  </div>
</template>
<style scoped>
.visual-panel { display: flex; flex-direction: column; gap: 12px; padding: 12px 0; border-bottom: 1px dashed #e5e5e5; }
.visual-panel h3 { margin: 0; font-size: 15px; }
.preview-col { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.card-label { font-size: 13px; color: #666; margin: 0; }
.export-error { color: #e74c3c; font-size: 13px; margin: 0; }
</style>
