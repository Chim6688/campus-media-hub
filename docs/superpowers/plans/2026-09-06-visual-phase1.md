# V1.0 Phase 1 视觉模板底座 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 StylePreset 结构风格包 + Cover Poster/Section Card 模板渲染函数 + html2canvas 懒加载导出管线，用 Mock 数据在真机跑通"三风格 × 两模板"的 PNG 导出。

**Architecture:** 单一渲染源——`visual-templates.js` 纯函数返回 inline-style HTML 字符串，预览与导出共用；导出时懒加载 html2canvas 截图离屏自然尺寸克隆节点。模板只用 CSS 白名单属性（文档流/flex/border/radius），默认 journal 风格。

**Tech Stack:** Vue 3 + Vite 6（既有）、html2canvas（新增，dynamic import 分包）、node --test（既有测试框架）。

**Spec:** `docs/superpowers/specs/2026-09-06-visual-production-design.md`

## Global Constraints

- html2canvas 仅在点击导出时 `import('html2canvas')`，禁止静态 import（首屏零成本，build 后须独立 chunk）
- 预览与导出必须同一渲染函数，禁止第二套 Canvas 手绘逻辑
- 模板 CSS 白名单：background-color/border/border-radius/padding/margin/font-size/line-height/flex/文档流
- 模板禁用：filter/backdrop-filter/复杂渐变/复杂阴影/CSS animation/transform 核心布局/absolute 主布局
- 固定尺寸：Cover Poster 900×383，Section Card 900×1200；导出 scale=2（1800×766 / 1800×2400）
- 导出前必须 `document.fonts.ready` + 全部 `<img>` 加载完成；任一图片失败 → 明确报错终止，不生成缺图 PNG
- `<img>` 带 `crossorigin="anonymous"`；html2canvas 配置 `useCORS: true`
- 中文注释：主要代码段必须有中文注释（无注释的新代码视为不合规）
- 命名：文件短横线（style-presets.js）、组件大驼峰（VisualPanel.vue）、变量小驼峰
- TDD：每个纯函数先写失败测试再实现；测试命令在 `frontend/` 目录下执行 `npm test`
- 现有测试全绿是硬性门槛（零回归）

---

### Task 1: style-presets.js 风格包注册表 + normalizeStylePreset（TDD）

**Files:**
- Create: `frontend/src/utils/style-presets.js`
- Test: `frontend/tests/style-presets.test.mjs`

**Interfaces:**
- Consumes: 无（纯增量）
- Produces:
  - `STYLE_PRESETS: Object`（键为 'journal' | 'bold' | 'soft'，值含 id/name/description）
  - `DEFAULT_STYLE_PRESET: 'journal'`
  - `normalizeStylePreset(raw: any): string`（合法返回原值，非法/空/undefined 返回 'journal'）

- [ ] **Step 1: 写失败测试**

```js
// frontend/tests/style-presets.test.mjs
// StylePreset 白名单校验（V1.0 Phase 1）：AI 输出不可信，白名单是唯一防线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLE_PRESETS, DEFAULT_STYLE_PRESET, normalizeStylePreset } from '../src/utils/style-presets.js';

test('STYLE_PRESETS：三套风格包契约（id/name/description 齐全）', () => {
  assert.deepEqual(Object.keys(STYLE_PRESETS).sort(), ['bold', 'journal', 'soft']);
  for (const p of Object.values(STYLE_PRESETS)) {
    assert.ok(p.id && p.name && p.description, `${p.id} 缺字段`);
  }
});

test('DEFAULT_STYLE_PRESET 为 journal（零回归要求）', () => {
  assert.equal(DEFAULT_STYLE_PRESET, 'journal');
  assert.ok(STYLE_PRESETS[DEFAULT_STYLE_PRESET]);
});

test('normalizeStylePreset：合法值原样返回', () => {
  assert.equal(normalizeStylePreset('journal'), 'journal');
  assert.equal(normalizeStylePreset('bold'), 'bold');
  assert.equal(normalizeStylePreset('soft'), 'soft');
});

test('normalizeStylePreset：非法/空/非字符串回退 journal', () => {
  assert.equal(normalizeStylePreset(''), 'journal', '空串回退');
  assert.equal(normalizeStylePreset(undefined), 'journal', 'undefined 回退');
  assert.equal(normalizeStylePreset(null), 'journal', 'null 回退');
  assert.equal(normalizeStylePreset('guochao'), 'journal', '非白名单值回退');
  assert.equal(normalizeStylePreset('JOURNAL'), 'journal', '大小写不符回退');
  assert.equal(normalizeStylePreset(123), 'journal', '非字符串回退');
  assert.equal(normalizeStylePreset({ id: 'bold' }), 'journal', '对象回退');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`（在 `frontend/` 目录）
