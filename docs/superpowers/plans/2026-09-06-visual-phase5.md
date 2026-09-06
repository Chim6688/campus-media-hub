# V1.0 Phase 5 参考图识别 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上传参考图 → GLM-4V-Flash 视觉分析 → 输出 8 色配色 + stylePreset → 前端清洗后一键应用到排版（颜色+结构风格同时生效）。

**Architecture:** 后端 PROVIDERS 新增 `zhipu-vision`（同 ZHIPU_API_KEY、model=glm-4v-flash），gen_skin_vision 用 OpenAI 视觉消息格式（content 数组含 image_url base64）；视觉调用**禁用跨供应商 fallback**（纯文本供应商收到图片会报错，fallback 只浪费时间）。前端把现有 skinModal（描述生成）与识图模式合并抽成 VisionSkinModal.vue（TaskDetail 已 1250 行，按工程惯例拆分），识图输出经 parseVisionSkin 清洗（normalizeSkin + normalizeStylePreset 双白名单）。

**Tech Stack:** 智谱 GLM-4V-Flash（OpenAI 兼容视觉接口）、Vue 3、Canvas 前端压缩。

**Spec:** `docs/superpowers/specs/2026-09-06-visual-production-design.md` §5

## 核心事实（代码核验结论）

- ai.mjs 路由：`PROMPTS[action](payload)` → `callLLM(messages)`，无 provider 参数透传——需在 ai.mjs 加 action→provider 映射
- callLLM(messages, { provider }) 已支持指定供应商，但 fallback 链会把视觉请求落到纯文本供应商——视觉调用需单供应商直调（不走 fallback）
- 智谱 v4 视觉接口与文本接口同 baseURL，仅 model 不同（glm-4v-flash）；消息 content 为数组格式 `[{type:'image_url',image_url:{url:'data:image/jpeg;base64,...'}},{type:'text',text:'...'}]`
- 前端 skinModal 现有描述生成链路（gen_skin → normalizeSkin → themeOverrides）在 TaskDetail.vue L555-583，迁移到新组件时行为保持不变
- 后端无单测框架（backend/functions 无 tests），后端改动靠 Task 4 真机验证；前端纯函数全 TDD
- 现有 66 测试全绿是每任务硬门槛

## Global Constraints

- **零回归**：描述生成模式（gen_skin）行为不变；既有 66 测试全绿
- 视觉模型调用不 fallback 到纯文本供应商（zhipu-vision 单供应商直调，失败即报错）
- 识图输出清洗：normalizeSkin（8 色 hex 白名单）+ normalizeStylePreset（journal/bold/soft 白名单），非法值静默回退，AI 输出异常不崩页面
- 8 色不完整（<8 键）视为识图失败，提示重试，不应用部分配色
- 前端压缩：参考图最长边 ≤1024px、JPEG 质量 0.85，压缩后 base64 控制在 ~500KB 内
- 密钥只在后端（ZHIPU_API_KEY 复用，无新密钥）；错误信息回传截断 200 字符（既有惯例）
- 组件 <200 行、中文注释、同文件多编辑串行；测试 `npm test`（frontend/）；PowerShell 环境（无 &&，git -m 直传）
- 55 秒超时沿用（ai-providers 既有）

---

### Task 1: 后端——视觉 provider + gen_skin_vision prompt + 路由（无单测，真机验证在 Task 4）

**Files:**
- Modify: `backend/functions/lib/ai-providers.mjs`
- Modify: `backend/functions/lib/prompts.mjs`
- Modify: `backend/functions/ai.mjs`

**Interfaces:**
- Produces:
  - `PROVIDERS.zhipu-vision`（label '智谱 GLM 视觉'，model env `ZHIPU_VISION_MODEL` 缺省 'glm-4v-flash'，key 复用 ZHIPU_API_KEY）
  - `callVisionLLM(messages)`：单供应商直调（无 fallback），签名与 callOne 一致
  - `PROMPTS.gen_skin_vision(payload)`：payload=`{ imageBase64, text }`（imageBase64 为 `data:image/jpeg;base64,...` 完整 dataURL）
  - POST /api/ai `{action:'gen_skin_vision', payload}` → `{text}`（text 为 JSON 字符串）

- [ ] **Step 1: ai-providers.mjs 加视觉 provider 与直调函数**

