# V2 Phase 2 AI 视觉分析 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上传参考图 → AI 视觉分析（visualType/composition/stylePreset/palette/elements/layoutReason/recommendations）→ 白名单清洗 → 生成 3 个**不同 Composition** 的设计方案（A/B/C）→ 小编点选一键应用。

**Architecture:** 后端新增独立 action `visual_analysis`（复用 callVisionLLM 视觉直调管线与 gen_skin_vision 的消息格式，**不改既有 action 零回归**）；前端纯函数 `parseVisualAnalysis`（三白名单清洗 + 方案去重补齐）加方案工厂 `buildDesignPlans`（AI 主方案 + 白名单内补 2 个不同构图）；UI 在视觉面板加"AI 视觉设计"区块（识图入口在 VisualPanel 而非排版步的 VisionSkinModal——视觉设计属视觉步工作流）。

**Tech Stack:** 既有 GLM-4V-Flash 视觉直调（zhipu-vision）、Vue 3、node --test（91 测试基线）。

**Spec:** `docs/改造指令-CampusMediaHub-视觉设计V2.md` §4（AI 视觉分析）/§5（AI 推荐方案）

## 核心事实（代码核验结论）

- 视觉直调管线已存在：`callVisionLLM(messages)`（ai-providers.mjs）+ ai.mjs `VISION_ACTIONS` 路由——新 action 只需加入 Set 并写 prompt，零路由改造
- gen_skin_vision/parseVisionSkin 链路**不动**（排版步 AI 配色弹窗零回归）
- VisionSkinModal 的 Canvas 压缩逻辑（compressSpec + compressToDataUrl）可提为可复用函数——但为最小改动，Phase 2 在新组件内引用 compressSpec 重新实现 6 行压缩 IO（纯函数已有测试，IO 不重复测）
- VisualPanel 200 行（红线）：AI 方案区块必须抽子组件 VisualDesignAI.vue
- 方案 A/B/C 必须不同 Composition（指令 §5 硬要求）——AI 输出主方案 + 前端从同类型白名单补齐 2 个（AI 可能只返回 1 个合法构图，补齐逻辑必须确定性）
- COMPOSITIONS/normalizeComposition（Task 1 既有）、STYLE_PRESETS/normalizeStylePreset、normalizeSkin（8 色）全部可复用

## Global Constraints

- **零回归**：既有 91 测试全绿；gen_skin_vision/parseVisionSkin/VisionSkinModal 链路零改动
- AI 输出不可信：visualType/composition/stylePreset 三白名单 + palette hex 校验 + elements 字符串数组过滤，任何脏输入回退安全值，不崩页面
- 方案 A/B/C 的 composition 互不相同（buildDesignPlans 去重 + 确定性补齐）
- AI 只建议：应用方案 = 写入 VisualPanel 编辑态（composition + stylePreset + 8 色 + 文案预填），生成仍由小编手动触发
- 后端 55 秒超时沿用；视觉直调不 fallback（既有）
- 组件 <200 行、中文注释、同文件多编辑串行；测试 `npm test`（frontend/）；PowerShell（无 &&，git -m 直传）

---

### Task 1: parseVisualAnalysis + buildDesignPlans 纯函数（TDD）

**Files:**
- Create: `frontend/src/utils/visual-analysis.js`
- Test: `frontend/tests/visual-analysis.test.mjs`

**Interfaces:**
- Consumes: `normalizeComposition(raw, visualType)`（compositions.js）、`normalizeStylePreset(raw)`、`normalizeSkin(raw)`（skin.js）、`COVER_COMPOSITIONS`/`SECTION_COMPOSITIONS`/`COMPOSITIONS`
- Produces:
  - `parseVisualAnalysis(text) : { ok, visualType, composition, stylePreset, colors, elements, layoutReason, recommendations, error }`——visualType∈{cover,section}；colors 为 8 色对象（不足 8 色失败）；elements/recommendations 为字符串数组（各 ≤5 条，单条 ≤40 字）
  - `buildDesignPlans(analysis, visualType) : [{ name, composition, compositionLabel, stylePreset, note }]`——3 个方案，composition 互不相同；note 取 layoutReason 首条或类型说明

- [ ] **Step 1: 写失败测试**