Expected: FAIL —— `Cannot find module .../style-presets.js`

- [ ] **Step 3: 最小实现**

```js
// frontend/src/utils/style-presets.js
// StylePreset 结构风格包注册表（V1.0 Phase 1）
// StylePreset = 整篇推文的视觉 DNA：同一风格包同时驱动正文排版与视觉图片（封面/章节卡）
// 注意：这是"结构风格"而非颜色主题；颜色仍由 themes.js 的 8 色契约负责

// 三套风格包：description 同时用于 UI 提示与后端识图 prompt（语义须一致）
export const STYLE_PRESETS = {
  // journal（默认）：现有渲染零回归的基准风格
  journal: {
    id: 'journal', name: '手账杂志',
    description: '轻文艺、留白、细线、轻装饰',
  },
  bold: {
    id: 'bold', name: '大色块',
    description: '高对比、强标题、几何结构、活动感',
  },
  soft: {
    id: 'soft', name: '柔和',
    description: '低对比、圆角、清新、轻装饰',
  },
};

// 默认风格：不指定/非法输入一律 journal（历史数据兼容 + AI 输出容错）
export const DEFAULT_STYLE_PRESET = 'journal';

// 白名单校验：非法值静默回退 journal，绝不让 AI 输出崩掉页面
export function normalizeStylePreset(raw) {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(STYLE_PRESETS, raw)
    ? raw
    : DEFAULT_STYLE_PRESET;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`（在 `frontend/` 目录）
Expected: PASS（style-presets 全绿，既有测试全绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/style-presets.js frontend/tests/style-presets.test.mjs
git commit -m "feat(visual): StylePreset 风格包注册表与白名单校验（Phase 1 Task 1）"
```

---

### Task 2: visual-templates.js 模板渲染函数（TDD）

**Files:**
- Create: `frontend/src/utils/visual-templates.js`
- Test: `frontend/tests/visual-templates.test.mjs`

**Interfaces:**
- Consumes: `resolveTheme(themeId, overrides)`（themes.js 既有导出，返回含 8 色 + 数值令牌的完整对象）
- Produces:
  - `COVER_SIZE = { width: 900, height: 383 }`
  - `SECTION_CARD_SIZE = { width: 900, height: 1200 }`
  - `renderCoverPoster(data, themeId, overrides): string`（HTML 字符串）
  - `renderSectionCard(data, themeId, overrides): string`
  - data 契约（Cover）: `{ org, title, subtitle, tags: string[], place, date, imageUrl }`
  - data 契约（Section Card）: `{ partNum, title, subtitle, imageUrl }`

- [ ] **Step 1: 写失败测试**

```js
// frontend/tests/visual-templates.test.mjs
// 视觉模板渲染（V1.0 Phase 1）：三风格 × 两模板 + CSS 白名单 + 固定尺寸断言
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_SIZE, SECTION_CARD_SIZE,
  renderCoverPoster, renderSectionCard,
} from '../src/utils/visual-templates.js';

