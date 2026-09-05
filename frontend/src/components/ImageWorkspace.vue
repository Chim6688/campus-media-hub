<script setup>
// 配图工作台（V1.0 Phase 3）：封面图 + 配图计划 + 正文槽位 + 图片库
// 数据流：所有上传统一 position=0 入池 → 槽位绑定/换图/移除 = PATCH position（§7 解耦：不改正文）
// 公众号预览内渲染真实图片属 Phase 4（wechat-format 改造）
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { request, listImages, updateImage, deleteImage } from '../api/client.js';
import { buildSlots, normalizeSuggestions, insertMissingPlaceholders } from '../utils/images.js';
import ImageUploader from './ImageUploader.vue';
import ImageSlot from './ImageSlot.vue';
import ImageLibrary from './ImageLibrary.vue';

// title/summary/content/material 供 AI 分析文章（§14 输入）；content 可回写（补占位）
const props = defineProps({ taskId: String, title: String, summary: String, content: String, material: Object });
// 配图计划双向绑定到 TaskDetail 的 photoNotes（自动保存链路不变）
const photoNotes = defineModel('photoNotes', { type: String, default: '' });
// 正文双向绑定（Phase 5 补占位用；写入走 TaskDetail 既有自动保存 watch）
const contentModel = defineModel('content', { type: String, default: '' });
const emit = defineEmits(['bound-change', 'cover-change']);

const images = ref([]);
const loading = ref(false);
const error = ref('');
// 图片库弹窗上下文：fill=空槽选图；replace=换图（先解绑旧图再绑新图）
const library = reactive({ show: false, context: null });

// 封面 = 第一张 cover 图；槽位由纯函数按图片+配图计划推导
const cover = computed(() => images.value.find((i) => i.type === 'cover'));
const slots = computed(() => buildSlots(images.value, photoNotes.value));

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listImages(props.taskId);
    images.value = data.images;
    emitBound();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
// 已绑定正文图（按 position 升序）→ 供步骤条计数 + 预览/复制渲染真实图（Phase 4 同源数据）
// 封面状态一并上报（Phase 6 发布前检查用）
function emitBound() {
  const bound = images.value
    .filter((i) => i.type === 'content' && i.position > 0)
    .sort((a, b) => a.position - b.position);
  emit('bound-change', bound);
  emit('cover-change', !!images.value.some((i) => i.type === 'cover'));
}

watch(() => props.taskId, refresh); // 任务切换重拉
onMounted(refresh);

// —— 槽位事件 ——
// 空槽直传：上传入池成功 → 立即绑定到该槽位
async function onSlotUploaded(image, position) {
  try {
    await updateImage(image.id, { position });
    await refresh();
  } catch (e) {
    error.value = e.message;
    await refresh();
  }
}
// 解绑：图片回图片库（文件保留）
async function unbindSlot(slot) {
  try {
    await updateImage(slot.image.id, { position: 0 });
    await refresh();
  } catch (e) { error.value = e.message; }
}
// 彻底删除槽位图（行 + Storage 文件）
async function removeSlot(slot) {
  try {
    await deleteImage(slot.image.id);
    await refresh();
  } catch (e) { error.value = e.message; }
}
function openLibrary(position, mode, oldId = null) {
  library.context = { position, mode, oldId };
  library.show = true;
}
// 图片库选中：replace 先把旧图解绑回池，再把新图绑到槽位
async function onLibrarySelect(image) {
  const ctx = library.context;
  library.show = false;
  if (!ctx) return;
  try {
    if (ctx.mode === 'replace' && ctx.oldId) await updateImage(ctx.oldId, { position: 0 });
    await updateImage(image.id, { position: ctx.position });
    await refresh();
  } catch (e) {
    error.value = e.message;
    await refresh();
  }
}