```js
// AI 视觉分析清洗与方案工厂（V2 Phase 2）：三白名单 + 方案 A/B/C 构图互异
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisualAnalysis, buildDesignPlans } from '../src/utils/visual-analysis.js';

const GOOD = JSON.stringify({
  visualType: 'section',
  composition: 'section-photo-stack',
  stylePreset: 'journal',
  palette: ['#163A5F', '#2F6288', '#EAF2F5', '#FFFFFF', '#8C8770', '#E2DACA', '#F3EFE6', '#3E3E3E'],
  elements: ['chapterNumber', 'chapterTitle', 'photoStack', 'divider'],
  layoutReason: '参考图采用杂志式照片叠放和大量留白，适合校园文化纪实内容',
  recommendations: ['使用两张现场照片叠放', '标题采用大字号'],
});

test('parseVisualAnalysis：合法分析全维度通过', () => {
  const r = parseVisualAnalysis(GOOD);
  assert.equal(r.ok, true);
  assert.equal(r.visualType, 'section');
  assert.equal(r.composition, 'section-photo-stack');
  assert.equal(r.stylePreset, 'journal');
  assert.equal(Object.keys(r.colors).length, 8);
  assert.equal(r.colors.pageBg, '#EAF2F5');
  assert.equal(r.elements.length, 4);
  assert.ok(r.layoutReason.includes('杂志式'));
  assert.equal(r.recommendations.length, 2);
});

test('parseVisualAnalysis：palette 字段映射 8 色契约（数组→pageBg/accentA/...键）', () => {
  const r = parseVisualAnalysis(GOOD);
  // 数组按序映射：0=pageBg 1=accentA 2=cardBg 3=ink 4=creamText 5=creamBorder 6=cream 7=accentB
  assert.equal(r.colors.accentA, '#2F6288');
  assert.equal(r.colors.ink, '#FFFFFF');
});

test('parseVisualAnalysis：非法 composition/visualType/stylePreset 白名单回退', () => {
  const r = parseVisualAnalysis(JSON.stringify({
    visualType: 'quote', composition: 'cover-circle', stylePreset: 'guochao',
    palette: ['#163A5F', '#2F6288', '#EAF2F5', '#FFFFFF', '#8C8770', '#E2DACA', '#F3EFE6', '#3E3E3E'],
    elements: [], recommendations: [],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.visualType, 'section', '非法类型回退 section');
  assert.equal(r.composition, 'section-editorial', '跨类型构图回退 section 默认');
  assert.equal(r.stylePreset, 'journal');
});

test('parseVisualAnalysis：palette 不足 8 色 → ok=false', () => {
  const r = parseVisualAnalysis(JSON.stringify({
    visualType: 'cover', composition: 'cover-hero', stylePreset: 'journal',
    palette: ['#fff', '#000'], elements: [], recommendations: [],
  }));
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('配色'));
});

test('parseVisualAnalysis：elements/recommendations 过滤与截断（非字符串丢弃/超长截断/上限 5 条）', () => {
  const r = parseVisualAnalysis(JSON.stringify({
    visualType: 'cover', composition: 'cover-hero', stylePreset: 'journal',
    palette: ['#163A5F', '#2F6288', '#EAF2F5', '#FFFFFF', '#8C8770', '#E2DACA', '#F3EFE6', '#3E3E3E'],
    elements: [1, '有效', null, 'x'.repeat(60), 'a', 'b', 'c', 'd'],
    recommendations: '不是数组',
    layoutReason: 123,
  }));
  assert.equal(r.ok, true);
  assert.ok(r.elements.includes('有效'));
  assert.ok(r.elements.every((e) => e.length <= 40 + 1), '单条 ≤40 字（+省略号）');
  assert.ok(r.elements.length <= 5);
  assert.deepEqual(r.recommendations, []);
  assert.equal(r.layoutReason, '', '非法 reason 兜底空串');
});

test('parseVisualAnalysis：非法 JSON/空/数组 → ok=false 不抛异常', () => {
  for (const bad of ['不是JSON', '', 'null', '[1]']) {
    const r = parseVisualAnalysis(bad);
    assert.equal(r.ok, false);
    assert.ok(r.error);
  }
});

test('buildDesignPlans：3 个方案 composition 互不相同且类型正确', () => {
  const r = parseVisualAnalysis(GOOD);
  const plans = buildDesignPlans(r, 'section');
  assert.equal(plans.length, 3);
  const comps = plans.map((p) => p.composition);
  assert.equal(new Set(comps).size, 3, '构图互异');
  assert.ok(comps.includes('section-photo-stack'), 'AI 主方案排第一');
  for (const p of plans) {
    assert.ok(p.name && p.compositionLabel && p.note !== undefined);
    assert.ok(p.composition.startsWith('section'));
  }
});

test('buildDesignPlans：AI 构图非法时从白名单确定性补齐（顺序稳定）', () => {
  const fake = { ok: true, visualType: 'cover', composition: '不存在', stylePreset: 'bold',
    colors: {}, elements: [], layoutReason: '理由', recommendations: [] };
  const plans = buildDesignPlans(fake, 'cover');
  // normalizeComposition 已在 parse 层做——此处传非法值模拟上游漏网，工厂仍须白名单兜底
  assert.equal(plans.length, 3);
  assert.equal(new Set(plans.map((p) => p.composition)).size, 3);
  assert.ok(plans[0].composition.startsWith('cover'));
});

test('buildDesignPlans：cover 类型不含 section 构图（反之亦然）', () => {
  const fake = { ok: true, visualType: 'cover', composition: 'cover-circle', stylePreset: 'journal',
    colors: {}, elements: [], layoutReason: '', recommendations: [] };
  const plans = buildDesignPlans(fake, 'cover');
  assert.ok(plans.every((p) => p.composition.startsWith('cover')));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— Cannot find module visual-analysis.js

- [ ] **Step 3: 实现**

```js
// frontend/src/utils/visual-analysis.js
// AI 视觉分析清洗与方案工厂（V2 Phase 2）：参考图 → 全维度分析 → 3 个构图互异方案
// 三白名单防线：visualType/composition（compositions.js）+ stylePreset（style-presets.js）+ palette hex（skin.js）
import { normalizeComposition, COMPOSITIONS, COVER_COMPOSITIONS, SECTION_COMPOSITIONS } from './compositions.js';
import { normalizeStylePreset } from './style-presets.js';