const coverData = {
  org: '深圳信息职业技术大学', title: '山海电白青春突击队', subtitle: '文旅调研实践纪实',
  tags: ['社会实践', '文旅调研'], place: '深圳龙岗 · 茂名电白', date: '2026年8月',
  imageUrl: 'https://example.com/photo.jpg',
};
const cardData = { partNum: 1, title: '旧址参观学党史', subtitle: '追溯红色足迹', imageUrl: 'https://example.com/p.jpg' };

// CSS 禁用清单扫描：html2canvas 兼容性红线（规格 §3.10/3.11）
const BANNED = [/filter\s*:/, /backdrop-filter\s*:/, /linear-gradient\s*\(/, /radial-gradient\s*\(/, /animation\s*:/, /box-shadow\s*:/, /position\s*:\s*absolute/, /transform\s*:/];

test('固定尺寸契约：Cover 900×383 / Section Card 900×1200', () => {
  assert.deepEqual(COVER_SIZE, { width: 900, height: 383 });
  assert.deepEqual(SECTION_CARD_SIZE, { width: 900, height: 1200 });
});

test('Cover 三风格渲染：尺寸/中文/crossorigin/图片 URL 断言', () => {
  for (const preset of ['journal', 'bold', 'soft']) {
    const html = renderCoverPoster(coverData, 'greenPink', { stylePreset: preset });
    assert.ok(html.includes(`width: ${COVER_SIZE.width}px`), `${preset} 固定宽`);
    assert.ok(html.includes(`height: ${COVER_SIZE.height}px`), `${preset} 固定高`);
    assert.ok(html.includes('深圳信息职业技术大学'), `${preset} 中文机构名`);
    assert.ok(html.includes('山海电白青春突击队'), `${preset} 中文主标题`);
    assert.ok(html.includes('crossorigin="anonymous"'), `${preset} CORS 属性`);
    assert.ok(html.includes('https://example.com/photo.jpg'), `${preset} 图片 URL`);
  }
});

test('Section Card 三风格渲染：Part 序号/标题/尺寸断言', () => {
  for (const preset of ['journal', 'bold', 'soft']) {
    const html = renderSectionCard(cardData, 'greenPink', { stylePreset: preset });
    assert.ok(html.includes(`width: ${SECTION_CARD_SIZE.width}px`), `${preset} 固定宽`);
    assert.ok(html.includes(`height: ${SECTION_CARD_SIZE.height}px`), `${preset} 固定高`);
    assert.ok(html.includes('01'), `${preset} Part 序号补零`);
    assert.ok(html.includes('旧址参观学党史'), `${preset} 中文标题`);
  }
});

test('CSS 白名单：三风格 × 两模板不含禁用属性', () => {
  const outputs = [
    ...['journal', 'bold', 'soft'].map((p) => renderCoverPoster(coverData, 'greenPink', { stylePreset: p })),
    ...['journal', 'bold', 'soft'].map((p) => renderSectionCard(cardData, 'greenPink', { stylePreset: p })),
  ];
  for (const html of outputs) {
    for (const re of BANNED) assert.ok(!re.test(html), `发现禁用 CSS：${re}`);
  }
});

test('三风格输出互不相同（journal/bold/soft 结构确实有差异）', () => {
  const j = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'journal' });
  const b = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'bold' });
  const s = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'soft' });
  assert.notEqual(j, b); assert.notEqual(b, s); assert.notEqual(j, s);
});

test('空字段容错：缺 org/tags/imageUrl 不抛异常', () => {
  const html = renderCoverPoster({ title: '仅标题' }, 'greenPink', { stylePreset: 'journal' });
  assert.ok(html.includes('仅标题'));
  assert.ok(!html.includes('undefined'), '空字段不得泄漏 undefined');
  assert.ok(!html.includes('[object Object]'));
});

