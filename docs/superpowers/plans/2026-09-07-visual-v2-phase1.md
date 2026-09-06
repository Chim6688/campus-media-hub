# V2 Phase 1 构图层升级 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立四层架构的 Composition 层——10 种构图注册表 + StylePreset 参数包化（布局/视觉语言解耦）+ VisualEditor 字段编辑拆分，双维解耦测试 + 零回归锚点。

**Architecture:** `compositions.js` 注册 5 Cover + 5 Section 构图（各为独立布局函数）；`renderCoverPoster/renderSectionCard` 按 composition 分派布局，stylePreset 拆为 styleParams 参数包（radiusScale/borderWidth/decorations/fontWeight/uppercase）注入布局函数；VisualEditor.vue 承接字段编辑，VisualPanel 只加标签与 Composition 选择器。

**Tech Stack:** Vue 3 + Vite 6、node --test（既有 83 测试基线）。

**Spec:** `docs/superpowers/specs/2026-09-07-visual-v2-composition-design.md`（方案 A+b 已拍板）

## Global Constraints

- **零回归锚点**：cover-hero + journal 渲染输出 = V1 coverJournal 输出逐字节一致（测试固化对拍）；既有 83 测试全绿（visual-templates 测试按新语义重写除外，属本批目的行为）
- **布局/语言解耦硬红线**：布局函数体内零 preset 分支，只消费 styleParams；布局函数签名统一 `(theme, d, sp)`
- CSS 红线沿用 V1：无 filter/backdrop-filter/渐变/box-shadow/animation/absolute 主布局/transform 主布局；图片节点带 crossorigin
- wechat-format.js 正文排版**零改动**（指令红线）
- 不接 AI / 不做 Storage 迁移 / 不做新导出逻辑 / composition 不入库（会话态）
- 组件 <200 行、中文注释、同文件多编辑串行；测试 `npm test`（frontend/）；PowerShell（无 &&，git -m 直传）
- 30 组合（5 构图 × 3 风格 × 2 类型）渲染不抛异常 + CSS 禁用清单扫描

---

### Task 1: compositions.js 构图注册表 + normalizeComposition（TDD）

**Files:**
- Create: `frontend/src/utils/compositions.js`
- Test: `frontend/tests/compositions.test.mjs`

**Interfaces:**
- Produces:
  - `COMPOSITIONS: Object`——10 键（'cover-hero'/'cover-circle'/'cover-editorial'/'cover-photo'/'cover-minimal'/'section-photo-stack'/'section-editorial'/'section-split'/'section-minimal'/'section-full-photo'），值 `{ type: 'cover'|'section', label }`
  - `COVER_COMPOSITIONS: string[]` / `SECTION_COMPOSITIONS: string[]`（按类型分组的键序）
  - `DEFAULT_COMPOSITION = { cover: 'cover-hero', section: 'section-editorial' }`
  - `normalizeComposition(raw, visualType): string`——合法且类型归属正确返回原值；非法/空/跨类型回退该类型默认

- [ ] **Step 1: 写失败测试**

