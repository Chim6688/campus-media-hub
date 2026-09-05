# 模板画廊 + 链接转参考文献 · 实施计划（批1+批3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付模板生产线两块拼图——①模板画廊（弹窗浏览全部皮肤的实际渲染效果、一键应用）；②链接转参考文献（正文 Markdown 链接转上标序号 + 文末参考链接区，解决微信正文外链不可点问题）。

**Architecture:** 画廊 = 纯函数 `gallery.js`（复用现有 `markdownToWechatHTML` 渲染示例文章）+ 新组件 `ThemeGallery.vue`（弹窗网格）+ TaskDetail 接入三行；参考文献 = `wechat-format.js` 引擎内改造（新 `extractLinks` 函数 + `inline()` 加一条渲染规则 + 主循环末尾追加 `refCard`），预览与复制自动同步（共用 `wechatHTML` 单一来源）。

**Tech Stack:** Vue 3 / Vite 6 / marked 18 / node --test（无新依赖）

## Global Constraints（红线，每个任务隐含遵守）

1. 「复制到公众号」机制只许增强不许推翻：全内联样式 + `ClipboardItem({text/html, text/plain})` 不动
2. 预览与复制使用同一份渲染 HTML（`wechatHTML` computed 单一来源）——参考文献功能必须走引擎，禁止在预览组件里做二次加工
3. 不引入新依赖（组件/测试全用现有栈）；新组件样式不依赖 flex 伪元素等微信不兼容特性（画廊弹窗是站内 UI 不进微信，无此限制；但引擎产出仍全内联）
4. 现有 6 项 wechat-format 特征测试必须保持全绿（参考文献是增量规则，无链接的文章输出逐字节不变）
5. 注释规范：改动涉及代码若无注释，须为主要片段补简明中文注释
6. 每任务 TDD（纯函数先写失败测试）；组件无测试框架，走手测清单
7. 部署后用户线上验收通过才算交付完成

## 现状关键事实（执行者必读，已核对）

- `frontend/src/utils/themes.js`：`THEMES` 共 6 套皮肤（greenPink/greenYellow/fresh/retro/guochao/minimal），每套含 `id`/`label`；`resolveTheme(themeId, overrides)` 合并令牌
- `frontend/src/utils/wechat-format.js`（218 行）：
  - `inline(s, theme)`（L18-30）是所有行内渲染唯一入口：转义 → 加粗 → 行内配图占位 → 换行转 `<br>`
  - 主入口 `markdownToWechatHTML(markdown, themeId, opts)`（L130）逐 token 分发到 8 个组件函数，末尾外层包裹底色 section（L212）
  - 目前 **完全没有链接处理**：`[文字](url)` 会原样留在输出里（文字带方括号）
- `frontend/src/components/TaskDetail.vue`：
  - L5 `import { THEMES } from '../utils/themes.js';`（已导入，画廊可直接用）
  - L499-530 主题区：`themeId` ref、`themeOverrides`、切换预设自动清空覆盖的 watch（L516-519）、`themeSnapshot` watch 触发防抖自动保存（L522-523）——**画廊只需给 themeId 赋值，清覆盖+持久化全自动**
  - L699-708 预览头部：`<select v-model="themeId">` 皮肤下拉 + `param-toggle` 调参按钮 + `copy-wechat` 复制按钮
  - L835 起已有弹窗先例（rejectModal），`modal-mask` 样式类已存在（L909）
- `frontend/tests/wechat-format.test.mjs`：6 项特征测试（默认样式/色值/组件结构/overrides/新皮肤/回退）
- `frontend/package.json`：`"test": "node --test \"tests/*.test.mjs\""`，测试目录自动收录新文件
- PowerShell 环境不支持 `&&` 与 heredoc，命令链用 `;`，commit message 用多个 `-m`

---

# 批1：模板画廊

## Task 1: gallery.js 纯函数（TDD）

**Files:**
- Create: `frontend/src/utils/gallery.js`
- Create: `frontend/tests/gallery.test.mjs`

**Interfaces:**
- Consumes: `THEMES`（themes.js）、`markdownToWechatHTML(markdown, themeId, opts)`（wechat-format.js）
- Produces: `GALLERY_SAMPLE`（string，示例文章 Markdown）；`buildGallery()` → `[{id, label, html}]`，Task 2 的 ThemeGallery.vue 依赖此签名

