# V1.0 Phase 3+4 视觉生成对接真实图片系统 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 视觉面板从 Mock 换真实文章数据；导出的 PNG 直接上传进 article_images（source='ai'）并自动绑定封面/正文槽位；图片选择器从任务图片库选真实图进视觉卡。

**Architecture:** 导出管线从"浏览器下载"改为"上传落库"——exportVisualPNG 增加返回 Blob 的模式（`returnBlob: true`），VisualPanel 拿 Blob 后走既有 uploadImage API（multipart）入库；封面生成后自动 PATCH 旧封面解绑→自身 type=cover；章节卡绑定指定槽位 position=N。图片选择器复用图片库数据（listImages），选中图 URL 注入视觉卡 data.imageUrl（Supabase 公共 URL 天然支持 crossorigin 截图）。

**Tech Stack:** Vue 3 + Vite 6、既有 /api/images 全套（零后端改动）、html2canvas（既有）。

**Spec:** `docs/superpowers/specs/2026-09-06-visual-production-design.md` §8 Phase 3+4

## 核心事实（代码核验结论，执行者必读）

- **后端零改动**：POST /api/images 已支持 `source` 字段（'ai'/'upload'）、type（cover/content）、position；PATCH /api/images/:id 可改 position；图片列表按 position 升序
- 封面绑定语义：`type='cover'` 的行即封面（ImageWorkspace `find(i => i.type === 'cover')`），同任务多张 cover 时取第一张；封面更换 = 旧封面行 PATCH 解绑不可行（PATCH 不能改 type）→ **旧封面直接删除，新封面重新上传**（图片属可再生资源，删除即替换，语义最简）
- 槽位绑定语义：`position=N` 绑定第 N 个 `[配图：]` 占位；position=0 回图片库待选
- exportVisualPNG 当前签名 `(el, filename, size)` 内部触发下载；需扩展 `opts.returnBlob` 返回 Blob（上传用），默认行为不变（零回归）
- VisualPanel 挂在视觉步（activeStep==='visual'），TaskDetail 已传 taskId/title/themeId/themeOverrides/stylePreset
- 上传校验：PNG mime 在白名单；封面 1800×766/章节卡 1800×2400 的 scale=2 截图 PNG 约 300-800KB，远低于 5MB 上限

## Global Constraints

- **零回归**：exportVisualPNG 不带 opts 时行为不变（仍触发浏览器下载）；既有 60 测试全绿是每任务硬门槛
- 导出→上传必须同一 Blob（截图结果直接落库，禁止二次编解码）
- 上传失败明确报错（沿用 exportError 通道），不静默
- 章节卡绑定槽位前若槽位已有图片：旧图 PATCH position=0 回库（不删除，用户上传的真实照片优先保留）
- 视觉面板换真实数据后，TaskDetail 传参补 summary/material（副标题与标签数据源）；Mock 文案仅作缺省兜底
- 组件保持精简（<200 行）；主要代码段中文注释；同文件多编辑严格串行
- 测试命令 `npm test`（frontend/）；环境 PowerShell（无 &&，用分号；git -m 直传）

---

### Task 1: exportVisualPNG 增加 returnBlob 模式（TDD）

**Files:**
- Modify: `frontend/src/utils/visual-export.js`
- Test: `frontend/tests/visual-export.test.mjs`（末尾追加）

**Interfaces:**
- Produces: `exportVisualPNG(el, filename, size, opts = {})`——`opts.returnBlob === true` 时不触发下载，resolve `Blob`（type 'image/png'）；否则维持现状触发下载

- [ ] **Step 1: 在 frontend/tests/visual-export.test.mjs 末尾追加失败测试**