```js
// 构图注册表与白名单（V2 Phase 1）：Composition 层的第一块基石
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSITIONS, COVER_COMPOSITIONS, SECTION_COMPOSITIONS,
  DEFAULT_COMPOSITION, normalizeComposition,
} from '../src/utils/compositions.js';

test('COMPOSITIONS：10 种构图契约（5 cover + 5 section，label 齐全）', () => {
  assert.equal(Object.keys(COMPOSITIONS).length, 10);
  assert.equal(COVER_COMPOSITIONS.length, 5);
  assert.equal(SECTION_COMPOSITIONS.length, 5);
  for (const [id, c] of Object.entries(COMPOSITIONS)) {
    assert.ok(c.label, `${id} 缺 label`);
    assert.ok(c.type === 'cover' || c.type === 'section');
    // 键名前缀与 type 一致（防手滑注册错组）
    assert.ok(id.startsWith(c.type), `${id} 前缀与 type ${c.type} 不符`);
  }
  for (const k of COVER_COMPOSITIONS) assert.equal(COMPOSITIONS[k].type, 'cover');
  for (const k of SECTION_COMPOSITIONS) assert.equal(COMPOSITIONS[k].type, 'section');
});

test('DEFAULT_COMPOSITION：cover/section 各有默认且在白名单内', () => {
  assert.ok(COMPOSITIONS[DEFAULT_COMPOSITION.cover]);
  assert.ok(COMPOSITIONS[DEFAULT_COMPOSITION.section]);
});

test('normalizeComposition：合法且类型匹配原样返回', () => {
  assert.equal(normalizeComposition('cover-circle', 'cover'), 'cover-circle');
  assert.equal(normalizeComposition('section-split', 'section'), 'section-split');
});

test('normalizeComposition：跨类型/非法/空 回退该类型默认', () => {
  assert.equal(normalizeComposition('section-split', 'cover'), DEFAULT_COMPOSITION.cover, '跨类型回退');
  assert.equal(normalizeComposition('cover-circle', 'section'), DEFAULT_COMPOSITION.section, '跨类型回退');
  assert.equal(normalizeComposition('不存在', 'cover'), DEFAULT_COMPOSITION.cover);
  assert.equal(normalizeComposition('', 'section'), DEFAULT_COMPOSITION.section);
  assert.equal(normalizeComposition(undefined, 'cover'), DEFAULT_COMPOSITION.cover);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— Cannot find module compositions.js

- [ ] **Step 3: 实现**

```js
// frontend/src/utils/compositions.js
// Composition 构图注册表（V2 Phase 1）：构图负责"怎么摆"，与 StylePreset 视觉语言完全解耦
// 每种构图对应 visual-templates.js 中一个独立布局函数；新增构图=在此注册+实现布局函数

// 构图注册表：键=构图 id（前缀即类型，防跨类型误用），label 用于 UI 选择器
export const COMPOSITIONS = {
  // —— Cover（900×383 公众号首图）——
  'cover-hero':      { type: 'cover', label: '主视觉横幅' }, // 上信息带 + 下大图（V1 白卡横幅演化）
  'cover-circle':    { type: 'cover', label: '圆形照片' },   // 圆形照片 + 标签 + 地点日期 + 大标题
  'cover-editorial': { type: 'cover', label: '杂志错位' },   // 大留白 + 照片错位 + 编号 + 分割线
  'cover-photo':     { type: 'cover', label: '满版大图' },   // 图占上半主体 + 底部信息条
  'cover-minimal':   { type: 'cover', label: '极简文字' },   // 纯文字层级 + 细线装饰（无图也成立）
  // —— Section（900×1200 竖版章节卡）——
  'section-photo-stack': { type: 'section', label: '照片叠放' }, // 多图负 margin 错位叠放
  'section-editorial':   { type: 'section', label: '杂志章节' }, // 大编号 + 分割线 + 大标题 + 图
  'section-split':       { type: 'section', label: '左右分栏' }, // 左文右图分栏
  'section-minimal':     { type: 'section', label: '极简章节' }, // 纯文字竖排层级
  'section-full-photo':  { type: 'section', label: '满版图浮层' }, // 全图 + 底部信息浮层
};

// 按类型分组的键序（UI 选择器与布局分派用）
export const COVER_COMPOSITIONS = Object.keys(COMPOSITIONS).filter((k) => COMPOSITIONS[k].type === 'cover');
export const SECTION_COMPOSITIONS = Object.keys(COMPOSITIONS).filter((k) => COMPOSITIONS[k].type === 'section');

// 各类型默认构图：cover-hero 承接 V1 零回归锚点；section-editorial 为杂志式基准
export const DEFAULT_COMPOSITION = { cover: 'cover-hero', section: 'section-editorial' };