// palette 数组 → 8 色键契约映射（顺序即语义：底/主强调/卡底/墨/落款字/落款描边/落款底/次强调）
const PALETTE_KEYS = ['pageBg', 'accentA', 'cardBg', 'ink', 'creamText', 'creamBorder', 'cream', 'accentB'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// 字符串数组清洗：留非空字符串、截 40 字加省略号、最多 5 条
function cleanStrList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x) => (x.trim().length > 40 ? `${x.trim().slice(0, 40)}…` : x.trim()))
    .slice(0, 5);
}

// 解析 AI 视觉分析输出：JSON 容错 → visualType 归一（cover/section 二选一，非法回 section）
// → composition 白名单 → palette 数组映射 8 色（非法 hex 丢弃，不足 8 色失败）
export function parseVisualAnalysis(text) {
  try {
    const clean = String(text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    if (!clean) return { ok: false, error: '分析返回为空，请重试' };
    const raw = JSON.parse(clean);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '分析返回格式异常，请重试' };
    }
    // visualType：白名单二选一（cover/section），非法回 section
    const visualType = raw.visualType === 'cover' ? 'cover' : 'section';
    const composition = normalizeComposition(raw.composition, visualType);
    const stylePreset = normalizeStylePreset(raw.stylePreset);
    // palette：数组映射键契约，逐个 hex 校验
    const paletteArr = Array.isArray(raw.palette) ? raw.palette : [];
    const colors = {};
    paletteArr.forEach((hex, i) => {
      if (typeof hex === 'string' && HEX_RE.test(hex.trim())) colors[PALETTE_KEYS[i]] = hex.trim();
    });
    if (Object.keys(colors).length < 8) {
      return { ok: false, error: 'AI 提取的配色不足 8 色，请换一张色彩更明确的参考图重试' };
    }
    return {
      ok: true, visualType, composition, stylePreset, colors,
      elements: cleanStrList(raw.elements),
      recommendations: cleanStrList(raw.recommendations),
      layoutReason: typeof raw.layoutReason === 'string' ? raw.layoutReason.trim().slice(0, 80) : '',
    };
  } catch {
    return { ok: false, error: '分析返回无法解析，请重试' };
  }
}