```js
test('returnBlob 模式：exportVisualPNG 第 4 参 returnBlob:true 时不触发下载、resolve Blob（浏览器行为真机验证，此处仅锁定签名容错）', async () => {
  // Node 环境无 document/html2canvas，函数应在进入浏览器分支前不抛 ReferenceError 的方式不可行；
  // 本测试锁定：opts 参数被接受（第 4 参不引起 TypeError），undefined opts 兼容
  // 真机验证在 Task 4（Playwright 断言上传成功）
  const { exportVisualPNG } = await import('../src/utils/visual-export.js');
  assert.equal(typeof exportVisualPNG, 'function');
  assert.equal(exportVisualPNG.length, 3, '签名兼容：前 3 参固定，第 4 参可选');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— `exportVisualPNG.length` 为 3 前实现尚未改？注意：当前实现签名就是 3 参 `(el, filename, size)`，`length` 已是 3。此测试锁定行为不回归（GUIDE 性质）。若已通过则记录为"锁定测试"直接进 Step 3（实现改动后它必须仍然通过）。

- [ ] **Step 3: 实现 returnBlob**

`exportVisualPNG` 改造（整函数替换，中文注释保留并更新）：

```js
// 导出 PNG：前置检查 → 离屏克隆自然尺寸节点 → html2canvas(useCORS) → 下载或返回 Blob
// opts.returnBlob=true（Phase 3+4）：不触发下载，resolve Blob 供上传 article_images（同一 Blob 落库，禁止二次编解码）
export async function exportVisualPNG(el, filename, size, opts = {}) {
  // 1) 字体就绪（中文渲染正确性的前提）
  if (document.fonts?.ready) await document.fonts.ready;
  // 2) 图片就绪（失败抛错终止）
  await waitForImages(el);
  // 3) 懒加载 html2canvas（首屏零成本；vite 自动分包独立 chunk）
  const { default: html2canvas } = await import('html2canvas');
  // 4) 离屏克隆：自然尺寸渲染，避免预览缩放 transform 污染截图
  const clone = el.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.width = `${size.width}px`;
  clone.style.height = `${size.height}px`;
  clone.style.position = 'fixed';
  clone.style.left = '-99999px';
  document.body.appendChild(clone);
  try {
    // 5) 截图：scale=2 输出 2 倍分辨率（1800×766 / 1800×2400）
    const canvas = await html2canvas(clone, {
      useCORS: true,
      scale: 2,
      width: size.width,
      height: size.height,
      backgroundColor: null,
    });
    // 6) Blob 分支：canvas → Blob（Promise 化），直接交调用方上传
    if (opts.returnBlob) {
      return await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 生成失败，请重试'))), 'image/png'),
      );
    }
    // 7) 默认：触发浏览器下载（零回归路径）
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    document.body.removeChild(clone);
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（61 个全绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/visual-export.js frontend/tests/visual-export.test.mjs
git commit -m "feat(visual): exportVisualPNG 增加 returnBlob 模式供上传落库（Phase 3+4 Task 1）"
```

---

### Task 2: 纯函数——视觉数据装配器 buildVisualData（TDD）

**Files:**
- Create: `frontend/src/utils/visual-data.js`
- Test: `frontend/tests/visual-data.test.mjs`

**Interfaces:**
- Consumes: 无（纯函数）
- Produces:
  - `buildCoverData(task, image) : { org, title, subtitle, tags, place, date, imageUrl }`——task={title,summary,material}, image=图片行或 null
  - `buildSectionData(partNum, task, image) : { partNum, title, subtitle, imageUrl }`
  - `firstContentImage(images) : image|null`（position=0 的正文图，视觉卡默认主图）

- [ ] **Step 1: 写失败测试**

```js
// 视觉数据装配器（V1.0 Phase 3+4）：任务数据 → 视觉卡 data 契约
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverData, buildSectionData, firstContentImage } from '../src/utils/visual-data.js';

const TASK = {
  title: '山海电白青春突击队',
  summary: '深圳信息职业技术大学赴茂名电白开展文旅调研',
  material: {
    name: '三下乡文旅调研',
    time: '2026年8月1日-7日',
    location: '茂名电白',
  },
};
const IMG = { url: 'https://supabase.example/article-images/t1/content/a.jpg' };

test('buildCoverData：真实数据映射（title 主标题 / summary 副标题 / material.location+time 落款）', () => {
  const d = buildCoverData(TASK, IMG);
  assert.equal(d.title, '山海电白青春突击队');
  assert.equal(d.subtitle, '深圳信息职业技术大学赴茂名电白开展文旅调研');
  assert.equal(d.imageUrl, IMG.url);
  assert.ok(d.place.includes('茂名电白'), 'place 取 material.location');
  assert.ok(d.date.includes('2026年8月1日'), 'date 取 material.time');
  assert.ok(Array.isArray(d.tags) && d.tags.length >= 1, 'tags 至少一条');
});