// 白名单校验：合法且类型归属正确才通过；任何异常回退该类型默认（AI 输出/用户输入不可信）
export function normalizeComposition(raw, visualType) {
  const fallback = DEFAULT_COMPOSITION[visualType] || DEFAULT_COMPOSITION.cover;
  if (typeof raw !== 'string') return fallback;
  const c = COMPOSITIONS[raw];
  return c && c.type === visualType ? raw : fallback;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（88 个全绿：83 + 5）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/compositions.js frontend/tests/compositions.test.mjs
git commit -m "feat(visual): Composition 构图注册表与白名单校验（V2 Phase 1 Task 1）"
```

---

### Task 2: StylePreset 参数包化 + visual-templates.js 重构（TDD，零回归锚点）

**Files:**
- Modify: `frontend/src/utils/style-presets.js`（三项加 styleParams）
- Modify: `frontend/src/utils/visual-templates.js`（整体重构：布局函数 → composition 分派 + sp 参数化）
- Test: `frontend/tests/visual-templates.test.mjs`（重写：双维断言 + 零回归锚点 + 30 组合矩阵；删除"三风格互不相同"旧断言）

**Interfaces:**
- Consumes: Task 1 `normalizeComposition(raw, visualType)`、`DEFAULT_COMPOSITION`
- Produces:
  - `getStyleParams(presetId): { radiusScale, borderWidth, decorations, fontWeight, uppercase }`（非法回退 journal 参数包）
  - `renderCoverPoster(data, themeId, { composition, stylePreset, overrides })`、`renderSectionCard(...)` 同构
  - `COVER_LAYOUTS` / `SECTION_LAYOUTS`（构图 id → 布局函数映射，测试遍历用）
  - **零回归**：`renderCoverPoster(data, 'greenPink', {})`（缺省 = cover-hero + journal）输出与 V1 coverJournal 逐字节一致

- [ ] **Step 1: 重写测试文件 frontend/tests/visual-templates.test.mjs**

保留文件头注释说明 V2 语义。完整新内容：

```js
// 视觉模板渲染测试（V2 Phase 1）：构图×风格双维解耦 + 零回归锚点 + 全矩阵安全
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_SIZE, SECTION_CARD_SIZE,
  renderCoverPoster, renderSectionCard,
  getStyleParams, COVER_LAYOUTS, SECTION_LAYOUTS,
} from '../src/utils/visual-templates.js';
import { COVER_COMPOSITIONS, SECTION_COMPOSITIONS } from '../src/utils/compositions.js';

const coverData = {
  org: '深圳信息职业技术大学', title: '山海电白青春突击队', subtitle: '文旅调研实践纪实',
  tags: ['社会实践', '文旅调研'], place: '深圳龙岗 · 茂名电白', date: '2026年8月',
  imageUrl: 'https://example.com/photo.jpg',
};
const cardData = { partNum: 1, title: '旧址参观学党史', subtitle: '追溯红色足迹', imageUrl: 'https://example.com/p.jpg' };

// CSS 禁用清单扫描（沿用 V1 红线）
const BANNED = [/filter\s*:/, /backdrop-filter\s*:/, /linear-gradient\s*\(/, /radial-gradient\s*\(/, /animation\s*:/, /box-shadow\s*:/, /position\s*:\s*absolute/, /transform\s*:/];

const PRESETS = ['journal', 'bold', 'soft'];

test('固定尺寸契约不变：Cover 900×383 / Section 900×1200', () => {
  assert.deepEqual(COVER_SIZE, { width: 900, height: 383 });
  assert.deepEqual(SECTION_CARD_SIZE, { width: 900, height: 1200 });
});

// ===== 零回归锚点（V2 重构红线）=====
test('零回归锚点：缺省参数输出 = V1 journal 白卡横幅特征（逐特征对拍）', () => {
  const html = renderCoverPoster(coverData, 'greenPink', {});
  // V1 coverJournal 的全部结构特征（固化自 V1 测试与实现）
  assert.ok(html.includes('width: 900px') && html.includes('height: 383px'), '外壳尺寸');
  assert.ok(html.includes('background:#F7F5F0'), 'pageBg 页底');
  assert.ok(html.includes('border:1px solid #3E3E3E'), '白卡 ink 细描边');
  assert.ok(html.includes('border-radius:10px'), 'radius=10 圆角');
  assert.ok(html.includes('font-size:32px'), '主标题 32px');
  assert.ok(html.includes('height:158px'), '图片区 158px');
  assert.ok(html.includes('crossorigin="anonymous"'), 'CORS 属性');
  assert.ok(html.includes('深圳信息职业技术大学') && html.includes('山海电白青春突击队'), '中文文字');
});

// ===== 双维解耦断言（V2 核心）=====
test('同构图换风格 → 视觉语言变（cover-hero 下 journal/bold/soft 互不相同）', () => {
  const j = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'journal' });
  const b = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'bold' });
  const s = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'soft' });
  assert.notEqual(j, b);
  assert.notEqual(b, s);
  assert.notEqual(j, s);
  // bold 参数生效特征：无圆角直角 + 反白标题
  assert.ok(b.includes('border-radius:0px'), 'bold radiusScale=0');
  assert.ok(b.includes('color:#ffffff'), 'bold 反白');
  // soft 参数生效特征：大圆角
  assert.ok(s.includes('border-radius:20px'), 'soft radiusScale=2');
});