// 方案工厂：AI 主方案 + 同类型白名单补齐，3 个构图互异（确定性顺序，AI 构图非法时白名单兜底）
// note：AI 主方案用 layoutReason，补充方案用构图自身说明
export function buildDesignPlans(analysis, visualType) {
  const type = visualType === 'cover' ? 'cover' : 'section';
  const pool = type === 'cover' ? COVER_COMPOSITIONS : SECTION_COMPOSITIONS;
  const mainComp = pool.includes(analysis.composition)
    ? analysis.composition
    : normalizeComposition(analysis.composition, type);
  const plans = [{
    name: '方案 A',
    composition: mainComp,
    compositionLabel: COMPOSITIONS[mainComp].label,
    stylePreset: analysis.stylePreset,
    note: analysis.layoutReason || 'AI 推荐主方案',
  }];
  // 补齐 2 个不同构图（白名单顺序跳过主方案）
  for (const comp of pool) {
    if (plans.length >= 3) break;
    if (comp === mainComp) continue;
    plans.push({
      name: `方案 ${String.fromCharCode(65 + plans.length)}`, // B / C
      composition: comp,
      compositionLabel: COMPOSITIONS[comp].label,
      stylePreset: analysis.stylePreset, // 同风格不同构图（构图才是方案差异维度）
      note: `${COMPOSITIONS[comp].label}构图 · 与方案A不同布局`,
    });
  }
  return plans;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（100 个全绿：91 + 9）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/visual-analysis.js frontend/tests/visual-analysis.test.mjs
git commit -m "feat(visual): parseVisualAnalysis 三白名单清洗 + buildDesignPlans 方案工厂（V2 Phase 2 Task 1）"
```

---

### Task 2: 后端 visual_analysis prompt + 路由

**Files:**
- Modify: `backend/functions/lib/prompts.mjs`
- Modify: `backend/functions/ai.mjs`（VISION_ACTIONS 加一项）

**Interfaces:**
- Consumes: 既有 callVisionLLM（零改动）
- Produces: `POST /api/ai {action:'visual_analysis', payload:{imageBase64, text}}` → `{text}`（JSON：visualType/composition/stylePreset/palette[8]/elements/layoutReason/recommendations）

- [ ] **Step 1: prompts.mjs 的 gen_skin_vision 条目后新增**

```js
  // AI 视觉分析（V2 Phase 2，§4）：参考图 → 全维度分析（类型/构图/风格/配色/元素/理由/建议）
  // 前端 parseVisualAnalysis 三白名单清洗 + buildDesignPlans 生成 A/B/C 方案
  visual_analysis: (p) => [
    { role: 'system', content: '你是资深平面设计分析师，擅长解构海报的构图方式、配色体系与视觉层次。' },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: p.imageBase64 || '' } },
        {
          type: 'text',
          text: `解构这张参考图的设计，为公众号视觉图（封面海报或章节卡）提供设计分析。补充描述：${p.text || '（无）'}

分析维度：主色/辅色、明度、对比度、视觉情绪、构图方式、图片数量与位置关系、字体层级、装饰元素。

输出一个 JSON 对象：
1. visualType："cover" 或 "section"（判断这张图更适合作封面首图还是章节卡）
2. composition：从以下严格选一个（按图的构图方式）：
   cover-hero（上信息下大图横幅）/ cover-circle（圆形照片构图）/ cover-editorial（杂志错位留白）/ cover-photo（满版大图）/ cover-minimal（极简文字）/
   section-photo-stack（照片叠放）/ section-editorial（杂志章节页）/ section-split（左右分栏）/ section-minimal（极简章节）/ section-full-photo（满版图浮层）
3. stylePreset："journal"（手账杂志：留白细线轻装饰）/"bold"（大色块：高对比强标题）/"soft"（柔和：低对比圆角）三选一
4. palette：8 个 hex 颜色数组，按序：[页面底色, 主强调色, 卡片底色, 墨色文字, 落款文字色, 落款描边色, 落款底色, 次强调色]（从图提取，明度对比须可读）
5. elements：图中的设计元素标识数组，如 ["chapterNumber","chapterTitle","photoStack","divider","tag","dateBadge"]
6. layoutReason：一句话（40 字内）说明构图判断依据
7. recommendations：2-5 条具体设计建议（每条 40 字内）

严格按 JSON 输出，不要任何其他文字，不要 markdown 代码块包裹。`,
        },
      ],
    },
  ],