test('buildCoverData：缺省兜底（无 summary/material 用占位文案，绝不出现 undefined）', () => {
  const d = buildCoverData({ title: '只有标题' }, null);
  assert.equal(d.title, '只有标题');
  assert.equal(d.imageUrl, '');
  assert.ok(d.subtitle, '副标题有兜底');
  assert.ok(d.org, '机构名有兜底');
  const s = JSON.stringify(d);
  assert.ok(!s.includes('undefined') && !s.includes('null'));
});

test('buildCoverData：title 缺省兜底「未命名推文」', () => {
  const d = buildCoverData({}, IMG);
  assert.equal(d.title, '未命名推文');
});

test('buildSectionData：章节卡映射与序号透传', () => {
  const d = buildSectionData(2, TASK, IMG);
  assert.equal(d.partNum, 2);
  assert.equal(d.title, TASK.title); // 章节卡主标题缺省用任务标题，用户可编辑
  assert.equal(d.imageUrl, IMG.url);
  const e = buildSectionData(1, {}, null);
  assert.equal(e.imageUrl, '');
  assert.ok(e.title, '标题兜底');
});

test('firstContentImage：取第一张 position=0 的正文图；无则 null（已绑定槽位的图不占用）', () => {
  const images = [
    { type: 'cover', url: 'c' },
    { type: 'content', position: 1, url: 'bound' },
    { type: 'content', position: 0, url: 'pool1' },
    { type: 'content', position: 0, url: 'pool2' },
  ];
  assert.equal(firstContentImage(images)?.url, 'pool1');
  assert.equal(firstContentImage([{ type: 'content', position: 3 }]), null);
  assert.equal(firstContentImage([]), null);
  assert.equal(firstContentImage(null), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— Cannot find module visual-data.js

- [ ] **Step 3: 实现**

```js
// frontend/src/utils/visual-data.js
// 视觉数据装配器（V1.0 Phase 3+4）：任务数据（title/summary/material）+ 图片行 → 视觉卡 data 契约
// 纯函数：缺省兜底集中在装配层，模板渲染层（visual-templates）不再关心数据来源

// 机构名兜底：素材无组织名时用通用文案（Phase 5 识图/后续可扩展为用户配置）
const DEFAULT_ORG = '校园媒体中心';

// 封面数据装配：主标题=任务标题，副标题=摘要，place/date=素材地点/时间，tags=素材名+首条亮点
export function buildCoverData(task, image) {
  const t = task || {};
  const m = t.material || {};
  const highlights = Array.isArray(m.highlights) ? m.highlights.filter(Boolean) : [];
  return {
    org: (m.name || '').trim() ? `校园媒体 · ${(m.name || '').trim()}` : DEFAULT_ORG,
    title: (t.title || '').trim() || '未命名推文',
    subtitle: (t.summary || '').trim() || '一篇来自校园现场的报道',
    tags: highlights.length ? highlights.slice(0, 3) : ['校园报道'],
    place: (m.location || '').trim() || '',
    date: (m.time || '').trim() || '',
    imageUrl: image?.url || '',
  };
}

// 章节卡数据装配：标题缺省用任务标题（用户可在面板编辑），副标题取摘要截断
export function buildSectionData(partNum, task, image) {
  const t = task || {};
  return {
    partNum: Number(partNum) || 1,
    title: (t.title || '').trim() || '章节标题',
    subtitle: ((t.summary || '').trim() || '').slice(0, 16),
    imageUrl: image?.url || '',
  };
}

// 视觉卡默认主图：第一张未绑定的正文图（position=0）；无可用图返回 null（渲染层显示纯色占位）
export function firstContentImage(images) {
  const pool = (images || []).filter((i) => i && i.type === 'content' && !i.position);
  return pool[0] || null;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（66 个全绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/visual-data.js frontend/tests/visual-data.test.mjs
git commit -m "feat(visual): 视觉数据装配器 buildCoverData/buildSectionData（Phase 3+4 Task 2）"
```

---

### Task 3: VisualPanel 改造——真实数据 + 图片选择 + 上传落库 + 绑定

**Files:**
- Modify: `frontend/src/components/visual/VisualPanel.vue`（较大改造，整文件重写）
- Modify: `frontend/src/components/TaskDetail.vue`（传参补 summary/material）
- Create: `frontend/src/components/visual/VisualImagePicker.vue`（图片选择弹窗，复用 ImageLibrary 交互模式）

**Interfaces:**
- Consumes:
  - `buildCoverData/buildSectionData/firstContentImage`（Task 2）
  - `exportVisualPNG(el, filename, size, { returnBlob: true })`（Task 1）
  - `uploadImage(file, { taskId, type, position, caption })` / `listImages` / `updateImage` / `deleteImage`（client.js 既有）
  - VisualCardPreview/VisualTemplateSelector（既有）
- Produces:
  - VisualPanel props：`{ taskId, title, summary, material, themeId, themeOverrides, boundImages }`（boundImages=配图工作台上报的已绑定正文图数组，TaskDetail 既有状态）
  - VisualPanel emits：`images-change`（上传/删除后通知父级刷新图片数据）
  - VisualImagePicker props：`{ taskId, show }`，emits：`select(image)` / `close`

- [ ] **Step 1: 创建 VisualImagePicker.vue**

```vue
<script setup>
// 视觉图片选择弹窗（Phase 3+4）：从任务图片库选真实图进视觉卡
// 与 ImageLibrary 的差异：这里所有图可选（视觉卡引用 URL 不改变绑定关系）
import { ref, watch } from 'vue';
import { listImages } from '../../api/client.js';

const props = defineProps({ taskId: String, show: Boolean });
const emit = defineEmits(['select', 'close']);

const images = ref([]);
const loading = ref(false);
const error = ref('');

// 每次打开重拉（上传/删除后保持同步）
watch(() => props.show, (v) => { if (v) refresh(); });

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listImages(props.taskId);
    images.value = data.images;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <div v-if="show" class="picker-mask" @click.self="emit('close')">
    <div class="picker-modal">
      <p class="picker-title">选择视觉卡图片</p>
      <p v-if="loading" class="picker-hint">加载中…</p>
      <p v-if="error" class="picker-error">{{ error }}</p>
      <p v-if="!loading && !images.length" class="picker-hint">图片库为空：先去「配图」步骤上传图片</p>
      <div class="picker-grid">
        <div v-for="img in images" :key="img.id" class="picker-item" @click="emit('select', img)">
          <img :src="img.url" :alt="img.caption || '图片'" />
        </div>
      </div>
      <div class="picker-footer">
        <button type="button" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.picker-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.picker-modal { background: #fff; border-radius: 8px; padding: 16px; width: min(640px, 92vw); max-height: 84vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.picker-title { margin: 0; font-size: 15px; font-weight: bold; }
.picker-hint, .picker-error { font-size: 13px; margin: 0; color: #999; }
.picker-error { color: #e74c3c; }
.picker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.picker-item { border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; cursor: pointer; }
.picker-item:hover { border-color: #1a1a1a; }
.picker-item img { width: 100%; height: 90px; object-fit: cover; display: block; }
.picker-footer { display: flex; justify-content: flex-end; }
</style>
```

- [ ] **Step 2: 重写 VisualPanel.vue（真实数据 + 选择图 + 上传落库 + 绑定）**

```vue
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

const props = defineProps({
  taskId: String, title: String, summary: String, material: Object,
  themeId: String, themeOverrides: Object, boundImages: { type: Array, default: () => [] },
});
const emit = defineEmits(['images-change']);

// 风格状态提升到 TaskDetail（Phase 2）：正文排版预览与视觉卡共用同一 stylePreset
const stylePreset = defineModel('stylePreset', { type: String, default: 'journal' });

// 任务图片（选择器数据源 + 默认主图推导）
const images = ref([]);
const loading = ref(false);
const error = ref('');

// 视觉卡数据：真实任务数据 + 可编辑字段（reactive 局部编辑态，org/tags 等来自装配器）
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
    await uploadImage(file, { taskId: props.taskId, type: 'cover', position: 0, caption: '视觉模板封面' });
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
    await uploadImage(file, { taskId: props.taskId, type: 'content', position: cardSlot.value, caption: cardData.title || '章节卡' });
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
```

- [ ] **Step 3: TaskDetail.vue 传参补全（两处串行小改）**

视觉步的 VisualPanel 标签替换为：

```vue
          <VisualPanel :task-id="task.id" :title="title" :summary="summary" :material="materialPayload()"
            :theme-id="themeId" :theme-overrides="{ ...themeOverrides }" v-model:style-preset="stylePreset"
            :bound-images="boundImages" @images-change="onVisualImagesChange" />
```

并在 script 合适位置（ImageWorkspace 集成的事件处理附近）新增：

```js
// 视觉面板图片变更（Phase 3+4）：封面生成/章节卡绑定后，重拉图片同步步骤条与封面状态
// 复用 ImageWorkspace 的刷新语义：封面状态影响发布前检查，绑定数影响步骤条
async function onVisualImagesChange() {
  try {
    const data = await listImages(props.task.id);
    const imgs = data.images;
    boundImages.value = imgs.filter((i) => i.type === 'content' && i.position > 0)
      .sort((a, b) => a.position - b.position);
    coverOk.value = imgs.some((i) => i.type === 'cover');
  } catch { /* 静默失败：视觉面板已本地刷新，下次进入步骤自然同步 */ }
}
```

确认 TaskDetail 已 import listImages（Phase 3 时 `import { request, uploadPDF, listImages } from '../api/client.js'` 已有）；若 boundImages/coverOk 声明位置在此函数之后，需把函数放到声明之后（Vue script setup 无变量提升问题以实际编译为准，放 watch 附近安全）。

- [ ] **Step 4: 验证**

Run: `npm test` && `npm run build`（frontend/）
Expected: 66 测试全绿；build 成功

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/visual/VisualPanel.vue frontend/src/components/visual/VisualImagePicker.vue frontend/src/components/TaskDetail.vue
git commit -m "feat(visual): 真实数据+选图+生成上传落库+自动绑定封面与槽位（Phase 3+4 Task 3）"
```

---

### Task 4: 真机端到端验证 + 收尾汇报

**Files:** 无新文件

- [ ] **Step 1: 联调环境**：根目录后台 `node dev-server.mjs` + frontend/ 后台 `npm run dev`

- [ ] **Step 2: Playwright 端到端（预置条件：所选任务图片库已有正文图；若无则验证占位路径）**

1. 口令进入 → 打开任务 → 视觉步：封面/章节卡预览含真实标题（非 Mock 文案）；库有图时预览含真实图片
2. 点"换图"：选择弹窗列出任务全部图片（含已绑定）；点选后预览图片更新
3. **生成并设为封面**：按钮 loading → 成功提示"已生成并设为任务封面 ✓"；切到配图步：封面区显示生成的视觉图（非旧图）
4. **生成并绑定**（槽位 1）：成功提示"已绑定第 1 图"；切到配图步：槽位 1 显示章节卡图；被顶替旧图回图片库待选
5. 切到排版步：正文预览第 1 个 `[配图：]` 占位渲染为章节卡 `<img>`（wechat-format imageSlot 真实图路径）
6. 发布检查步：封面项为 ✓（视觉封面生效）
7. 控制台零错误
8. **上传断言**：GET /api/images 返回的列表中存在 source='ai' 的 cover 行与 content 行（通过页面数据或直接 API 检查）

- [ ] **Step 3: 全量回归**：`npm test` 66 全绿 + `npm run build` 成功

- [ ] **Step 4: 停服务、清理临时产物、汇报（§35 格式，暂停等验收）**

---

## Self-Review 记录

- **Spec 覆盖**：规格 §8 Phase 3（真实数据/对接 article_images/Storage）→ Task 2/3；Phase 4（视觉图绑定 slot）→ Task 3 generateSectionCard + Task 4 Step 2.5；"source 复用 ai 零迁移"→ Task 3 uploadImage 调用；"视觉图片必须直接进入当前文章"→ 上传落库而非浏览器下载。Phase 5（识图）与 Phase 6-9 不在本批。
- **占位符扫描**：无 TBD；Task 1 测试注明 GUID 性质（签名锁定）并指明行为验证在 Task 4 真机，非逃避测试。
- **类型一致性**：`exportVisualPNG(el, filename, size, opts)` Task 1 产出 = Task 3 消费；`buildCoverData(task, image)`/`firstContentImage(images)` Task 2 产出 = Task 3 消费；`images-change` emit = TaskDetail `onVisualImagesChange` 消费；VisualImagePicker `select(image)` = `onPick` 消费。