test('同风格换构图 → 布局变（journal 下 5 种 Cover 互不相同）', () => {
  const outs = COVER_COMPOSITIONS.map((c) => renderCoverPoster(coverData, 'greenPink', { composition: c, stylePreset: 'journal' }));
  for (let i = 0; i < outs.length; i++) {
    for (let k = i + 1; k < outs.length; k++) {
      assert.notEqual(outs[i], outs[k], `${COVER_COMPOSITIONS[i]} 与 ${COVER_COMPOSITIONS[k]} 输出相同`);
    }
  }
});

test('同风格换构图 → 布局变（journal 下 5 种 Section 互不相同）', () => {
  const outs = SECTION_COMPOSITIONS.map((c) => renderSectionCard(cardData, 'greenPink', { composition: c, stylePreset: 'journal' }));
  for (let i = 0; i < outs.length; i++) {
    for (let k = i + 1; k < outs.length; k++) {
      assert.notEqual(outs[i], outs[k], `${SECTION_COMPOSITIONS[i]} 与 ${SECTION_COMPOSITIONS[k]} 输出相同`);
    }
  }
});

test('构图差异硬指标：布局骨架确实不同（图片区/文字区结构差异抽检）', () => {
  // cover-circle 必含圆形照片容器（border-radius:50% + overflow:hidden）
  const circle = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-circle', stylePreset: 'journal' });
  assert.ok(circle.includes('border-radius:50%') && circle.includes('overflow:hidden'), '圆形照片容器');
  // cover-photo 必含大图主体（图高 >200px）
  const photo = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-photo', stylePreset: 'journal' });
  assert.ok(/height:[2-9]\d\dpx/.test(photo), '满版大图高图区');
  // cover-minimal 无 img 节点（纯文字构图，imageUrl 被忽略）
  const minimal = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-minimal', stylePreset: 'journal' });
  assert.ok(!minimal.includes('<img'), '极简构图无图');
  // section-split 分栏特征（两个并列 flex 子块）
  const split = renderSectionCard(cardData, 'greenPink', { composition: 'section-split', stylePreset: 'journal' });
  assert.ok(split.includes('flex-direction:row'), '分栏 row 方向');
  // section-photo-stack 多图叠放（两处 img 或占位）
  const stack = renderSectionCard({ ...cardData, imageUrl: 'https://example.com/p.jpg', image2Url: 'https://example.com/p2.jpg' }, 'greenPink', { composition: 'section-photo-stack', stylePreset: 'journal' });
  assert.ok((stack.match(/<img/g) || []).length >= 2, '叠放至少两图');
});