test('超长标题：截断或缩号，不溢出模板（含截断标记）', () => {
  const long = '超'.repeat(60);
  const html = renderCoverPoster({ ...coverData, title: long }, 'greenPink', { stylePreset: 'journal' });
  // 截断策略：超出长度上限时输出省略号结尾（具体上限在实现中定，测试只断言不溢出且带省略标记）
  assert.ok(html.includes('…') || html.includes('...'), '超长标题须有省略标记');
});

test('非法风格回退 journal（normalizeStylePreset 已测，此处验证渲染入口容错）', () => {
  const ok = renderCoverPoster(coverData, 'greenPink', {});
  const bad = renderCoverPoster(coverData, 'greenPink', { stylePreset: '不存在的' });
  assert.equal(ok, bad, '非法 stylePreset 渲染结果 = journal 默认');
});

test('主题色注入：greenPink 的 accentA 出现在输出中', () => {
  const html = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'journal' });
  assert.ok(html.includes('#FD98C9'), 'greenPink accentA #FD98C9');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`（在 `frontend/` 目录）
Expected: FAIL —— `Cannot find module .../visual-templates.js`

- [ ] **Step 3: 实现（journal/bold/soft 三分支模板）**

实现要点（完整代码由执行者按以下结构写出，所有色值/圆角/字号取自 resolveTheme 返回的 theme 对象）：

```js
// frontend/src/utils/visual-templates.js
// 视觉模板渲染函数（V1.0 Phase 1）：Cover Poster / Section Card
// 单一渲染源：预览与导出共用本文件函数（规格 §3.1），模板只用 CSS 白名单属性
// 布局一律文档流 + flex；图片带 crossorigin 供 html2canvas useCORS 截图
import { resolveTheme } from './themes.js';
import { normalizeStylePreset } from './style-presets.js';

// 固定尺寸：公众号首图 2.35:1 / 章节卡竖版（导出 scale=2 实际 1800 宽）
export const COVER_SIZE = { width: 900, height: 383 };
export const SECTION_CARD_SIZE = { width: 900, height: 1200 };

// —— 工具 ——
// HTML 转义（与 wechat-format.js esc 同构）
function esc(s) { /* ... */ }
// 超长标题截断：超上限截 27 字 + 省略号（Cover 主标题上限 28 字，防止溢出固定高度）
function clampText(s, max) { /* ... */ }
// 图片节点：无图渲染纯色占位块（Phase 3 接真实图后仍有兜底）；有图 crossorigin
function imgNode(url, theme, aspect) { /* ... */ }

// —— Cover Poster：三风格分支 ——
// journal：白卡 + 细描边 + 小胶囊标签（贴现版手账气质）
// bold：大色块背景 + 反白大标题（accentA 整面）
// soft：低对比 + 大圆角卡片 + 圆角标签
export function renderCoverPoster(data, themeId, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides);
  const preset = normalizeStylePreset(opts.stylePreset);
  // data 解构 + 空字段容错 + esc/clampText
  // 返回 `<div style="width:900px;height:383px;...">...</div>`
}
// —— Section Card：三风格分支 ——
export function renderSectionCard(data, themeId, opts = {}) { /* 同构 */ }
```

结构要求：
- 每个函数内部按 preset 分三个子模板函数（如 `coverJournal/coverBold/coverSoft`），公共部分（尺寸外壳/转义/图片节点）共享
- Cover 信息层级：org（小字）→ title（大字）→ subtitle → 图片区 → place·date（底部条）；tags 渲染为小胶囊行
- Section Card 信息层级：Part 序号（大号）→ 分隔线 → title → subtitle → 图片区（占高约 55%）
- 全部 inline-style；除尺寸外壳 width/height 外不得出现 px 以外的尺寸单位

- [ ] **Step 4: 运行确认通过**

Run: `npm test`（在 `frontend/` 目录）
Expected: PASS（visual-templates 全绿 + 既有测试全绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/visual-templates.js frontend/tests/visual-templates.test.mjs
git commit -m "feat(visual): Cover Poster/Section Card 三风格模板渲染函数（Phase 1 Task 2）"
```