// —— 封面事件 ——
// 新封面上传成功 → 删除旧封面（替换语义；删除失败仅临时多一张，下次替换会清理）
async function onCoverUploaded(image) {
  const old = images.value.find((i) => i.type === 'cover' && i.id !== image.id);
  try {
    if (old) await deleteImage(old.id);
    await refresh();
  } catch (e) {
    error.value = e.message;
    await refresh();
  }
}
async function removeCover() {
  if (!cover.value) return;
  try {
    await deleteImage(cover.value.id);
    await refresh();
  } catch (e) { error.value = e.message; }
}

// ========== AI 图片建议（V1.0 Phase 5，§14/§19）：AI 只建议，小编点按钮才应用 ==========
const suggest = reactive({ loading: false, list: [], error: '' });

// 分析文章 → 建议列表（position/description/reason）；输出经 normalizeSuggestions 清洗
async function aiSuggest() {
  suggest.loading = true;
  suggest.error = '';
  try {
    const data = await request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({
        action: 'image_suggestions',
        payload: { title: props.title, summary: props.summary, content: props.content, material: props.material },
      }),
    });
    // 剥离可能的代码块包裹后按 JSON 数组解析
    const clean = data.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const list = normalizeSuggestions(JSON.parse(clean));
    if (!list.length) {
      suggest.error = 'AI 未给出有效建议，请直接在下方手写配图计划';
      return;
    }
    suggest.list = list;
  } catch (e) {
    suggest.error = 'AI 分析失败，请重试或手写配图计划：' + e.message;
  } finally {
    suggest.loading = false;
  }
}

// 应用建议到配图计划：description 逐行写入 photoNotes（槽位建议随之更新；小编可继续手改）
function applySuggestions() {
  photoNotes.value = suggest.list.map((s) => s.description).join('\n');
}