// ===== 全矩阵安全 =====
test('全矩阵：10 构图 × 3 风格 = 30 组合渲染安全 + 尺寸 + CSS 白名单', () => {
  let count = 0;
  for (const c of COVER_COMPOSITIONS) {
    for (const p of PRESETS) {
      const html = renderCoverPoster(coverData, 'greenPink', { composition: c, stylePreset: p });
      assert.ok(html.includes('width: 900px') && html.includes('height: 383px'), `${c}×${p} 尺寸`);
      for (const re of BANNED) assert.ok(!re.test(html), `${c}×${p} 禁用 CSS：${re}`);
      count++;
    }
  }
  for (const c of SECTION_COMPOSITIONS) {
    for (const p of PRESETS) {
      const html = renderSectionCard(cardData, 'greenPink', { composition: c, stylePreset: p });
      assert.ok(html.includes('width: 900px') && html.includes('height: 1200px'), `${c}×${p} 尺寸`);
      for (const re of BANNED) assert.ok(!re.test(html), `${c}×${p} 禁用 CSS：${re}`);
      count++;
    }
  }
  assert.equal(count, 30);
});

// ===== 容错（沿用 V1 契约）=====
test('空字段容错：缺 org/tags/imageUrl 不抛异常不泄漏 undefined', () => {
  const html = renderCoverPoster({ title: '仅标题' }, 'greenPink', { composition: 'cover-circle', stylePreset: 'journal' });
  assert.ok(html.includes('仅标题'));
  assert.ok(!html.includes('undefined') && !html.includes('[object Object]'));
});

test('超长标题截断（省略标记）', () => {
  const html = renderCoverPoster({ ...coverData, title: '超'.repeat(60) }, 'greenPink', { composition: 'cover-editorial', stylePreset: 'journal' });
  assert.ok(html.includes('…'));
});

test('非法构图/风格回退默认（渲染入口容错）', () => {
  const ok = renderCoverPoster(coverData, 'greenPink', {});
  const bad = renderCoverPoster(coverData, 'greenPink', { composition: '不存在', stylePreset: '不存在' });
  assert.equal(ok, bad, '非法值回退 cover-hero + journal = 缺省输出');
});

test('getStyleParams：参数包契约与非法回退', () => {
  const j = getStyleParams('journal');
  assert.equal(j.radiusScale, 1);
  assert.equal(j.decorations, true);
  const b = getStyleParams('bold');
  assert.equal(b.radiusScale, 0);
  assert.equal(b.fontWeight, 'bold');
  const bad = getStyleParams('不存在');
  assert.deepEqual(bad, j, '非法风格回退 journal 参数包');
});

test('布局注册表：10 构图各有布局函数（typeof function）', () => {
  for (const k of COVER_COMPOSITIONS) assert.equal(typeof COVER_LAYOUTS[k], 'function', `${k} 缺布局函数`);
  for (const k of SECTION_COMPOSITIONS) assert.equal(typeof SECTION_LAYOUTS[k], 'function', `${k} 缺布局函数`);
});

test('主题色注入：greenPink accentA 出现在输出中', () => {
  const html = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'journal' });
  assert.ok(html.includes('#FD98C9'), 'accentA #FD98C9');
});
```

- [ ] **Step 2: style-presets.js 三项加 styleParams（journal 示例，bold/soft 同构）**

```js
  journal: {
    id: 'journal', name: '手账杂志',
    description: '轻文艺、留白、细线、轻装饰',
    // 视觉语言参数包（V2 Phase 1）：布局函数只消费此包，不含任何布局信息
    styleParams: { radiusScale: 1, borderWidth: 1.5, decorations: true, fontWeight: 'normal', uppercase: false },
  },
```

bold：`{ radiusScale: 0, borderWidth: 0, decorations: false, fontWeight: 'bold', uppercase: true }`
soft：`{ radiusScale: 2, borderWidth: 1, decorations: true, fontWeight: 'normal', uppercase: false }`

- [ ] **Step 3: visual-templates.js 重构**

结构要求（完整代码由执行者写出）：

```js
// 渲染入口（V2）：composition 分派布局，stylePreset 只注入视觉语言参数包
import { normalizeComposition } from './compositions.js';

// 参数包获取：非法风格回退 journal 参数包
export function getStyleParams(presetId) {
  const p = STYLE_PRESETS[normalizeStylePreset(presetId)];
  return { ...p.styleParams };
}