---

### Task 3: visual-export.js 导出管线（TDD 可测部分 + DOM 部分真机验证）

**Files:**
- Create: `frontend/src/utils/visual-export.js`
- Test: `frontend/tests/visual-export.test.mjs`

**Interfaces:**
- Consumes: 无外部依赖（html2canvas 动态 import）
- Produces:
  - `waitForImages(el: HTMLElement): Promise<void>`（任一 img 失败 → reject Error('图片加载失败（第 N 张）：url')）
  - `exportVisualPNG(el: HTMLElement, filename: string, size: {width, height}): Promise<void>`（触发浏览器下载）

- [ ] **Step 1: 写失败测试（Node 环境可测部分：jsdom 不可用，测纯逻辑与错误路径）**

```js
// frontend/tests/visual-export.test.mjs
// 导出管线（V1.0 Phase 1）：Node 环境只测可注入依赖的部分；
// document.fonts/html2canvas/下载链路属浏览器行为，在真机验证（规格 §7）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForImages } from '../src/utils/visual-export.js';

test('waitForImages：无 img 节点直接 resolve', async () => {
  // 模拟最小 DOM 结构（无 img）
  const el = { querySelectorAll: () => [] };
  await waitForImages(el);
});

test('waitForImages：图片加载失败 reject 并指明第几张', async () => {
  const imgs = [
    { complete: true, naturalWidth: 100, src: 'https://a/1.jpg' },
    { complete: true, naturalWidth: 0, src: 'https://a/2.jpg' }, // 失败图：complete 但 naturalWidth=0
  ];
  const el = { querySelectorAll: () => imgs };
  await assert.rejects(
    () => waitForImages(el),
    (e) => e.message.includes('第 2 张') && e.message.includes('https://a/2.jpg'),
  );
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— module not found

- [ ] **Step 3: 实现**

```js
// frontend/src/utils/visual-export.js
// 视觉导出管线（V1.0 Phase 1）：html2canvas 懒加载 + 前置就绪检查 + 截图下载
// 约束（规格 §3）：fonts.ready → 图片全就绪 → useCORS 截图；任一步失败明确报错，不生成缺图 PNG

// 等待节点内全部 <img> 加载完成；失败即 reject（含序号与 URL，提示用户换图或重试）
export function waitForImages(el) {
  const imgs = Array.from(el.querySelectorAll ? el.querySelectorAll('img') : []);
  const checks = imgs.map((img, i) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (img.complete && img.naturalWidth === 0) {
      return Promise.reject(new Error(`图片加载失败（第 ${i + 1} 张）：${img.src}`));
    }
    // 未加载完：挂 onload/onerror 决议（onerror 也走 naturalWidth=0 路径）
    return new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`图片加载失败（第 ${i + 1} 张）：${img.src}`));
    });
  });
  return Promise.all(checks);
}

// 导出 PNG：前置检查 → 离屏克隆自然尺寸节点 → html2canvas(useCORS) → 触发下载
export async function exportVisualPNG(el, filename, size) {
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
    // 6) 触发浏览器下载
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    document.body.removeChild(clone);
  }
}
```

- [ ] **Step 4: 安装依赖 + 运行确认通过**

Run（frontend/ 目录）:
```bash
npm install html2canvas
npm test
```
Expected: PASS（visual-export 全绿 + 既有全绿；package.json 新增 dependencies.html2canvas）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/visual-export.js frontend/tests/visual-export.test.mjs frontend/package.json frontend/package-lock.json
git commit -m "feat(visual): html2canvas 懒加载导出管线（fonts/images 就绪检查 + useCORS）（Phase 1 Task 3）"
```

---

### Task 4: VisualPanel.vue 视觉面板组件 + Mock 数据真机验证