```

- [ ] **Step 2: ai.mjs 的 VISION_ACTIONS 加 visual_analysis**

```js
  const VISION_ACTIONS = new Set(['gen_skin_vision', 'visual_analysis']);
```

- [ ] **Step 3: 语法验证 + 提交**

Run: `node --check backend/functions/lib/prompts.mjs; node --check backend/functions/ai.mjs`（静默通过）

```bash
git add backend/functions/lib/prompts.mjs backend/functions/ai.mjs
git commit -m "feat(visual): visual_analysis 全维度识图 prompt 与路由（V2 Phase 2 Task 2）"
```

---

### Task 3: VisualDesignAI.vue 组件 + VisualPanel 接线

**Files:**
- Create: `frontend/src/components/visual/VisualDesignAI.vue`
- Modify: `frontend/src/components/visual/VisualPanel.vue`（引入组件 + apply 处理器）

**Interfaces:**
- Consumes:
  - `parseVisualAnalysis(text)` / `buildDesignPlans(analysis, visualType)`（Task 1）
  - `request('/api/ai')`（client.js）、`compressSpec(w,h)`（vision-skin.js）
  - VisualPanel 既有状态：composition/activeType/stylePreset(defineModel)/coverData/cardData/themeId/themeOverrides
- Produces:
  - VisualDesignAI emits：`apply-plan({ visualType, composition, stylePreset, colors })`
  - VisualPanel `onApplyPlan`：composition[visualType]=composition；stylePreset（defineModel）=stylePreset；8 色经 emit 上抛给 TaskDetail？——**否**：8 色写入需要走 themeOverrides（TaskDetail 持有）。设计：VisualPanel 把 colors 通过既有 emit 链上抛——新增 emit `apply-colors`（TaskDetail 监听并入 themeOverrides，模式同 onSkinApply）。为控制本批范围：**colors 暂存 VisualPanel 内不生效，方案应用只切构图+风格+文案**？——不行，指令要求配色生效。落地方案：TaskDetail 在视觉步 VisualPanel 上加 `@apply-colors="onVisualColors"`，handler 复用 onSkinApply 的 colors 写法（清空覆盖+写入+自动保存）。

- [ ] **Step 1: 创建 VisualDesignAI.vue**

```vue
<script setup>
// AI 视觉设计（V2 Phase 2）：上传参考图 → 全维度分析 → 3 个构图互异方案 → 小编点选应用
// AI 只建议：应用事件抛给 VisualPanel 写入编辑态，生成仍由小编手动触发
import { reactive, ref } from 'vue';
import { request } from '../../api/client.js';
import { compressSpec } from '../../utils/vision-skin.js';
import { parseVisualAnalysis, buildDesignPlans } from '../../utils/visual-analysis.js';

const props = defineProps({ defaultVisualType: { type: String, default: 'cover' } });
const emit = defineEmits(['apply-plan']);

const state = reactive({
  loading: false, error: '',
  imagePreview: '', done: false,
  analysis: null, // { visualType, stylePreset, colors, elements, layoutReason, recommendations }
  plans: [],     // [{ name, composition, compositionLabel, stylePreset, note }]
});
let imageBase64 = '';

const fileInput = ref(null);
function pickImage() { fileInput.value?.click(); }

function onFileChange(e) {
  state.error = '';
  const file = e.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    state.error = '仅支持 JPG/PNG/WebP 图片';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => compressToDataUrl(reader.result);
  reader.readAsDataURL(file);
  e.target.value = '';
}

// Canvas 压缩：与 VisionSkinModal 同策略（compressSpec 纯函数共用）
function compressToDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    const { targetW, targetH, quality } = compressSpec(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);
    imageBase64 = canvas.toDataURL('image/jpeg', quality);
    state.imagePreview = imageBase64;
  };
  img.onerror = () => { state.error = '图片读取失败，请换一张'; };
  img.src = dataUrl;
}

// 分析参考图（真实视觉模型调用）
async function analyze() {
  if (!imageBase64) return;
  state.loading = true;
  state.error = '';
  state.done = false;
  try {
    const data = await request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'visual_analysis', payload: { imageBase64 } }),
    });
    const r = parseVisualAnalysis(data.text);
    if (!r.ok) { state.error = r.error; return; }
    state.analysis = r;
    state.plans = buildDesignPlans(r, r.visualType);
    state.done = true;
  } catch (e) {
    state.error = 'AI 分析失败，请重试：' + e.message;
  } finally {
    state.loading = false;
  }
}