// renderCoverPoster：
//   comp = normalizeComposition(opts.composition, 'cover')
//   sp = getStyleParams(opts.stylePreset)
//   return COVER_LAYOUTS[comp](theme, d, sp)
// renderSectionCard 同构（SECTION_LAYOUTS + 'section'）
export const COVER_LAYOUTS = { 'cover-hero': coverHero, ... };
export const SECTION_LAYOUTS = { ... };
```

布局函数实现要求（10 个，签名统一 `(theme, d, sp)`，函数体内**禁止出现 preset/journal/bold/soft 字样分支**）：

- **cover-hero**：= V1 coverJournal 逐字节迁移，但写死值改为 sp 参数化：`border-radius:${theme.radius * sp.radiusScale}px`、`border:${sp.borderWidth}px solid`、`font-weight:${sp.fontWeight === 'bold' ? 'bold' : 'bold'}`（标题本就 bold——sp.fontWeight 用于副标题/org 行：`font-weight:${sp.fontWeight};`）、org 装饰方块与 tags 圆角 999 由 `sp.decorations ? ... : ''` 控制、`text-transform:${sp.uppercase ? 'uppercase' : 'none'}`
  - **零回归自检**：sp=journal 参数代入后必须与 V1 coverJournal 输出逐字节一致（执行者用 node -e 对拍 V1 输出串后再提交）
- **cover-circle**：右侧 40% 宽圆照片（`width:320px;height:320px;border-radius:50%;overflow:hidden` 包 imgNode 缩放版）+ 左侧文字列（org/title/subtitle/tags/place·date）+ sp.decorations 控制装饰圆点行
- **cover-editorial**：大留白（padding 40+）+ 图片 `margin:-30px 0 0 60px` 错位 + 顶部小编号 `No.${pad2(1)}` + `border-top:2px solid` 分割线 + 大标题
- **cover-photo**：图高 260px 主体在上 + 底部 123px 信息条（title/subtitle/tags/place·date）
- **cover-minimal**：无图。纯文字：上细线 + org 小字 + 大标题 40px + subtitle + 下细线 + place·date（sp.borderWidth 控制线粗，decorations 控制线是否存在）
- **section-editorial**：= V1 sectionJournal 迁移参数化（同 cover-hero 方法：PART 胶囊/72px 序号/accentA 分割线/34px 标题/640px 图）
- **section-photo-stack**：两图叠放——图 A（640px 高）+ 图 B（`margin:-200px 40px 0 auto;width:70%` 右下错位）+ 上方 PART 序号标题区；image2Url 字段（无则复用 imageUrl 同图两次）
- **section-split**：`display:flex;flex-direction:row`——左 45% 文字列（PART/序号/title/subtitle）+ 右 55% 图（imgNode 高 1200）
- **section-minimal**：无图。竖排层级：PART 小字 → 120px 大序号 → 细线 → title 44px → subtitle → 底部 creamText 页脚行
- **section-full-photo**：imgNode 高 1200 全幅 + 底部浮层信息条（`margin-top:-120px` 文档流上移 + cardBg 背景 90% 高度 120px 条：title/subtitle/part）

公共工具（esc/clampText/imgNode/pad2/tagPills/joinPlaceDate）原样保留；imgNode 允许加 `style` 扩展参数（如 `extraStyle`）供圆形容器内部使用。

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（新 visual-templates 12 测试 + compositions 5 + 其余既有全绿；旧"三风格互不相同"断言已随重写移除）
若零回归锚点测试失败：用 `node -e "import('./frontend/src/utils/visual-templates.js').then(m => console.log(m.renderCoverPoster({...样例}, 'greenPink', {})))"` 对比 V1 串找差异（通常是 sp 参数代入后 border/border-radius 拼写差异）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/style-presets.js frontend/src/utils/visual-templates.js frontend/tests/visual-templates.test.mjs
git commit -m "feat(visual): 构图分派重构 + StylePreset 参数包化 + 双维解耦测试（V2 Phase 1 Task 2）"
```

---

### Task 3: VisualEditor.vue 字段编辑 + VisualPanel/Preview 接线