**Files:**
- Create: `frontend/src/components/visual/VisualPanel.vue`
- Create: `frontend/src/components/visual/VisualCardPreview.vue`
- Create: `frontend/src/components/visual/VisualTemplateSelector.vue`
- Modify: `frontend/src/components/TaskDetail.vue`（约 L788-L792 之后插入第④步视觉面板；步骤条六步→七步由 Phase 2 统一处理，本 Task 仅加面板入口，不改 steps.js）

**Interfaces:**
- Consumes:
  - `renderCoverPoster/renderSectionCard/COVER_SIZE/SECTION_CARD_SIZE`（Task 2）
  - `exportVisualPNG`（Task 3）
  - `STYLE_PRESETS/DEFAULT_STYLE_PRESET`（Task 1）
- Produces:
  - `VisualPanel.vue`：props `{ taskId: String, title: String, themeId: String, themeOverrides: Object }`
  - TaskDetail 集成点：视觉面板插入 images 步骤之后（暂挂在排版步骤上方，Phase 2 再独立成步）

- [ ] **Step 1: 写 VisualTemplateSelector / VisualCardPreview（展示组件，无单测）**

```vue
<!-- frontend/src/components/visual/VisualTemplateSelector.vue -->
<script setup>
// 风格三选一选择器：journal/bold/soft（识图结果与手选共用此状态）
import { STYLE_PRESETS } from '../../utils/style-presets.js';
const model = defineModel({ type: String, default: 'journal' });
</script>
<template>
  <div class="preset-selector">
    <button v-for="p in STYLE_PRESETS" :key="p.id" :class="{ active: model === p.id }"
      :title="p.description" @click="model = p.id">{{ p.name }}</button>
  </div>
</template>
<style scoped>
.preset-selector { display: flex; gap: 8px; }
.preset-selector button { padding: 6px 14px; border: 1px solid #d9d9d9; border-radius: 16px; background: #fff; cursor: pointer; }
.preset-selector button.active { border-color: #1a1a1a; background: #1a1a1a; color: #fff; }
</style>
```

```vue
<!-- frontend/src/components/visual/VisualCardPreview.vue -->
<script setup>
// 视觉卡预览：同一渲染函数产出 HTML（单一渲染源），CSS transform 仅用于显示缩放
// 导出走 exportVisualPNG，预览/导出不同源即违规
import { computed } from 'vue';
import { COVER_SIZE, SECTION_CARD_SIZE, renderCoverPoster, renderSectionCard } from '../../utils/visual-templates.js';
const props = defineProps({
  type: { type: String, default: 'cover' }, // cover | section
  data: { type: Object, required: true },
  themeId: { type: String, default: 'greenPink' },
  themeOverrides: { type: Object, default: () => ({}) },
  stylePreset: { type: String, default: 'journal' },
});
// 预览宽度上限 → 缩放比例（预览区实际宽度 / 模板固定宽）
const props_scale = defineProps({ previewWidth: { type: Number, default: 320 } });
const size = computed(() => (props.type === 'cover' ? COVER_SIZE : SECTION_CARD_SIZE));
const html = computed(() =>
  props.type === 'cover'
    ? renderCoverPoster(props.data, props.themeId, { overrides: props.themeOverrides, stylePreset: props.stylePreset })
    : renderSectionCard(props.data, props.themeId, { overrides: props.themeOverrides, stylePreset: props.stylePreset }),
);
const scale = computed(() => props.previewWidth / size.value.width);
</script>
<template>
  <!-- 外层定宽容器；内层按比例缩放（transform 只做显示，不进导出节点） -->
  <div class="preview-wrap" :style="{ width: previewWidth + 'px', height: size.height * scale + 'px' }">
    <div class="preview-scaled" v-html="html" :style="{ transform: `scale(${scale})`, transformOrigin: 'top left', width: size.width + 'px' }"></div>
  </div>
</template>
<style scoped>
.preview-wrap { overflow: hidden; border: 1px solid #eee; border-radius: 8px; }
.preview-scaled { background: #fafafa; }
</style>
```

