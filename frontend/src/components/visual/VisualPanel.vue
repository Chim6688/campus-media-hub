<script setup>
// 视觉设计面板（V1.0 Phase 3+4）：真实文章数据 + 图片库选图 + 生成 PNG 上传落库 + 自动绑定
// 数据流：TaskDetail 传任务数据 → 装配器产出 data 契约 → 预览渲染 → 导出 Blob →
//   uploadImage(source='ai') → 封面：删旧传新（type=cover）；章节卡：绑定指定槽位（position=N）
import { ref, reactive, computed, onMounted } from 'vue';
import { uploadImage, listImages, updateImage, deleteImage } from '../../api/client.js';
import { exportVisualPNG } from '../../utils/visual-export.js';
import { COVER_SIZE, SECTION_CARD_SIZE } from '../../utils/visual-templates.js';
import { buildCoverData, buildSectionData, firstContentImage } from '../../utils/visual-data.js';
import VisualCardPreview from './VisualCardPreview.vue';
import VisualTemplateSelector from './VisualTemplateSelector.vue';
import VisualImagePicker from './VisualImagePicker.vue';
import VisualSuggest from './VisualSuggest.vue'; // AI 视觉建议（Phase 6）
import VisualDesignAI from './VisualDesignAI.vue'; // AI 视觉设计（V2 Phase 2）
import VisualEditor from './VisualEditor.vue'; // 字段编辑（V2 Phase 1）
import { COMPOSITIONS, COVER_COMPOSITIONS, SECTION_COMPOSITIONS } from '../../utils/compositions.js';
import { ensurePlaceholder } from '../../utils/placeholder.js'; // 占位对齐（V2 Phase 3）

const props = defineProps({
  taskId: String, title: String, summary: String, material: Object,
  themeId: String, themeOverrides: Object, boundImages: { type: Array, default: () => [] },
});
const emit = defineEmits(['images-change', 'apply-colors']);

// 风格状态提升到 TaskDetail（Phase 2）：正文排版预览与视觉卡共用同一 stylePreset
const stylePreset = defineModel('stylePreset', { type: String, default: 'journal' });

// 正文双向绑定（V2 Phase 3）：章节卡补占位需要回写正文（模式同 ImageWorkspace）
const contentModel = defineModel('content', { type: String, default: '' });

// 任务图片（选择器数据源 + 默认主图推导）
const images = ref([]);
const loading = ref(false);
const error = ref('');

// 视觉卡数据：真实任务数据装配（title/summary/material 来自 TaskDetail）
const coverData = reactive(buildCoverData({ title: props.title, summary: props.summary, material: props.material }, null));
const cardData = reactive(buildSectionData(1, { title: props.title, summary: props.summary }, null));
// 章节卡目标槽位：默认 1，可改（绑定第 N 个 [配图：] 占位）
const cardSlot = ref(1);
// 构图状态（V2 Phase 1）：按类型分别记忆，会话态（入库持久化留 Phase 2）
const composition = reactive({ cover: 'cover-hero', section: 'section-editorial' });
// 当前编辑的视觉类型：两卡并存展示，编辑器/构图选择器跟随焦点卡
const activeType = ref('cover');
// 构图选项：按当前焦点卡类型过滤
const compositionOptions = computed(() => (activeType.value === 'cover' ? COVER_COMPOSITIONS : SECTION_COMPOSITIONS));

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
// AI 设计方案应用（V2 Phase 2）：构图+风格写入编辑态，8 色上抛 TaskDetail 进 themeOverrides
// 参数重命名 comp/preset：避免与组件内 composition reactive、stylePreset defineModel 遮蔽
function onApplyPlan({ visualType, composition: comp, stylePreset: preset, colors }) {
  composition[visualType] = comp;
  activeType.value = visualType; // 焦点切到应用的卡
  stylePreset.value = preset; // defineModel 同步 TaskDetail（正文排版同源）
  emit('apply-colors', colors);
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
    // 绑定槽位超出正文占位数 → 自动补占位（§11"插入正文"完整语义；确定性操作非 AI 决策）
    contentModel.value = ensurePlaceholder(contentModel.value, cardSlot.value, cardData.title || '章节卡');
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
    <VisualSuggest :title="title" :summary="summary" :content="contentModel" :material="material"
      @apply-cover="onApplyCover" @apply-card="onApplyCard" />
    <!-- AI 视觉设计（V2 Phase 2）：参考图 → 全维度分析 → 3 方案 -->
    <VisualDesignAI @apply-plan="onApplyPlan" />
    <p v-if="loading" class="hint">图片加载中…</p>
    <p v-if="error" class="export-error">{{ error }}</p>

    <!-- 字段编辑（V2 Phase 1）：焦点卡的字段直接改，预览实时刷新 -->
    <VisualEditor :cover-data="coverData" :card-data="cardData" :active-type="activeType" />

    <div class="preview-col" @click="activeType = 'cover'">
      <p class="card-label">封面 Cover Poster（生成后自动设为任务封面）</p>
      <select v-if="activeType === 'cover'" class="comp-select" v-model="composition.cover">
        <option v-for="c in compositionOptions" :key="c" :value="c">{{ COMPOSITIONS[c].label }}</option>
      </select>
      <VisualCardPreview ref="coverPreviewRef" type="cover" :data="coverData" :theme-id="themeId"
        :theme-overrides="themeOverrides || {}" :style-preset="stylePreset" :preview-width="320" :composition="composition.cover" />
      <div class="btn-row">
        <button type="button" :disabled="exporting" @click="openPicker('cover')">📷 换图</button>
        <button type="button" class="primary" :disabled="exporting" @click="generateCover">
          {{ exporting ? '生成中…' : '生成并设为封面' }}
        </button>
      </div>
    </div>

    <div class="preview-col" @click="activeType = 'section'">
      <p class="card-label">章节卡 Section Card（生成后绑定正文图 N）</p>
      <select v-if="activeType === 'section'" class="comp-select" v-model="composition.section">
        <option v-for="c in compositionOptions" :key="c" :value="c">{{ COMPOSITIONS[c].label }}</option>
      </select>
      <VisualCardPreview ref="sectionPreviewRef" type="section" :data="cardData" :theme-id="themeId"
        :theme-overrides="themeOverrides || {}" :style-preset="stylePreset" :preview-width="200" :composition="composition.section" />
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
.comp-select { padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; align-self: flex-start; }
.btn-row { display: flex; gap: 8px; align-items: center; }
.slot-label { font-size: 13px; color: #666; display: flex; align-items: center; gap: 4px; }
.slot-label input { width: 52px; padding: 4px 6px; }
.hint { font-size: 12px; color: #999; margin: 0; }
.export-error { color: #e74c3c; font-size: 13px; margin: 0; }
.export-done { color: #27ae60; font-size: 13px; margin: 0; }
</style>