PROVIDERS 对象内 `zhipu` 条目后加：

```js
  // 视觉供应商（Phase 5）：智谱同 Key 走视觉模型，仅识图动作使用，不进文本 fallback 链
  'zhipu-vision': {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.ZHIPU_VISION_MODEL || 'glm-4v-flash',
    key: process.env.ZHIPU_API_KEY,
    label: '智谱 GLM 视觉',
  },
```

文件末尾（callLLM 之后）加：

```js
// 视觉直调（Phase 5）：单供应商、不 fallback——纯文本供应商收到图片消息必报错，
// fallback 链只会把超时翻倍；Key 未配置/调用失败直接抛错给前端提示
export async function callVisionLLM(messages) {
  const p = PROVIDERS['zhipu-vision'];
  if (!p.key) throw new Error('视觉模型未配置（缺少 ZHIPU_API_KEY）');
  return callOne(p, messages);
}
```

注意：callOne 对象键 `zhipu-vision` 带连字符，PROVIDERS 遍历处 `Object.keys(PROVIDERS)` 会把它加入文本 fallback 顺序——需在 callLLM 的 ordered 过滤中排除：

```js
  // fallback 顺序：指定供应商在前，其余按配置了 Key 的排后面（视觉供应商不进文本链）
  const ordered = [name, ...Object.keys(PROVIDERS).filter((k) => k !== name && k !== 'zhipu-vision')];
```

- [ ] **Step 2: prompts.mjs 加 gen_skin_vision**

`gen_skin` 条目后加（视觉消息格式：图片在前、文字指令在后）：

```js
  // 识图生成皮肤+风格（Phase 5）：参考图 → 8 色 + stylePreset；前端 parseVisionSkin 清洗
  gen_skin_vision: (p) => [
    { role: 'system', content: '你是公众号排版视觉分析师，擅长从参考图中提取配色与视觉气质。' },
    {
      role: 'user',
      content: [
        // 视觉消息：参考图（前端压缩后的 base64 dataURL）
        { type: 'image_url', image_url: { url: p.imageBase64 || '' } },
        {
          type: 'text',
          text: `分析这张参考图的配色与视觉气质，为推文排版生成配色方案。补充描述：${p.text || '（无）'}

输出一个 JSON 对象，包含两部分：
第一部分 colors——以下 8 个字段的 hex 颜色值（#rrggbb 格式），从图中提取或按气质衍生：
- pageBg：页面底色，必须浅色（如 #F7F5F0）
- accentA：强调色A，取图中最鲜明的主题色
- accentB：强调色B，与 accentA 和谐的辅助色
- ink：正文与描边墨色，必须深色保证可读（如 #3E3E3E）
- cardBg：卡片底色，接近白色
- cream：落款卡底色，浅色
- creamBorder：落款卡描边，比 cream 深一档
- creamText：落款卡文字，灰色调

第二部分 stylePreset——从以下三个中严格选一个（按图的整体气质）：
- "journal"：手账杂志感（留白多、细线、轻装饰）
- "bold"：大色块感（高对比、强标题、几何结构）
- "soft"：柔和感（低对比、圆角、清新）

严格按 JSON 输出，不要任何其他文字，不要 markdown 代码块包裹，如：
{"colors":{"pageBg":"#...","accentA":"#...","accentB":"#...","ink":"#...","cardBg":"#...","cream":"#...","creamBorder":"#...","creamText":"#..."},"stylePreset":"soft"}`,
        },
      ],
    },
  ],
```

- [ ] **Step 3: ai.mjs 路由视觉 action 到 callVisionLLM**

ai.mjs 改造（import 区与 try 块）：

```js
import { callLLM, callVisionLLM } from './lib/ai-providers.mjs';
```

```js
  // 视觉动作走视觉直调（Phase 5）：不进文本 fallback 链
  const VISION_ACTIONS = new Set(['gen_skin_vision']);
  try {
    const messages = build(payload || {});
    const text = VISION_ACTIONS.has(action)
      ? await callVisionLLM(messages)
      : await callLLM(messages);
    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502 });
  }
```

- [ ] **Step 4: 语法验证**

Run（项目根目录）: `node --check backend/functions/lib/ai-providers.mjs; node --check backend/functions/lib/prompts.mjs; node --check backend/functions/ai.mjs`
Expected: 三文件无语法错误（--check 静默通过）