// 正文整段占位数（与槽位对齐的锚点数）
const placeholderCount = computed(
  () => (contentModel.value.match(/^\[配图[：:][^\]]*\]\s*$/gm) || []).length,
);
// 计划条数 > 正文占位数 → 提示补插（把缺失占位均匀插入段落间，可 Ctrl+Z 撤销）
const missingCount = computed(() => Math.max(0, buildSlots(images.value, photoNotes.value).filter((s) => s.suggestion).length - placeholderCount.value));
function fillPlaceholders() {
  const descs = (photoNotes.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
  contentModel.value = insertMissingPlaceholders(contentModel.value, descs);
}
</script>

<template>
  <section class="img-workspace">
    <!-- 封面图：预览 + 上传/删除 -->
    <h4 class="ws-title">封面图</h4>
    <div class="cover-row">
      <img v-if="cover" class="cover-thumb" :src="cover.url" alt="封面" />
      <div v-else class="cover-empty">暂无封面</div>
      <div class="cover-ops">
        <ImageUploader :task-id="taskId" type="cover" label="上传封面" @uploaded="onCoverUploaded" />
        <button v-if="cover" type="button" class="danger" @click="removeCover">删除封面</button>
        <span class="ws-hint">公众号封面建议 900×383（2.35:1）</span>
      </div>
    </div>

    <!-- 配图计划：每行一条，与槽位建议对齐；AI 生成初稿时转为 [配图：xxx] 占位 -->
    <h4 class="ws-title">
      配图计划
      <!-- AI 建议（§19）：分析文章 → 推荐位置/画面/理由；点「应用」才写入计划 -->
      <button type="button" class="ai-suggest-btn" :disabled="suggest.loading || !content" @click="aiSuggest">
        {{ suggest.loading ? '分析中…' : '✨ AI 推荐配图' }}
      </button>
      <span v-if="!content" class="ws-hint">（先在第②步写稿后再用 AI 推荐）</span>
    </h4>
    <!-- AI 建议列表：AI 只是助手，应用与否由小编决定 -->
    <div v-if="suggest.list.length" class="suggest-box">
      <div v-for="s in suggest.list" :key="s.position" class="suggest-row">
        <span class="suggest-pos">{{ s.position }}</span>
        <span class="suggest-main">
          <b>{{ s.description }}</b>
          <i>{{ s.reason }}</i>
        </span>
      </div>
      <div class="suggest-ops">
        <button type="button" class="primary" @click="applySuggestions">应用到配图计划</button>
        <button type="button" @click="suggest.list = []">不采用</button>
      </div>
    </div>
    <p v-if="suggest.error" class="ws-error">{{ suggest.error }}</p>
    <textarea v-model="photoNotes" rows="3" class="ws-notes"
      placeholder="每行一条拍摄计划，如：&#10;开场全景&#10;互动特写&#10;全场大合唱"></textarea>

    <!-- 正文配图槽位（缺占位时提示补插：第 N 个整段占位 = 槽位 N 的渲染锚点） -->
    <h4 class="ws-title">
      正文配图
      <button v-if="missingCount > 0" type="button" class="fill-btn" @click="fillPlaceholders"
        :title="'正文缺 ' + missingCount + ' 个 [配图：] 占位，点击均匀插入段落间'">
        补 {{ missingCount }} 个占位到正文
      </button>
    </h4>
    <p v-if="loading" class="ws-hint">加载图片中…</p>
    <p v-if="error" class="ws-error">{{ error }}</p>
    <div class="slot-list">
      <ImageSlot v-for="s in slots" :key="s.position" :slot="s" :task-id="taskId"
        @pick="openLibrary(s.position, 'fill')"
        @replace="openLibrary(s.position, 'replace', s.image.id)"
        @unbind="unbindSlot(s)"
        @remove="removeSlot(s)"
        @uploaded="(img) => onSlotUploaded(img, s.position)" />
    </div>

    <!-- 图片库入口 + 批量上传（入池待选） -->
    <h4 class="ws-title">图片库</h4>
    <div class="pool-row">
      <button type="button" @click="openLibrary(null, 'fill')">🖼 打开图片库</button>
      <ImageUploader :task-id="taskId" multiple label="上传图片（可多选，入库后绑定）" @uploaded="refresh" />
      <span class="ws-hint">上传后到空槽位点「选择图片」绑定</span>
    </div>

    <!-- 图片库弹窗 -->
    <ImageLibrary :task-id="taskId" :show="library.show"
      @select="onLibrarySelect" @close="library.show = false" @changed="refresh" />
  </section>
</template>

<style scoped>
.img-workspace { display: flex; flex-direction: column; gap: 6px; }
.ws-title { font-size: 14px; color: #555; margin: 10px 0 4px; border-left: 3px solid #53de7b; padding-left: 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
/* AI 建议区（Phase 5） */
.ai-suggest-btn { font-size: 12px; padding: 3px 10px; }
.suggest-box { border: 1px solid #d8e4f8; background: #f7faff; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.suggest-row { display: flex; gap: 8px; align-items: flex-start; }
.suggest-pos { flex-shrink: 0; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background: #1a73e8; color: #fff; font-size: 11px; margin-top: 2px; }
.suggest-main { display: flex; flex-direction: column; gap: 2px; }
.suggest-main b { font-size: 13px; color: #333; }
.suggest-main i { font-size: 12px; color: #888; font-style: normal; }
.suggest-ops { display: flex; gap: 8px; }
.suggest-ops .primary { background: #1a73e8; color: #fff; border: none; border-radius: 4px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.suggest-ops button { font-size: 12px; padding: 4px 12px; }
.fill-btn { font-size: 12px; padding: 3px 10px; background: #fef7e0; border: 1px solid #e8d9a8; border-radius: 4px; cursor: pointer; }
.ws-hint { font-size: 12px; color: #999; margin: 0; }
.ws-error { color: #c0392b; font-size: 13px; margin: 0; }
.ws-notes { resize: vertical; }
/* 封面行 */
.cover-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cover-thumb { width: 150px; height: 84px; object-fit: cover; border-radius: 6px; border: 1px solid #e0e0e0; }
.cover-empty { width: 150px; height: 84px; border: 1px dashed #ccc; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 13px; }
.cover-ops { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cover-ops .danger { color: #c0392b; padding: 4px 10px; font-size: 13px; }
/* 槽位列表 */
.slot-list { display: flex; flex-direction: column; gap: 8px; }
/* 库入口行 */
.pool-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pool-row > button { padding: 4px 10px; font-size: 13px; }
</style>
