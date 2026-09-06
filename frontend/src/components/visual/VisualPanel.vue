<script setup>
// 视觉设计面板（V1.0 Phase 3+4）：真实文章数据 + 图片库选图 + 生成 PNG 上传落库 + 自动绑定
// 数据流：TaskDetail 传任务数据 → 装配器产出 data 契约 → 预览渲染 → 导出 Blob →
//   uploadImage(source='ai') → 封面：删旧传新（type=cover）；章节卡：绑定指定槽位（position=N）
import { ref, reactive, onMounted } from 'vue';
import { uploadImage, listImages, updateImage, deleteImage } from '../../api/client.js';
import { exportVisualPNG } from '../../utils/visual-export.js';
import { COVER_SIZE, SECTION_CARD_SIZE } from '../../utils/visual-templates.js';
import { buildCoverData, buildSectionData, firstContentImage } from '../../utils/visual-data.js';
import VisualCardPreview from './VisualCardPreview.vue';
import VisualTemplateSelector from './VisualTemplateSelector.vue';
import VisualImagePicker from './VisualImagePicker.vue';
import VisualSuggest from './VisualSuggest.vue'; // AI 视觉建议（Phase 6）

const props = defineProps({
  taskId: String, title: String, summary: String, content: String, material: Object,
  themeId: String, themeOverrides: Object, boundImages: { type: Array, default: () => [] },
});
const emit = defineEmits(['images-change']);

// 风格状态提升到 TaskDetail（Phase 2）：正文排版预览与视觉卡共用同一 stylePreset
const stylePreset = defineModel('stylePreset', { type: String, default: 'journal' });

// 任务图片（选择器数据源 + 默认主图推导）
const images = ref([]);
const loading = ref(false);
const error = ref('');

// 视觉卡数据：真实任务数据装配（title/summary/material 来自 TaskDetail）
const coverData = reactive(buildCoverData({ title: props.title, summary: props.summary, material: props.material }, null));
const cardData = reactive(buildSectionData(1, { title: props.title, summary: props.summary }, null));
// 章节卡目标槽位：默认 1，可改（绑定第 N 个 [配图：] 占位）
const cardSlot = ref(1);

async function refreshImages() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listImages(props.taskId);
    images.value = data.images;
    // 默认主图：未绑定正文图池的第一张（仅在视觉卡 imageUrl 为空时自动填充）
    if (!coverData.imageUrl) coverData.imageUrl = firstContentImage(images.value)?.url || '';
    if (!cardData.imageUrl) cardData.imageUrl = firstContentImage(images.value)?.url || '';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(refreshImages);

// —— 图片选择弹窗 ——
const picker = reactive({ show: false, target: '' }); // target: 'cover' | 'card'
function openPicker(target) { picker.target = target; picker.show = true; }
function onPick(img) {
  if (picker.target === 'cover') coverData.imageUrl = img.url;
  else cardData.imageUrl = img.url;
  picker.show = false;
}

// —— AI 建议应用（Phase 6）：预填编辑态（小编确认后手动点生成，AI 不代决策）——
function onApplyCover({ subtitle, tags }) {
  if (subtitle) coverData.subtitle = subtitle;
  if (tags.length) coverData.tags = tags;
}
function onApplyCard(c) {
  cardData.partNum = c.partNum;
  cardData.title = c.title;
  if (c.subtitle) cardData.subtitle = c.subtitle;
  cardSlot.value = c.slot;
}

// —— 生成并上传 ——
const exporting = ref(false);
const exportError = ref('');
const exportDone = ref('');
// 两个预览组件的实例引用（导出时取其 scaledRef 指向的自然尺寸节点）
const coverPreviewRef = ref(null);
const sectionPreviewRef = ref(null);

// 生成封面并设为任务封面：截图 Blob → 删旧封面行 → 上传新行（type=cover, source=ai）
async function generateCover() {
  exporting.value = true; exportError.value = ''; exportDone.value = '';
  try {
    const el = coverPreviewRef.value?.scaledRef;
    if (!el) throw new Error('预览节点未就绪，请刷新重试');
    const blob = await exportVisualPNG(el, 'cover.png', COVER_SIZE, { returnBlob: true });
    const file = new File([blob], `cover-${Date.now()}.png`, { type: 'image/png' });
    // 旧封面删除（同任务仅一张 cover；删除即替换，避免多 cover 歧义）
    const oldCover = images.value.find((i) => i.type === 'cover');
    if (oldCover) await deleteImage(oldCover.id);
    await uploadImage(file, { taskId: props.taskId, type: 'cover', position: 0, caption: '视觉模板封面', source: 'ai' });
    await refreshImages();
    emit('images-change'); // 通知 TaskDetail 同步封面状态（发布前检查用）
    exportDone.value = '封面已生成并设为任务封面 ✓';
  } catch (e) {
    exportError.value = '封面生成失败：' + e.message;
  } finally {
    exporting.value = false;
  }
}