- [ ] **Step 5: 提交**

```bash
git add backend/functions/lib/ai-providers.mjs backend/functions/lib/prompts.mjs backend/functions/ai.mjs
git commit -m "feat(visual): 后端视觉 provider 与 gen_skin_vision 识图 prompt（Phase 5 Task 1）"
```

---

### Task 2: 前端纯函数——parseVisionSkin 清洗 + 压缩参数计算（TDD）

**Files:**
- Create: `frontend/src/utils/vision-skin.js`
- Test: `frontend/tests/vision-skin.test.mjs`

**Interfaces:**
- Consumes: `normalizeSkin(raw)`（skin.js 既有）、`normalizeStylePreset(raw)`（style-presets.js 既有）
- Produces:
  - `parseVisionSkin(text) : { ok, colors, stylePreset, error }`——AI 原始输出 → 清洗结果；ok=false 时 error 为中文提示
  - `compressSpec(w, h) : { targetW, targetH, quality }`——原始尺寸 → 压缩目标（最长边 1024、小图不放大、JPEG 0.85）

- [ ] **Step 1: 写失败测试**

```js
// 识图输出清洗与压缩参数（V1.0 Phase 5）：AI 输出不可信，双白名单是唯一防线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionSkin, compressSpec } from '../src/utils/vision-skin.js';

const GOOD = '{"colors":{"pageBg":"#F7F5F0","accentA":"#FD98C9","accentB":"#53DE7B","ink":"#3E3E3E","cardBg":"#ffffff","cream":"#F3EFE6","creamBorder":"#E2DACA","creamText":"#8C8770"},"stylePreset":"soft"}';

test('parseVisionSkin：合法输出 → 8 色 + 风格通过', () => {
  const r = parseVisionSkin(GOOD);
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.colors).length, 8);
  assert.equal(r.colors.accentA, '#FD98C9');
  assert.equal(r.stylePreset, 'soft');
});

test('parseVisionSkin：markdown 代码块包裹容错（```json ... ```）', () => {
  const r = parseVisionSkin('```json\n' + GOOD + '\n```');
  assert.equal(r.ok, true);
});

test('parseVisionSkin：颜色不足 8 个 → ok=false 明确报错', () => {
  const r = parseVisionSkin('{"colors":{"pageBg":"#fff"},"stylePreset":"soft"}');
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('不完整'));
});

test('parseVisionSkin：非法 stylePreset → 回退 journal（不报错）', () => {
  const r = parseVisionSkin(GOOD.replace('"soft"', '"guochao"'));
  assert.equal(r.ok, true);
  assert.equal(r.stylePreset, 'journal');
});

test('parseVisionSkin：非法 JSON / 空输入 / 非对象 → ok=false 不抛异常', () => {
  for (const bad of ['不是JSON', '', 'null', '[1,2]']) {
    const r = parseVisionSkin(bad);
    assert.equal(r.ok, false);
    assert.ok(r.error, `输入 ${JSON.stringify(bad)} 应有错误提示`);
  }
});

test('parseVisionSkin：colors 为 null 容错（不抛 TypeError）', () => {
  const r = parseVisionSkin('{"colors":null,"stylePreset":"bold"}');
  assert.equal(r.ok, false);
});

test('compressSpec：大图最长边压到 1024（宽图）', () => {
  const s = compressSpec(4000, 2000);
  assert.equal(s.targetW, 1024);
  assert.equal(s.targetH, 512);
  assert.equal(s.quality, 0.85);
});

test('compressSpec：竖图按高边压；小图不放大', () => {
  assert.deepEqual(compressSpec(800, 1600), { targetW: 512, targetH: 1024, quality: 0.85 });
  assert.deepEqual(compressSpec(500, 300), { targetW: 500, targetH: 300, quality: 0.85 });
});

test('compressSpec：零/负尺寸容错（返回 1px 下限防 Canvas 报错）', () => {
  const s = compressSpec(0, 0);
  assert.ok(s.targetW >= 1 && s.targetH >= 1);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— Cannot find module vision-skin.js

- [ ] **Step 3: 实现**

```js
// frontend/src/utils/vision-skin.js
// 识图皮肤清洗与压缩参数（V1.0 Phase 5）：AI 视觉输出 → 双白名单清洗
// colors 走 normalizeSkin（8 色 hex 契约），stylePreset 走 normalizeStylePreset（三风格白名单）
import { normalizeSkin } from './skin.js';
import { normalizeStylePreset } from './style-presets.js';