- [ ] **Step 1: 写失败测试**

创建 `frontend/tests/gallery.test.mjs`：

```js
// 模板画廊纯函数测试：每套皮肤都能渲染示例文章，且色值生效
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../src/utils/themes.js';
import { buildGallery, GALLERY_SAMPLE } from '../src/utils/gallery.js';

test('画廊卡片数 = 皮肤数，id/label 与 THEMES 一致', () => {
  const cards = buildGallery();
  assert.equal(cards.length, Object.keys(THEMES).length);
  for (const c of cards) {
    assert.ok(THEMES[c.id], `未知皮肤 id：${c.id}`);
    assert.equal(c.label, THEMES[c.id].label);
  }
});

test('每张卡片渲染了示例文章且该皮肤强调色生效', () => {
  const cards = buildGallery();
  for (const c of cards) {
    assert.ok(c.html.length > 500, `${c.id} 渲染内容过短`);
    assert.ok(c.html.includes(THEMES[c.id].accentA), `${c.id} 强调色A未出现`);
    assert.ok(c.html.includes('示例文章标题'), `${c.id} 标题卡未渲染`);
  }
});

test('示例文章覆盖全部组件类型（标题/引言/核心信息/正文/配图/金句/落款）', () => {
  assert.ok(GALLERY_SAMPLE.includes('# '));          // H1 标题卡
  assert.ok(GALLERY_SAMPLE.includes('> '));          // 引言卡
  assert.ok(GALLERY_SAMPLE.includes('## 核心信息')); // 信息胶囊+信息卡
  assert.ok(GALLERY_SAMPLE.includes('[配图：'));     // 配图占位
  assert.ok(GALLERY_SAMPLE.includes('### '));        // 子标题
  assert.ok(GALLERY_SAMPLE.includes('责编 |'));      // 落款卡
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend; node --test tests/gallery.test.mjs
```
Expected: FAIL（Cannot find module '../src/utils/gallery.js'）

- [ ] **Step 3: 实现 gallery.js**

创建 `frontend/src/utils/gallery.js`：

```js
// 模板画廊纯函数：全部皮肤渲染同一篇示例文章（供画廊弹窗网格展示，一眼看全效果）
import { THEMES } from './themes.js';
import { markdownToWechatHTML } from './wechat-format.js';

// 示例文章：刻意覆盖全部组件类型（标题卡/引言卡/信息胶囊/正文卡/配图占位/子标题/金句/落款）
export const GALLERY_SAMPLE = `# 社团直击｜示例文章标题
> 示例开头引言：一句话概括活动亮点与氛围。
## 核心信息
- 时间：9月10日 19:00
- 地点：大学生活动中心
## 活动介绍
正文示例段落，用于展示当前皮肤下卡片的底色、描边、圆角与字号实际效果。
[配图：开场全景]
### 精彩瞬间
> 中段金句示例：青春在这里发光。
责编 | 示例署名`;

// 生成画廊卡片：每套皮肤一条 {id, label, html}，html 为完整渲染结果
export function buildGallery() {
  return Object.values(THEMES).map((t) => ({
    id: t.id,
    label: t.label,
    html: markdownToWechatHTML(GALLERY_SAMPLE, t.id, {}),
  }));
}
```

- [ ] **Step 4: 运行测试通过**

```bash
cd frontend; node --test tests/gallery.test.mjs
```
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/gallery.js frontend/tests/gallery.test.mjs
git commit -m "feat(画廊): gallery.js 纯函数——全部皮肤渲染示例文章（TDD 3单测）"
```

---

## Task 2: ThemeGallery.vue 组件 + TaskDetail 接入

**Files:**
- Create: `frontend/src/components/ThemeGallery.vue`
- Modify: `frontend/src/components/TaskDetail.vue`（导入、状态、按钮、弹窗挂载）

**Interfaces:**
- Consumes: `buildGallery()`（Task 1）；TaskDetail 的 `themeId` ref 及其既有 watch（切预设清覆盖 + 自动保存）
- Produces: 无（叶子组件）。props `{ current: String }`，emits `['select', 'close']`

- [ ] **Step 1: 创建 ThemeGallery.vue**

```vue
<script setup>
// 模板画廊弹窗：网格展示每套皮肤的实际渲染效果，点卡片即应用
import { computed } from 'vue';
import { buildGallery } from '../utils/gallery.js';