// 生成章节卡并绑定槽位：截图 Blob → 旧槽位图解绑（position=0 回库）→ 上传新行（position=cardSlot, source=ai）
async function generateSectionCard() {
  exporting.value = true; exportError.value = ''; exportDone.value = '';
  try {
    const el = sectionPreviewRef.value?.scaledRef;
    if (!el) throw new Error('预览节点未就绪，请刷新重试');
    if (!(cardSlot.value >= 1)) throw new Error('槽位须为正整数');
    const blob = await exportVisualPNG(el, 'section.png', SECTION_CARD_SIZE, { returnBlob: true });
    const file = new File([blob], `section-${Date.now()}.png`, { type: 'image/png' });
    // 目标槽位已有图：解绑回库（用户真实照片优先保留，视觉卡可随时重新生成）
    const occupying = images.value.find((i) => i.type === 'content' && i.position === cardSlot.value);
    if (occupying) await updateImage(occupying.id, { position: 0 });
    await uploadImage(file, { taskId: props.taskId, type: 'content', position: cardSlot.value, caption: cardData.title || '章节卡', source: 'ai' });
    await refreshImages();
    emit('images-change'); // 通知配图工作台/步骤条同步
    exportDone.value = `章节卡已生成并绑定第 ${cardSlot.value} 图 ✓`;
  } catch (e) {
    exportError.value = '章节卡生成失败：' + e.message;
  } finally {
    exporting.value = false;
  }
}
</script>
<template>
  <div class="visual-panel">
    <h3>视觉设计</h3>
    <VisualTemplateSelector v-model="stylePreset" />
    <!-- AI 视觉建议（Phase 6）：分析文章 → 一键预填封面/章节卡文案 -->
    <VisualSuggest :title="title" :summary="summary" :content="content" :material="material"
      @apply-cover="onApplyCover" @apply-card="onApplyCard" />
    <p v-if="loading" class="hint">图片加载中…</p>
    <p v-if="error" class="export-error">{{ error }}</p>

    <div class="preview-col">
      <p class="card-label">封面 Cover Poster（生成后自动设为任务封面）</p>
      <VisualCardPreview ref="coverPreviewRef" type="cover" :data="coverData" :theme-id="themeId"
        :theme-overrides="themeOverrides || {}" :style-preset="stylePreset" :preview-width="320" />
      <div class="btn-row">
        <button type="button" :disabled="exporting" @click="openPicker('cover')">📷 换图</button>
        <button type="button" class="primary" :disabled="exporting" @click="generateCover">
          {{ exporting ? '生成中…' : '生成并设为封面' }}
        </button>
      </div>
    </div>

    <div class="preview-col">
      <p class="card-label">章节卡 Section Card（生成后绑定正文图 N）</p>
      <VisualCardPreview ref="sectionPreviewRef" type="section" :data="cardData" :theme-id="themeId"
        :theme-overrides="themeOverrides || {}" :style-preset="stylePreset" :preview-width="200" />
      <div class="btn-row">
        <label class="slot-label">绑定图
          <input type="number" v-model.number="cardSlot" min="1" max="9" />
        </label>
        <button type="button" :disabled="exporting" @click="openPicker('card')">📷 换图</button>
        <button type="button" class="primary" :disabled="exporting" @click="generateSectionCard">
          {{ exporting ? '生成中…' : '生成并绑定' }}
        </button>
      </div>
      <p class="hint">已绑定 {{ boundImages.length }} 张正文图；被顶替的旧图会回到图片库</p>
    </div>

    <p v-if="exportError" class="export-error">{{ exportError }}</p>
    <p v-if="exportDone" class="export-done">{{ exportDone }}</p>

    <!-- 图片选择弹窗：所有图可选（引用 URL，不动绑定关系） -->
    <VisualImagePicker :task-id="taskId" :show="picker.show" @select="onPick" @close="picker.show = false" />
  </div>
</template>
<style scoped>
.visual-panel { display: flex; flex-direction: column; gap: 12px; padding: 12px 0; border-bottom: 1px dashed #e5e5e5; }
.visual-panel h3 { margin: 0; font-size: 15px; }
.preview-col { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.card-label { font-size: 13px; color: #666; margin: 0; }
.btn-row { display: flex; gap: 8px; align-items: center; }
.slot-label { font-size: 13px; color: #666; display: flex; align-items: center; gap: 4px; }
.slot-label input { width: 52px; padding: 4px 6px; }
.hint { font-size: 12px; color: #999; margin: 0; }
.export-error { color: #e74c3c; font-size: 13px; margin: 0; }
.export-done { color: #27ae60; font-size: 13px; margin: 0; }
</style>