**Files:**
- Create: `frontend/src/components/visual/VisualEditor.vue`
- Modify: `frontend/src/components/visual/VisualPanel.vue`（+composition 状态/选择器/VisualEditor 标签）
- Modify: `frontend/src/components/visual/VisualCardPreview.vue`（props 加 composition 透传）

**Interfaces:**
- Consumes: `COMPOSITIONS/COVER_COMPOSITIONS/SECTION_COMPOSITIONS`（Task 1）
- Produces:
  - VisualEditor props：`{ coverData: Object, cardData: Object, activeType: String }`（v-model 直改 reactive 键，沿用现有状态管理）
  - VisualPanel 新状态：`composition = reactive({ cover: 'cover-hero', section: 'section-editorial' })`；透传给两处 VisualCardPreview
  - VisualCardPreview props 加 `composition: String`，传入渲染 opts

- [ ] **Step 1: 创建 VisualEditor.vue**

```vue
<script setup>
// 视觉卡字段编辑器（V2 Phase 1）：标题/副标题/组织/地点/日期/Part 直接 v-model 到父级 reactive 卡数据
// 数据流不新增：VisualPanel 的 coverData/cardData 仍是唯一数据源，本组件只提供编辑 UI
const props = defineProps({
  coverData: { type: Object, required: true },
  cardData: { type: Object, required: true },
  activeType: { type: String, default: 'cover' }, // cover | section：切换显示哪组字段
});
</script>
<template>
  <div class="v-editor">
    <!-- 封面字段组 -->
    <template v-if="activeType === 'cover'">
      <label>标题<input v-model="coverData.title" maxlength="30" /></label>
      <label>副标题<input v-model="coverData.subtitle" maxlength="24" /></label>
      <label>学校/组织<input v-model="coverData.org" maxlength="24" /></label>
      <label>地点<input v-model="coverData.place" maxlength="20" /></label>
      <label>日期<input v-model="coverData.date" maxlength="20" /></label>
    </template>
    <!-- 章节卡字段组 -->
    <template v-else>
      <label>Part 编号<input v-model.number="cardData.partNum" type="number" min="1" max="99" /></label>
      <label>章节标题<input v-model="cardData.title" maxlength="20" /></label>
      <label>副标题<input v-model="cardData.subtitle" maxlength="18" /></label>
    </template>
  </div>
</template>
<style scoped>
.v-editor { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.v-editor label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #666; }
.v-editor input { padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; }
</style>
```

- [ ] **Step 2: VisualCardPreview.vue 透传 composition（两处）**

props 加 `composition: { type: String, default: '' }`；html computed 两处渲染调用 opts 加 `composition: props.composition`（渲染函数缺省回退各类型默认，空串安全）。

- [ ] **Step 3: VisualPanel.vue 接线（四处，串行）**

（1）import 区加：

```js
import VisualEditor from './VisualEditor.vue'; // 字段编辑（V2 Phase 1）
import { COMPOSITIONS, COVER_COMPOSITIONS, SECTION_COMPOSITIONS } from '../../utils/compositions.js';
```

（2）状态（cardSlot 声明后）：

```js
// 构图状态（V2 Phase 1）：按类型分别记忆，会话态（入库持久化留 Phase 2）
const composition = reactive({ cover: 'cover-hero', section: 'section-editorial' });
// 当前编辑的视觉类型：两卡并存展示，编辑器/构图选择器跟随焦点卡
const activeType = ref('cover');
```

（3）构图选择器计算属性：

```js
// 构图选项：按当前焦点卡类型过滤
const compositionOptions = computed(() => (activeType.value === 'cover' ? COVER_COMPOSITIONS : SECTION_COMPOSITIONS));
```

（import computed——文件现未引入则补。）

（4）模板两处：
- 封面 preview-col 的 card-label 行后加（并给该 preview-col 加 `@click="activeType = 'cover'"`）：

```vue
      <select v-if="activeType === 'cover'" class="comp-select" v-model="composition.cover">
        <option v-for="c in compositionOptions" :key="c" :value="c">{{ COMPOSITIONS[c].label }}</option>
      </select>
```