// 解析 AI 识图输出：JSON 容错（代码块包裹）→ 双白名单清洗 → 不足 8 色视为失败
// 返回 { ok, colors, stylePreset, error }；任何异常输入都不抛错（AI 输出不可信）
export function parseVisionSkin(text) {
  try {
    const clean = String(text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    if (!clean) return { ok: false, error: '识图返回为空，请重试' };
    const raw = JSON.parse(clean);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '识图返回格式异常，请重试' };
    }
    const colors = normalizeSkin(raw.colors || {});
    if (Object.keys(colors).length < 8) {
      return { ok: false, error: 'AI 提取的配色不完整（需 8 色），请换一张色彩更明确的参考图重试' };
    }
    return { ok: true, colors, stylePreset: normalizeStylePreset(raw.stylePreset) };
  } catch {
    return { ok: false, error: '识图返回无法解析，请重试' };
  }
}

// 压缩参数：最长边 ≤1024、小图不放大、JPEG 质量 0.85（base64 控制在 ~500KB 内）
export function compressSpec(w, h) {
  const W = Math.max(1, Number(w) || 0);
  const H = Math.max(1, Number(h) || 0);
  const MAX = 1024;
  const scale = Math.max(W, H) > MAX ? MAX / Math.max(W, H) : 1;
  return {
    targetW: Math.max(1, Math.round(W * scale)),
    targetH: Math.max(1, Math.round(H * scale)),
    quality: 0.85,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（75 个全绿：66 既有 + 9 新增）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/vision-skin.js frontend/tests/vision-skin.test.mjs
git commit -m "feat(visual): parseVisionSkin 双白名单清洗 + 压缩参数（Phase 5 Task 2）"
```

---

### Task 3: VisionSkinModal.vue——描述生成迁移 + 识图模式 + TaskDetail 接线

**Files:**
- Create: `frontend/src/components/VisionSkinModal.vue`
- Modify: `frontend/src/components/TaskDetail.vue`（删旧 skinModal 逻辑换新组件，净减行数）

**Interfaces:**
- Consumes:
  - `parseVisionSkin(text)` / `compressSpec(w, h)`（Task 2）
  - `normalizeSkin(raw)`（既有，描述生成链路）
  - TaskDetail 的 callAI（**注意**：callAI 是 TaskDetail 内部函数，不能直接给子组件——组件内用 request('/api/ai') 自行调用，模式同 callAI 但带自己的 loading 态）
- Produces:
  - VisionSkinModal props：`{ show: Boolean }`；emits：`close` / `apply({ colors, stylePreset })`（colors 为 8 色对象，stylePreset 为合法风格）
  - TaskDetail 处理 apply：清空 themeOverrides → 写入 colors → stylePreset.value = stylePreset（自动保存链路既有）

- [ ] **Step 1: 创建 VisionSkinModal.vue（双模式弹窗）**

```vue
<script setup>
// AI 配色弹窗（Phase 5 合并版）：文字描述生成（gen_skin）+ 参考图识别（gen_skin_vision）
// 识图：前端 Canvas 压缩 → base64 → 视觉模型 → parseVisionSkin 清洗 → emit apply
import { reactive, ref } from 'vue';
import { request } from '../api/client.js';
import { normalizeSkin } from '../utils/skin.js';
import { parseVisionSkin, compressSpec } from '../utils/vision-skin.js';

const props = defineProps({ show: Boolean });
const emit = defineEmits(['close', 'apply']);

const input = ref(''); // 风格描述（两种模式共用：识图时作可选补充）
const loading = ref(false);
const error = ref('');
const imagePreview = ref(''); // 已选参考图预览（dataURL）
let imageBase64 = ''; // 压缩后的完整 dataURL（发后端）

// —— 参考图选择与压缩 ——
const fileInput = ref(null);
function pickImage() { fileInput.value?.click(); }
function onFileChange(e) {
  error.value = '';
  const file = e.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    error.value = '仅支持 JPG/PNG/WebP 图片';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => compressToDataUrl(reader.result);
  reader.readAsDataURL(file);
  e.target.value = ''; // 允许重复选同一文件
}

// Canvas 压缩：最长边 1024 + JPEG 0.85（compressSpec 纯函数可测，此处只做 IO）
function compressToDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    const { targetW, targetH, quality } = compressSpec(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);
    imageBase64 = canvas.toDataURL('image/jpeg', quality);
    imagePreview.value = imageBase64;
  };
  img.onerror = () => { error.value = '图片读取失败，请换一张'; };
  img.src = dataUrl;
}