const props = defineProps({ current: String });
const emit = defineEmits(['select', 'close']);
// 卡片静态生成一次（皮肤库是编译期常量，无需响应式重算）
const cards = computed(() => buildGallery());
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="gallery-modal">
      <p class="gallery-title">🖼 模板画廊 · 点击卡片应用皮肤</p>
      <div class="gallery-grid">
        <div v-for="c in cards" :key="c.id" class="gallery-card"
          :class="{ on: c.id === current }" @click="emit('select', c.id)">
          <p class="gallery-label">{{ c.label }}<span v-if="c.id === current">（当前）</span></p>
          <!-- pointer-events:none：预览区只看不滚，点击整卡即应用，避免滚动/点击歧义 -->
          <div class="gallery-view" v-html="c.html"></div>
        </div>
      </div>
      <button class="gallery-close" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<style scoped>
/* 复用全局 modal-mask 遮罩；画廊主体为宽弹窗 */
.gallery-modal { background: #fff; border-radius: 10px; padding: 16px; width: min(92vw, 1080px); max-height: 86vh; overflow: auto; }
.gallery-title { font-size: 15px; font-weight: bold; margin: 0 0 12px; }
.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.gallery-card { border: 2px solid #eee; border-radius: 8px; cursor: pointer; overflow: hidden; transition: border-color 0.15s; }
.gallery-card:hover { border-color: #1a73e8; }
.gallery-card.on { border-color: #27ae60; }
.gallery-label { font-size: 13px; font-weight: bold; margin: 0; padding: 8px 10px 6px; background: #fafafa; border-bottom: 1px solid #eee; }
.gallery-view { height: 320px; overflow: hidden; pointer-events: none; }
.gallery-view > section { transform: scale(0.62); transform-origin: top left; width: 160%; } /* 缩放预览：近似手机屏宽观感 */
.gallery-close { margin-top: 12px; padding: 6px 20px; }
</style>
```

- [ ] **Step 2: TaskDetail.vue 接入（4 处小改）**

2a. script 导入区（L7 `computeSteps` 导入之后）加：

```js
import ThemeGallery from './ThemeGallery.vue'; // 模板画廊弹窗（批1）
```

2b. 主题区 `panelOpen` 定义（L492 附近）后加：

```js
const galleryOpen = ref(false); // 模板画廊弹窗开关（批1）
```

2c. 模板预览头部（L702 `</select>` 之后、`param-toggle` 按钮之前）加画廊按钮：

```html
          <button class="param-toggle" @click="galleryOpen = true" title="浏览全部模板效果">
            🖼 画廊
          </button>
```

2d. 模板末尾弹窗区（rejectModal 弹窗 div 之后）挂载画廊：

```html
    <!-- 模板画廊：点卡片应用皮肤；themeId 赋值后既有 watch 自动清覆盖+持久化 -->
    <ThemeGallery v-if="galleryOpen" :current="themeId"
      @select="(id) => { themeId = id; galleryOpen = false; }"
      @close="galleryOpen = false" />
```

- [ ] **Step 3: 手测清单（本地 dev server）**

```bash
cd frontend; npm run dev
```
1. 详情页预览头部出现「🖼 画廊」按钮 → 点击弹出画廊，6 张卡片网格排布
2. 每张卡片是完整缩小版推文（标题卡/正文卡/落款卡可见），当前皮肤卡片绿框+「（当前）」
3. 点「国潮·红金」卡片 → 弹窗关闭 → 右侧预览即时变为国潮配色 → 2 秒后自动保存（右下角出现"已自动保存"）
4. 刷新页面 → 皮肤保持（layout_theme 持久化链路复用）
5. 画廊选皮肤后，此前手动调过的参数面板覆盖值应被清空（切预设清覆盖的既有 watch 生效）
6. 旧功能回归：调参面板、复制到公众号、复用按钮均正常

- [ ] **Step 4: 全量测试 + Commit**

```bash
cd frontend; npm run test
```
Expected: gallery 3 项 + 既有 9 项全 PASS

```bash
git add frontend/src/components/ThemeGallery.vue frontend/src/components/TaskDetail.vue
git commit -m "feat(画廊): 画廊弹窗组件+详情页接入（缩略渲染网格一键应用，复用既有持久化链路）"
```

---

# 批3：链接转参考文献

## Task 3: 引擎链接处理（TDD，含回归）

**Files:**
- Modify: `frontend/src/utils/wechat-format.js`
- Modify: `frontend/tests/wechat-format.test.mjs`（追加测试）

**Interfaces:**
- Consumes: 无新依赖
- Produces: `extractLinks(s, refs)`（导出，纯函数：`[label](url)` → `label〔N〕` 临时标记 + url 入 refs）；`inline()` 内新增 `〔N〕` → 上标 span 渲染规则；主循环 paragraph/blockquote/list 三处调用 extractLinks；文末自动追加 `refCard`（未导出，内部组件函数）。既有 6 项特征测试的 SAMPLE 无链接 → 输出不变

- [ ] **Step 1: 追加失败测试**

在 `frontend/tests/wechat-format.test.mjs` 末尾追加：

```js
// ===== 链接转参考文献（批3） =====
import { extractLinks } from '../src/utils/wechat-format.js';

test('链接转参考文献：链接文字保留+上标序号，文末列出参考链接', () => {
  const md = '报名请填[报名表](https://example.com/form)，详情见[官网](https://example.com)。';
  const h = markdownToWechatHTML(md, 'greenPink', {});
  assert.ok(!h.includes('href'), '微信正文不输出可点 a 标签');
  assert.ok(h.includes('报名表<span'), '链接文字保留+紧跟上标');
  assert.ok(h.includes('vertical-align:super'), '上标样式为内联（微信兼容不用sup）');
  assert.ok(h.includes('[1] https://example.com/form'), '文末参考链接1');
  assert.ok(h.includes('[2] https://example.com'), '文末参考链接2');
  assert.ok(h.includes('参考链接'), '参考链接区标题');
});

test('同 URL 复用同一序号；无链接文章不出现参考区（回归保护）', () => {
  const h1 = markdownToWechatHTML('见[表单](https://a.com)或[备用表单](https://a.com)。', 'greenPink', {});
  assert.ok(h1.includes('[1] https://a.com'), '同URL只编一个号');
  assert.ok(!h1.includes('[2]'), '不产生第二个序号');
  const h2 = markdownToWechatHTML('普通正文没有链接。', 'greenPink', {});
  assert.ok(!h2.includes('参考链接'), '无链接不出参考区');
});

test('extractLinks 纯函数：非 http(s) 链接不动（防误伤相对路径）', () => {
  const refs = [];
  const out = extractLinks('看[文档](./local.md)和[官网](https://x.com)', refs);
  assert.ok(out.includes('[文档](./local.md)'), '相对路径保持原样');
  assert.equal(refs.length, 1, '只收 http(s) 链接');
  assert.ok(out.includes('官网〔1〕'), 'http链接转标记');
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend; node --test tests/wechat-format.test.mjs
```
Expected: 新 3 项 FAIL（extractLinks 未导出 / 输出无上标无参考区）；既有 6 项仍 PASS

- [ ] **Step 3: 实现引擎改造（wechat-format.js 三处）**

3a. `inline()` 内（加粗规则之后、行内配图规则之前）加上标渲染规则：

```js
  // 参考文献上标标记〔N〕 → 上标序号（批3：extractLinks 产生的临时标记在此渲染；用内联 span 不用 sup，微信编辑器兼容）
  t = t.replace(/〔(\d+)〕/g, (m, n) => `<span style="vertical-align:super;font-size:0.75em;color:${theme.accentA};">${n}</span>`);
```

3b. 组件函数区（`listRow` 之后、主入口之前）加两个函数：

```js
// 链接提取（批3）：[label](url) → label〔N〕，url 收进 refs（同 URL 复用序号）
// 只认 http(s) 绝对链接，相对路径原样保留防误伤；〔N〕由 inline() 渲染为上标
export function extractLinks(s, refs) {
  return String(s).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    let i = refs.indexOf(url);
    if (i === -1) { refs.push(url); i = refs.length - 1; }
    return `${label}〔${i + 1}〕`;
  });
}

// 参考链接落款卡（批3）：文末奶油卡列出全部链接，读者长按复制
function refCard(theme, refs) {
  const rows = refs
    .map((u, i) => `<p style="font-size:12px;color:${theme.creamText};line-height:1.8;margin:0;word-break:break-all;">[${i + 1}] ${esc(u)}</p>`)
    .join('');
  return `<section style="background:${theme.cream};border:1px solid ${theme.creamBorder};border-radius:12px;padding:14px 20px;margin:20px 8px 8px;text-align:left;"><p style="font-size:12px;color:${theme.creamText};margin:0 0 6px;">📎 参考链接（微信正文链接不可点，长按复制网址打开）</p>${rows}</section>`;
}
```

3c. 主入口改造（`markdownToWechatHTML` 内）：

```js
  // 函数开头（tokens 解析之后）加共享 refs 数组：
  const refs = []; // 批3：全文链接收集（同 URL 复用序号）

  // for 循环内三处 token 处理先过 extractLinks 再进组件：
  // ① paragraph 分支：const text = (tok.text || '').trim(); 之后加
  const text = extractLinks((tok.text || '').trim(), refs);
  // ② blockquote 分支：parts.push(introCard(theme, extractLinks(tok.text || '', refs))); / quoteCard 同理
  // ③ list 分支：parts.push(infoCard(theme, extractLinks(item.text || '', refs))); / listRow 同理

  // 循环结束后、外层包裹 return 之前加：
  // 批3：有链接时文末追加参考链接区（放在最末，落款卡之后，与 wechat-format 先例一致）
  if (refs.length) parts.push(refCard(theme, refs));
```

- [ ] **Step 4: 运行测试通过 + 回归**

```bash
cd frontend; node --test tests/wechat-format.test.mjs
```
Expected: 9 项全 PASS（新 3 + 既有 6——既有 SAMPLE 无链接，输出逐字节不变）

```bash
cd frontend; npm run test
```
Expected: 全部 PASS（gallery/steps 同步验证）

- [ ] **Step 5: 手测清单（本地 dev server）**

1. 正文写 `报名请填[报名表](https://wj.qq.com/s2/xxx)` → 预览即时显示「报名表¹」（上标取皮肤强调色A）+ 文末奶油卡「📎 参考链接」列网址
2. 同一 URL 出现两次 → 文中两个¹、文末只列一条
3. 切换皮肤 → 上标颜色与参考卡配色随皮肤变化
4. 「复制到公众号」→ 粘贴到公众号编辑器 → 上标与参考卡样式保留、无 a 标签被剥
5. 无链接的旧任务打开 → 预览与改造前完全一致

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/wechat-format.js frontend/tests/wechat-format.test.mjs
git commit -m "feat(排版): 链接转参考文献——正文外链转上标序号+文末参考链接卡（微信正文不可点的解法，抄 wechat-format 先例）"
```

---

## Task 4: 部署与线上验收

- [ ] **Step 1: 推送部署**

```bash
git push origin master
```

- [ ] **Step 2: 线上验收清单（用户在 https://timely-rugelach-be68fd.netlify.app 操作）**

1. **画廊**：任意任务 → 预览头部「🖼 画廊」→ 6 张皮肤卡完整渲染 → 点选应用 → 自动保存 → 刷新保持
2. **参考文献**：正文加一条带链接的 Markdown → 上标+文末参考卡出现 → 复制到公众号粘贴样式正常
3. **回归红线**：旧任务打开/推进/分享正常；无链接文章排版与升级前一致；口令门禁正常

---

## 验证与回归总纲

1. 单元测试：`cd frontend; npm run test`（批后应 12 项：steps 3 + wechat-format 9 + gallery 3... 实际按文件数为准）
2. 回归红线（每批必测）：复制到公众号粘贴格式正常；旧任务不受影响；预览=复制同源
3. 后端零改动（本批纯前端），无需后端测试与 SQL 迁移

## Self-Review 记录

- 规格覆盖：批1 画廊→Task 1/2；批3 参考文献→Task 3；部署验收→Task 4 ✓
- 占位符扫描：无 TBD/TODO，所有代码块完整可执行 ✓
- 类型一致性：`buildGallery()` → `[{id,label,html}]` 与 ThemeGallery.vue 消费一致；`extractLinks(s, refs)` 签名与三处调用一致；`refCard` 仅内部使用 ✓
- 风险点：①画廊缩放 `transform:scale(0.62)` 为近似手机宽观感，若卡片过小可在验收时调；②参考卡置于文末最深处（落款卡之后），与 wechat-format 先例一致，若用户希望落款最后可在验收后微调插入位置