- 章节卡 preview-col 同理（`@click="activeType = 'section'"`，v-model="composition.section"，v-if 条件 section）。
- 两个 VisualCardPreview 标签各加 `:composition="composition.cover"` / `:composition="composition.section"`。
- VisualTemplateSelector 之后加：

```vue
    <!-- 字段编辑（V2 Phase 1）：焦点卡的字段直接改，预览实时刷新 -->
    <VisualEditor :cover-data="coverData" :card-data="cardData" :active-type="activeType" />
```

- style 区加 `.comp-select { padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; align-self: flex-start; }`

- [ ] **Step 4: 验证**

1. frontend/ `npm test`：全绿（components 无单测，纯函数不受影响）
2. frontend/ `npm run build`：成功
3. 行数复核：VisualPanel ≤200；VisualEditor ≤60

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/visual/VisualEditor.vue frontend/src/components/visual/VisualPanel.vue frontend/src/components/visual/VisualCardPreview.vue
git commit -m "feat(visual): VisualEditor 字段编辑 + 构图选择器接线（V2 Phase 1 Task 3）"
```

---

### Task 4: 真机验收（指令 10 条）+ 收尾汇报

**Files:** 无新代码

- [ ] **Step 1: 联调环境**：根目录后台 `node dev-server.mjs` + frontend/ 后台 `npm run dev`

- [ ] **Step 2: Playwright 验收（映射指令 10 条）**

1. 视觉步：两张预览卡并存（Cover/Section 可分别聚焦编辑）
2. 构图选择器切换 5 种 Cover 构图：预览布局**明显变化**（脚本断言：5 次切换 innerHTML 互不相同 + circle 含 border-radius:50%、minimal 无 img、photo 含高图区）
3. 5 种 Section 构图同上（split 含 row、photo-stack 双 img）
4. 风格选择器切换 journal/bold/soft（固定构图）：预览变（颜色/圆角特征断言）
5. VisualEditor 改标题 → 预览即时含新文字；改 Part 编号 → 章节卡序号变
6. 图片为真实图片（有图任务）或纯色占位（无图）——布局均不塌
7. 生成并设为封面链路回归（构图切换后生成仍成功落库）
8. 控制台零错误
9. 全程截图 5+ 张（构图对比证据）
10. npm test 全绿 + npm run build 成功（收尾汇报附）

- [ ] **Step 3: 清理临时产物、汇报（修改文件/新增构图/解耦说明/拆分说明/测试结果/兼容性），停止等验收**

---

## Self-Review 记录

- **Spec 覆盖**：规格 §2 注册表 → Task 1；§3 参数包 → Task 2；§4 渲染重构+零回归锚点 → Task 2；§5 VisualEditor → Task 3；§6 透传 → Task 3；§7 双维断言/30 矩阵 → Task 2 测试；§8 真机 10 条 → Task 4。§9 不做清单未越界（无 AI/Storage/导出改动/wechat-format 改动）。
- **占位符扫描**：Task 2 布局函数为"结构要求+参数化规则"形态（10 个布局函数的完整 HTML 由执行者按统一签名实现，每个构图的信息层级与差异硬指标已逐条给出），非 TBD；测试代码全部完整。
- **类型一致性**：`normalizeComposition(raw, visualType)` Task 1 产出 = Task 2 渲染入口消费；`getStyleParams(presetId)` = Task 2 入口消费；`COVER_LAYOUTS[comp](theme, d, sp)` 布局签名三参统一；VisualCardPreview `composition` prop = VisualPanel `composition.cover/section` 透传；VisualEditor `activeType` = VisualPanel 焦点卡状态。
- **用户拍板约束核对**：10 条要求逐条落位（1 注册表→T1；2/3 独立布局函数→T1/T2；4 渲染入口→T2；5/6/7 参数包→T2；8/9 双维断言→T2 测试；10 wechat-format 零改动→未触碰）；VisualEditor 拆分保持现有数据流（reactive 直改，无新状态管理）。