// —— AI 调用（本组件自带 loading/error，不复用 TaskDetail 的 callAI）——
async function callAI(action, payload) {
  const data = await request('/api/ai', { method: 'POST', body: JSON.stringify({ action, payload }) });
  return data.text;
}

// 模式一：文字描述生成配色（原 skinModal 逻辑迁移，行为不变）
async function generateFromText() {
  if (!input.value.trim()) return;
  loading.value = true;
  error.value = '';
  try {
    const text = await callAI('gen_skin', { text: input.value.trim() });
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const colors = normalizeSkin(JSON.parse(clean));
    if (Object.keys(colors).length < 8) {
      error.value = 'AI 生成的配色不完整，请换个描述重试（或用「🎨 调参数」手动配色）';
      return;
    }
    emit('apply', { colors, stylePreset: null }); // 描述模式不改风格（既有行为）
  } catch (e) {
    error.value = 'AI 生成失败，请重试：' + e.message;
  } finally {
    loading.value = false;
  }
}

// 模式二：参考图识别（Phase 5 新增）→ 8 色 + 风格一起应用
async function generateFromImage() {
  if (!imageBase64) return;
  loading.value = true;
  error.value = '';
  try {
    const text = await callAI('gen_skin_vision', { imageBase64, text: input.value.trim() });
    const r = parseVisionSkin(text);
    if (!r.ok) { error.value = r.error; return; }
    emit('apply', { colors: r.colors, stylePreset: r.stylePreset });
  } catch (e) {
    error.value = '识图失败，请重试：' + e.message;
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <div v-if="show" class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <p class="modal-title">✨ AI 配色</p>
      <textarea v-model="input" rows="2" placeholder="描述想要的风格（识图时可留空作补充），如：蓝金科技感 / 温柔奶油风"></textarea>

      <!-- 参考图区（Phase 5）：选图 → 压缩预览 → 识图 -->
      <div class="img-row">
        <button type="button" :disabled="loading" @click="pickImage">📷 上传参考图</button>
        <img v-if="imagePreview" :src="imagePreview" class="img-preview" alt="参考图" />
      </div>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="onFileChange" />

      <div class="modal-btns">
        <button type="button" @click="emit('close')">取消</button>
        <button type="button" :disabled="loading || !input.trim()" @click="generateFromText">
          {{ loading ? '生成中…' : '按描述生成' }}
        </button>
        <button type="button" class="primary" :disabled="loading || !imageBase64" @click="generateFromImage">
          {{ loading ? '识别中…' : '识图生成配色+风格' }}
        </button>
      </div>
      <p v-if="error" class="modal-error">{{ error }}</p>
      <p class="skin-tip">识图输出整套配色（8 色）+ 结构风格（journal/bold/soft）一起应用；仅描述则只改配色</p>
    </div>
  </div>
</template>
<style scoped>
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { background: #fff; border-radius: 8px; padding: 18px; width: min(440px, 92vw); display: flex; flex-direction: column; gap: 10px; }
.modal-title { margin: 0; font-size: 15px; font-weight: bold; }
.modal textarea { padding: 8px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; resize: vertical; }
.img-row { display: flex; align-items: center; gap: 10px; }
.img-preview { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e5e5; }
.modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
.modal-btns .primary { background: #1a1a1a; color: #fff; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-error { color: #e74c3c; font-size: 13px; margin: 0; }
.skin-tip { color: #999; font-size: 12px; margin: 0; }
</style>
```

- [ ] **Step 2: TaskDetail.vue 接线（删旧换新，串行三处）**

**2a. import 区**：`import { normalizeSkin } from '../utils/skin.js';` 行替换为：

```js
import VisionSkinModal from './VisionSkinModal.vue'; // AI 配色弹窗（描述+识图双模式，Phase 5）
```

**2b.** 删除旧 skinModal 逻辑块（`// AI 生成皮肤弹窗（B 批）...` 到 `generateSkin` 函数结尾，约 L555-583），替换为：

```js
// AI 配色弹窗（Phase 5 抽组件）：apply 回调统一处理两种模式的结果
const skinModal = ref(false);
function openSkinModal() { skinModal.value = true; }
// 应用：colors 覆盖 8 色令牌；stylePreset 非空时同步结构风格（识图模式才有）
function onSkinApply({ colors, stylePreset }) {
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
  Object.assign(themeOverrides, colors);
  if (stylePreset) stylePreset.value = stylePreset;
  skinModal.value = false; // 关弹窗，预览即时刷新+防抖自动保存（既有链路）
}
```

**2c. 模板**：找到旧 skinModal 的 modal-mask 块（`v-if="skinModal.show"` 的弹窗模板，含 textarea/生成按钮/skin-tip），整块替换为：

```vue
            <!-- AI 配色弹窗（Phase 5）：描述生成 + 参考图识别双模式 -->
            <VisionSkinModal :show="skinModal" @close="skinModal = false" @apply="onSkinApply" />
```

（排版步按钮 `@click="openSkinModal"` 保持不变。）

- [ ] **Step 3: 验证**

1. frontend/ `npm test`：75 全绿（组件无单测）
2. frontend/ `npm run build`：成功
3. rg 复核：TaskDetail.vue 中 `skinModal` 出现 4 次左右（声明/openSkinModal/模板 3 处）；`normalizeSkin` 不再出现在 TaskDetail（已迁入组件）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/VisionSkinModal.vue frontend/src/components/TaskDetail.vue
git commit -m "feat(visual): VisionSkinModal 双模式配色弹窗（描述生成+参考图识别）（Phase 5 Task 3）"
```

---

### Task 4: 真机验证 + 收尾汇报

**Files:** 无新文件

- [ ] **Step 1: 联调环境**：根目录后台 `node dev-server.mjs`（.env.local 已有 ZHIPU_API_KEY）+ frontend/ 后台 `npm run dev`

- [ ] **Step 2: Playwright 真机验证**

1. 口令进入 → 任务 → 排版步 → 「✨ AI 配色」：新弹窗含「按描述生成」+「📷 上传参考图」+「识图生成配色+风格」三按钮
2. **描述模式零回归**：输入"清新蓝绿风"→ 按描述生成 → 弹窗关闭 → 预览 8 色变化（themeOverrides 应用）；风格选择器不变（描述模式不动 stylePreset）
3. **识图模式**：上传一张参考图（脚本用 canvas 生成色块图转 dataURL 再转 File 上传）→ 识图生成 → 弹窗关闭 → 预览配色变化 **且** 风格选择器变为模型返回的风格之一
4. 失败路径：识图时断网/传损坏数据 → 明确错误提示，页面不崩，当前主题保留
5. 控制台零错误（图片 CORS 类报辞不算：弹窗内 img 是本地 dataURL 无 CORS）

- [ ] **Step 3: 全量回归**：`npm test` 75 全绿 + `npm run build` 成功

- [ ] **Step 4: 停服务、清理临时产物、汇报（§35 格式，暂停等验收）**

---

## Self-Review 记录

- **Spec 覆盖**：规格 §5 全链路（上传压缩→视觉模型→双白名单清洗→应用预览）→ Task 1（后端）+ Task 2（清洗）+ Task 3（UI/应用）+ Task 4（真机）；"视觉 provider 不替换文本 provider"→ zhipu-vision 独立条目且不进文本 fallback；"非法 JSON 提示识图失败保留当前主题"→ Task 2 测试 + Task 4 Step 2.4；"抽 VisionSkinModal"→ Task 3。
- **占位符扫描**：无 TBD；Task 1 后端无单测已注明原因（项目后端无测试框架，真机验证）；全部代码完整。
- **类型一致性**：`parseVisionSkin(text) → {ok, colors, stylePreset, error}` Task 2 产出 = Task 3 generateFromImage 消费；`compressSpec(w,h)` Task 2 = Task 3 compressToDataUrl 消费；`apply({colors, stylePreset})` Task 3 emit = TaskDetail onSkinApply 消费（stylePreset null 时跳过 = 描述模式零回归）。