- [ ] **Step 2: 写 VisualPanel.vue（Mock 数据 + 导出按钮）**

```vue
<!-- frontend/src/components/visual/VisualPanel.vue -->
<script setup>
// 视觉设计面板（V1.0 Phase 1）：Mock 数据驱动，验证模板渲染 + PNG 导出闭环
// Phase 3 接入真实文章数据（title/正文图片），此处 Mock 结构即最终 data 契约
import { ref, reactive } from 'vue';
import { exportVisualPNG } from '../../utils/visual-export.js';
import { COVER_SIZE } from '../../utils/visual-templates.js';
import VisualCardPreview from './VisualCardPreview.vue';
import VisualTemplateSelector from './VisualTemplateSelector.vue';

const props = defineProps({ taskId: String, title: String, themeId: String, themeOverrides: Object });

// Mock 数据（契约与 Task 2 一致）：Phase 3 替换为任务真实数据
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

// 导出：预览节点即导出节点（同一 DOM），失败提示第几张图
async function onExport(type) {
  exporting.value = true;
  exportError.value = '';
  try {
    const el = document.querySelector(type === 'cover' ? '.preview-cover .preview-scaled' : '.preview-section .preview-scaled');
    const size = type === 'cover' ? COVER_SIZE : { width: 900, height: 1200 };
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
    <div class="preview-col preview-cover">
      <p class="card-label">封面 Cover Poster</p>
      <VisualCardPreview type="cover" :data="coverData" :theme-id="themeId" :theme-overrides="themeOverrides || {}"
        :style-preset="stylePreset" :preview-width="320" />
      <button :disabled="exporting" @click="onExport('cover')">{{ exporting ? '导出中…' : '导出 PNG' }}</button>
    </div>
    <div class="preview-col preview-section">
      <p class="card-label">章节卡 Section Card</p>
      <VisualCardPreview type="section" :data="cardData" :theme-id="themeId" :theme-overrides="themeOverrides || {}"
        :style-preset="stylePreset" :preview-width="200" />
      <button :disabled="exporting" @click="onExport('section')">{{ exporting ? '导出中…' : '导出 PNG' }}</button>
    </div>
    <p v-if="exportError" class="export-error">导出失败：{{ exportError }}</p>
  </div>
</template>
<style scoped>
.visual-panel { display: flex; flex-direction: column; gap: 16px; }
.preview-col { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.card-label { font-size: 13px; color: #666; margin: 0; }
.export-error { color: #e74c3c; font-size: 13px; }
</style>
```

- [ ] **Step 3: TaskDetail.vue 集成（排版步骤顶部插入面板）**

Modify: `frontend/src/components/TaskDetail.vue`
在 L795 `<template v-else-if="activeStep === 'layout'">` 块内、`.layout-controls` 之前插入：

```vue
            <!-- ④.5 视觉设计（Phase 1 Mock 验证入口；Phase 2 独立成步骤） -->
            <VisualPanel :task-id="task.id" :title="title" :theme-id="themeId"
              :theme-overrides="{ ...themeOverrides }" />
```

并在 script 顶部 import 区加入：

```js
import VisualPanel from './visual/VisualPanel.vue'; // 视觉设计面板（V1.0 Phase 1）
```

- [ ] **Step 4: 构建验证（html2canvas 独立分包断言）**

Run（frontend/ 目录）:
```bash
npm run build
```
Expected: BUILD 成功；`dist/assets/` 下存在独立 chunk 文件（如 `html2canvas-*.js` 或类似 vendor chunk），主 chunk 不含 html2canvas 代码（可用 `Select-String html2canvas` 抽查主 index-*.js 无命中或仅有 import 调用桩）

- [ ] **Step 5: 真机验证（dev-server + 独立浏览器）**