// 应用方案：构图+风格+配色一起上抛（VisualPanel 写构图/风格，colors 再上抛 TaskDetail）
function applyPlan(plan) {
  emit('apply-plan', {
    visualType: state.analysis.visualType,
    composition: plan.composition,
    stylePreset: plan.stylePreset,
    colors: state.analysis.colors,
    elements: state.analysis.elements,
    recommendations: state.analysis.recommendations,
  });
}
</script>
<template>
  <div class="vd-ai">
    <div class="row">
      <button type="button" class="ai-btn" :disabled="state.loading" @click="pickImage">📷 上传参考图</button>
      <button type="button" class="ai-btn primary" :disabled="state.loading || !state.imagePreview" @click="analyze">
        {{ state.loading ? '分析中…' : '✨ AI 视觉设计' }}
      </button>
      <img v-if="state.imagePreview" :src="state.imagePreview" class="img-preview" alt="参考图" />
    </div>
    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="onFileChange" />
    <p v-if="state.error" class="error">{{ state.error }}</p>

    <template v-if="state.done">
      <!-- 识别结果摘要（指令 §5 版式） -->
      <div class="result-box">
        <p>视觉类型：{{ state.analysis.visualType === 'cover' ? '封面' : '章节页' }} · 风格：{{ state.analysis.stylePreset }} · 配色：8 色</p>
        <p v-if="state.analysis.layoutReason" class="reason">{{ state.analysis.layoutReason }}</p>
        <p v-if="state.analysis.recommendations.length" class="rec">{{ state.analysis.recommendations.join('；') }}</p>
      </div>
      <!-- 方案 A/B/C：构图互异 -->
      <div class="plans">
        <div v-for="p in state.plans" :key="p.composition" class="plan-card">
          <p class="plan-name">{{ p.name }} · {{ p.compositionLabel }}</p>
          <p class="plan-note">{{ p.note }}</p>
          <button type="button" class="apply-btn" @click="applyPlan(p)">使用这个设计</button>
        </div>
      </div>
    </template>
  </div>