Run（项目根目录）:
```bash
node dev-server.mjs
```
浏览器独立窗口打开 `http://localhost:5173`（或 dev-server 实际端口），进入任一任务 → 排版步骤：
1. 视觉面板出现：封面 320px 宽预览 + 章节卡 200px 宽预览（Mock 数据）
2. 切换三风格（手账杂志/大色块/柔和）：预览即时变化
3. 点"导出 PNG"：浏览器下载 `{type}-{timestamp}.png`
4. 打开 PNG 检查：中文无乱码/无豆腐块、尺寸 1800×766 与 1800×2400、颜色与预览一致
5. 断网或改 Mock imageUrl 为 404 → 导出 → 页面提示"图片加载失败（第 N 张）"，不生成 PNG

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/visual/ frontend/src/components/TaskDetail.vue
git commit -m "feat(visual): VisualPanel 视觉面板 + Mock 数据真机导出闭环（Phase 1 Task 4）"
```

---

### Task 5: Phase 1 收尾——全量回归 + 汇报

**Files:**
- Modify: 无新文件（验证性任务）

**Interfaces:**
- Consumes: Task 1-4 全部产出
- Produces: Phase 1 验收汇报（按原方案 §35 格式）

- [ ] **Step 1: 全量测试**

Run（frontend/ 目录）:
```bash
npm test
```
Expected: 全部 PASS（含既有 6 个测试文件 + 新增 3 个）

- [ ] **Step 2: 构建 + 分包复核**

Run: `npm run build`
Expected: 成功；html2canvas 独立 chunk 存在

- [ ] **Step 3: 汇报（按原方案 §35 格式，暂停等待验收）**

汇报模板：
```text
## 本次完成（Phase 1 视觉模板底座）
### 修改文件
- frontend/src/utils/style-presets.js（新增）
- frontend/src/utils/visual-templates.js（新增）
- frontend/src/utils/visual-export.js（新增）
- frontend/src/components/visual/VisualPanel.vue、VisualCardPreview.vue、VisualTemplateSelector.vue（新增）
- frontend/src/components/TaskDetail.vue（插入视觉面板）
- frontend/package.json（新增依赖 html2canvas）
### 完成功能
- 三风格包（journal/bold/soft）注册表与白名单校验
- Cover Poster（900×383）/ Section Card（900×1200）三风格模板渲染
- html2canvas 懒加载导出管线（fonts/images 就绪检查、useCORS、失败即报错）
- Mock 数据真机导出闭环（预览=导出同源）
### 保留的现有功能
- 排版/预览/复制/审核全链路零改动（视觉面板为纯增量入口）
### 测试
- npm test：通过（新增 3 个测试文件，既有全绿）
- npm run build：通过（html2canvas 独立分包）
- 真机：三风格两模板导出 PNG 尺寸/中文/颜色验证通过
### 当前已知问题
- Mock 数据硬编码（Phase 3 替换）；视觉面板暂挂排版步骤（Phase 2 独立成步）
### 下一步
等待确认，不自动进入下一 Phase。
```

---

## Self-Review 记录

- **Spec 覆盖**：规格 §2（新文件清单）→ Task 1-4；§3（导出 14 条）→ Task 2 白名单测试 + Task 3 管线 + Task 4 真机；§4（StylePreset）→ Task 1；§7（测试策略）→ 各 Task TDD + Task 5 回归。未覆盖项（识图/工作流七步/对接图片系统）属 Phase 2/5/3+4，本计划范围正确。
- **占位符扫描**：Task 2 Step 3 为结构骨架 + 明确实现要点（子模板分函数、信息层级、尺寸单位约束），非 TBD；其余任务代码完整。
- **类型一致性**：`renderCoverPoster(data, themeId, opts)` 的 opts 含 `overrides/stylePreset`，与 Task 4 调用一致；`exportVisualPNG(el, filename, size)` 与 Task 4 调用一致；`STYLE_PRESETS` 键名与测试断言一致。