</template>
<style scoped>
.vd-ai { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; }
.ai-btn { padding: 5px 14px; border: 1px solid #1a1a1a; border-radius: 14px; background: #fff; cursor: pointer; }
.ai-btn.primary { background: #1a1a1a; color: #fff; }
.ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.img-preview { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e5e5; }
.error { color: #e74c3c; font-size: 13px; margin: 0; }
.result-box { border: 1px dashed #bbb; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #333; }
.result-box p { margin: 0 0 2px; }
.reason, .rec { color: #999; font-size: 12px; }
.plans { display: flex; gap: 8px; flex-wrap: wrap; }
.plan-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px; width: 150px; display: flex; flex-direction: column; gap: 4px; }
.plan-name { margin: 0; font-size: 13px; font-weight: bold; }
.plan-note { margin: 0; font-size: 12px; color: #999; flex: 1; }
.apply-btn { padding: 3px 0; border: 1px solid #27ae60; color: #27ae60; border-radius: 12px; background: #fff; cursor: pointer; }
</style>
```

- [ ] **Step 2: VisualPanel.vue 四处修改（串行）**

（1）import 区加：

```js
import VisualDesignAI from './VisualDesignAI.vue'; // AI 视觉设计（V2 Phase 2）
```

（2）emits 声明扩为 `['images-change', 'apply-colors']`

（3）onApplyCard 函数后加处理器：

```js
// AI 设计方案应用（V2 Phase 2）：构图+风格写入编辑态，8 色上抛 TaskDetail 进 themeOverrides
function onApplyPlan({ visualType, composition, stylePreset, colors }) {
  composition[visualType] = composition;
  activeType.value = visualType; // 焦点切到应用的卡
  stylePreset.value = stylePreset; // defineModel 同步 TaskDetail（正文排版同源）
  emit('apply-colors', colors);
}
```

（注意：`composition` 局部 reactive 与参数名 `composition` 遮蔽——参数重命名为 `comp`：`function onApplyPlan({ visualType, composition: comp, stylePreset: preset, colors })`，函数体 `composition[visualType] = comp; stylePreset.value = preset;`——V2 Task 3 同款遮蔽问题，此处前置规避。）

（4）模板 VisualSuggest 之后插入：

```vue
    <!-- AI 视觉设计（V2 Phase 2）：参考图 → 全维度分析 → 3 方案 -->
    <VisualDesignAI @apply-plan="onApplyPlan" />
```

- [ ] **Step 3: TaskDetail.vue 两处修改（串行）**

（1）视觉步 VisualPanel 标签加监听：

```vue
            :bound-images="boundImages" @images-change="onVisualImagesChange" @apply-colors="onVisualColors" />
```

（2）onVisualImagesChange 函数后加：

```js
// AI 视觉设计配色应用（V2 Phase 2）：8 色进 themeOverrides（复用 AI 配色的应用语义：清空覆盖写整套）
function onVisualColors(colors) {
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
  Object.assign(themeOverrides, colors); // 自动保存链路既有（themeSnapshot watch）
}
```

- [ ] **Step 4: 验证**

1. frontend/ `npm test`：100 全绿
2. frontend/ `npm run build`：成功
3. 行数复核：VisualPanel ≤205（新增 10 行内）；VisualDesignAI ≤150

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/visual/VisualDesignAI.vue frontend/src/components/visual/VisualPanel.vue frontend/src/components/TaskDetail.vue
git commit -m "feat(visual): VisualDesignAI 参考图分析三方案组件与应用链路（V2 Phase 2 Task 3）"
```

---

### Task 4: 真机验收 + 收尾汇报

**Files:** 无新代码

- [ ] **Step 1: 联调环境**：根目录后台 `node dev-server.mjs` + frontend/ 后台 `npm run dev`

- [ ] **Step 2: Playwright 验收（真实 GLM-4V-Flash 调用）**

1. 视觉步：AI 视觉设计区出现（上传参考图 + AI 视觉设计两按钮）
2. 脚本生成参考图（canvas 色块图注入 file input）→ 点分析（真实模型调用，≤70s）
3. 识别结果摘要渲染（视觉类型/风格/配色 8 色/layoutReason）
4. **方案 A/B/C 三卡渲染且构图互异**（三卡 compositionLabel 不同断言）
5. 点"使用这个设计"：焦点卡构图选择器变方案值、风格选择器变方案风格、预览配色变化（themeOverrides 生效——预览 HTML 色值变化断言）
6. 应用后再手动"生成并设为封面"仍走既有链路（AI 只建议不代决策验证）
7. 坏输入路径：传损坏文件/非图片 → 明确错误提示不崩页面
8. 控制台零错误；`npm test` 100 全绿 + build 成功收尾

- [ ] **Step 3: 清理临时产物、汇报（修改文件/新增功能/方案生成逻辑/测试结果/已知问题），停止等验收**

---

## Self-Review 记录

- **Spec 覆盖**：指令 §4 全维度输出（visualType/composition/stylePreset/palette/elements/layoutReason/recommendations）→ Task 1 parse + Task 2 prompt；§4 三白名单（VALID_VISUAL_TYPES/COMPOSITIONS/STYLE_PRESETS）→ Task 1（type 二选一 + composition/stylePreset 白名单，palette hex 校验）；§5 推荐方案 A/B/C 不同 Composition → Task 1 buildDesignPlans 互异断言 + Task 3 三卡 UI；§5"使用这个设计" → apply-plan 链路（构图/风格/配色三生效）。
- **占位符扫描**：无 TBD；后端无单测沿用项目惯例（真机验证）；Task 3 遮蔽问题前置写明（参数重命名 comp/preset）。
- **类型一致性**：`parseVisualAnalysis(text) → {ok, visualType, composition, stylePreset, colors, elements, recommendations, layoutReason, error}` Task 1 产出 = Task 3 analyze 消费；`buildDesignPlans(analysis, visualType)` 产出 plans 元素 `{name, composition, compositionLabel, stylePreset, note}` = applyPlan 事件负载源；`apply-plan({visualType, composition, stylePreset, colors, elements, recommendations})` = VisualPanel onApplyPlan 消费（遮蔽重命名 comp/preset 已注明）；`apply-colors(colors)` = TaskDetail onVisualColors 消费。
