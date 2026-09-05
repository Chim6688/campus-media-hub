# 推文工作流站改进 · 分批实施计划（P0→P1→P2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按需求规格 `docs/改进需求规格-2026-09-03.md` 分三批交付 7 项改进：排版参数开放、整改清单打回、流程步骤条、详情页降密度、列表分组筛选、一键复用、AI 进度提示。

**Architecture:** 前端 Vue 3 SPA + Netlify Functions（同仓 `backend/functions/*.mjs`）+ Supabase Postgres。排版引擎为纯函数 Markdown→内联样式 HTML；状态门禁在后端 `tasks.mjs`；AI 走 `ai.mjs` 的 `PROMPTS[action]` 分发。本计划全部在现有架构内扩展，不引入新依赖（测试用 Node 内置 `node --test`）。

**Tech Stack:** Vue 3 / Vite 6 / marked 18 / Netlify Functions v2 / Supabase / node --test

## Global Constraints（红线，每个任务隐含遵守）

1. 「复制到公众号」机制只许增强不许推翻：全内联样式 + `ClipboardItem({text/html, text/plain})` + execCommand 降级
2. 预览与复制使用同一份渲染 HTML（`wechatHTML` computed 单一来源）
3. 口令校验（`X-Access-Code`）、分享只读机制不变
4. schema 扩展一律 `alter table ... add column if not exists`（幂等），追加到 `docs/supabase-schema.sql`，不做破坏性迁移；旧任务（无新字段值）不得被阻塞
5. 不引入重型 UI 框架，在现有 Vue3 组件体系内扩展
6. 新组件样式避免依赖 flex/伪元素/部分 position（微信兼容）；`transform:rotate` 已有先例可用
7. 敏感配置只在 `.env.local` / Netlify 环境变量，不入库不硬编码
8. 每批交付后 git push 触发 Netlify 自动部署，用户线上验收通过才进下一批
9. **注释规范（用户 2026-09-03 追加）**：改动涉及的代码若原本无注释，须为主要片段（函数级/关键逻辑块）补充简明中文注释；已有注释的保持风格延续

## 现状关键事实（执行者必读，已逐行核对）

- `frontend/src/utils/themes.js`（31 行）：`THEMES` 两套皮肤（greenPink/greenYellow），纯色值对象
- `frontend/src/utils/wechat-format.js`（218 行）：11 个组件函数，色值全部取自 `theme` 对象，但**圆角/字号/间距/描边粗细硬编码**（如 `border-radius:10px 0 10px 0`、`font-size:15px`、`margin:0 8px 36px`）
- `frontend/src/components/TaskDetail.vue`（673 行）：素材面板折叠机制已存在（`materialOpen = ref(true)` 默认展开，L44/L496）；主题选择 `themeId` 存 localStorage（L405-406）；复制函数 `copyToWechat`（L415-442）**严禁改动**
- `frontend/src/components/TaskList.vue`（91 行）：任务平铺无筛选；`advance()` 已处理门禁报错格式
- `backend/functions/tasks.mjs`（108 行）：三态 `writing→reviewing→published`；`rejectBack`（reviewing→writing）已存在；推进 reviewing 前跑 `runChecks`；`material` 字段整体 PATCH 的模式可直接复制给新字段
- `backend/functions/lib/prompts.mjs`：`PROMPTS` 字典按 action 分发，`ai.mjs` 无需改动即可支持新 action
- `backend/functions/lib/rules-engine.mjs`：门禁返回 `{errors, warnings, passed}`
- `backend/functions/package.json` 已有 `"test": "node --test tests/rules-engine.test.mjs"`，`frontend/package.json` 是 `"type": "module"`（可直接 `node --test` 跑 .mjs 测试导入 src 下的 ESM）
- `docs/supabase-schema.sql`：v2 增量段模式 = `-- ========== vN 增量迁移（幂等，可重复执行） ==========` + alter 语句

## 需要用户配合的事项（开工前确认）

- **P0 批含 2 条 SQL 迁移**，部署前需用户在 Supabase Dashboard → SQL Editor 执行（计划 Task 8 给出完整 SQL 与步骤）
- 本地自测需 `.env.local` 已有 AI Key（现有文件，不动）

---

# 第一批 P0（核心痛点：排版 + 审核打回）

## Task 1: 排版令牌化 + 预设皮肤库（P0-1 后端逻辑部分）

**Files:**
- Modify: `frontend/src/utils/themes.js`
- Modify: `frontend/src/utils/wechat-format.js`
- Create: `frontend/tests/wechat-format.test.mjs`
- Modify: `frontend/package.json`（加 test script）

**Interfaces:**
- Produces: `resolveTheme(themeId, overrides)` → 合并 `TOKEN_DEFAULTS + THEMES[themeId] + overrides` 的完整主题对象；`markdownToWechatHTML(markdown, themeId, opts)` 的 `opts` 新增 `overrides` 字段（对象）。Task 2/6 依赖此签名。

- [ ] **Step 1: 写特征化回归测试（先固化当前默认输出，防止重构漂移）**

创建 `frontend/tests/wechat-format.test.mjs`：

```js
// 特征化测试：重构前先固化 greenPink 默认渲染的关键特征，重构后必须逐条保持
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToWechatHTML } from '../src/utils/wechat-format.js';

const SAMPLE = `# 眉标｜测试标题
> 开头引言
## 核心信息
- 时间：9月10日
## 活动介绍
正文第一段内容。
[配图：开场全景]
### 子小节
更多正文内容。
> 中段金句
责编 | 张三`;

const html = markdownToWechatHTML(SAMPLE, 'greenPink', { title: '测试标题', eyebrow: '活动报道' });

test('默认皮肤关键样式特征保持不变（圆角/字号/间距/描边）', () => {
  assert.ok(html.includes('border-radius:10px 0 10px 0'), '正文卡对角圆角 10px');
  assert.ok(html.includes('font-size:15px'), '正文字号 15px');
  assert.ok(html.includes('margin:0 8px 36px'), '小节间距 36px');
  assert.ok(html.includes('border:2px solid'), '标题卡描边 2px');
  assert.ok(html.includes('border-radius:4px'), '标题卡圆角 4px');
  assert.ok(html.includes('font-size:22px'), '标题字号 22px');
});

test('默认皮肤色值来自 greenPink 主题对象', () => {
  assert.ok(html.includes('#FD98C9'), 'accentA');
  assert.ok(html.includes('#53DE7B'), 'accentB');
  assert.ok(html.includes('#F7F5F0'), '页面底色');
});

test('组件结构特征（错位层/胶囊序号/配图占位/落款卡）', () => {
  assert.ok(html.includes('position:absolute;left:-8px;top:-8px'), '标题卡错位层');
  assert.ok(html.includes('border-radius:6px 20px 20px 6px'), '半圆序号胶囊');
  assert.ok(html.includes('📷 配图：开场全景'), '配图占位');
  assert.ok(html.includes('责编 | 张三'), '落款署名保留');
});
```

- [ ] **Step 2: 运行测试确认当前全绿（这是特征基线，不是失败测试）**

```bash
cd frontend && node --test tests/wechat-format.test.mjs
```
Expected: 3 tests 全 PASS。若有 FAIL 说明现状认知有误，停止并重新核对 `wechat-format.js`。

- [ ] **Step 3: themes.js 增加令牌默认值 + resolveTheme + 4 套新预设**

在 `frontend/src/utils/themes.js` 末尾追加（保留现有 THEMES 两套不动）：

```js
// ===== P0-1 令牌系统：圆角/字号/间距/描边等可调参数（渲染函数统一取值） =====
// 所有用 px 的令牌由参数面板 clamp 后传入，防止调出破坏性布局
export const TOKEN_DEFAULTS = {
  radius: 10,        // 卡片基础圆角
  titleRadius: 4,    // 标题卡圆角（错位描边风用小圆角）
  borderWidth: 2,    // 标题卡/胶囊描边粗细
  thinBorder: 1.5,   // 引言卡/金句条细描边
  titleFontSize: 22, // 标题卡字号
  sectionFontSize: 17, // 小节标题字号
  bodyFontSize: 15,  // 正文/金句/列表字号
  bodyLineHeight: 2, // 正文行高（无单位）
  sectionGap: 36,    // 小节下间距
};

// 合并令牌：预设皮肤 → 默认令牌 → 用户覆盖（overrides 来自参数面板）
export function resolveTheme(themeId, overrides = {}) {
  const base = THEMES[themeId] || THEMES[DEFAULT_THEME];
  return { ...TOKEN_DEFAULTS, ...base, ...(overrides || {}) };
}

// ===== 新增预设皮肤（仅配色差异，令牌用默认值） =====
Object.assign(THEMES, {
  fresh: {
    id: 'fresh', label: '清新·蓝绿',
    pageBg: '#F4FAFD', accentA: '#6EC6F5', accentB: '#7BD9A5',
    ink: '#2F3A45', cardBg: '#ffffff',
    cream: '#EDF6FA', creamBorder: '#D5E8F0', creamText: '#7A99A8',
  },
  retro: {
    id: 'retro', label: '复古·棕绿',
    pageBg: '#F5EFE3', accentA: '#C89F6E', accentB: '#8A9A5B',
    ink: '#4A3F35', cardBg: '#FFFDF8',
    cream: '#EFE6D4', creamBorder: '#DBCBB0', creamText: '#9A8B72',
  },
  guochao: {
    id: 'guochao', label: '国潮·红金',
    pageBg: '#FBF3EC', accentA: '#E63946', accentB: '#E9B44C',
    ink: '#3D2B26', cardBg: '#ffffff',
    cream: '#F7E8DA', creamBorder: '#E5CDB4', creamText: '#A0876B',
  },
  minimal: {
    id: 'minimal', label: '简约·灰黑',
    pageBg: '#FAFAFA', accentA: '#4A4A4A', accentB: '#8C8C8C',
    ink: '#333333', cardBg: '#ffffff',
    cream: '#F0F0F0', creamBorder: '#DDDDDD', creamText: '#999999',
  },
});
```

- [ ] **Step 4: wechat-format.js 改为令牌驱动 + 支持 opts.overrides**

4a. 顶部 import 改为：

```js
import { THEMES, DEFAULT_THEME, resolveTheme } from './themes.js';
```

4b. 主入口 L130-131 改为：

```js
export function markdownToWechatHTML(markdown, themeId = DEFAULT_THEME, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides); // 预设 + 用户覆盖合并后的完整令牌
```

4c. 各组件函数的硬编码值逐一替换（只列改动行，其余不动）：

```js
// titleCard：
//   border:2px solid ${theme.ink}          → border:${theme.borderWidth}px solid ${theme.ink}
//   border-radius:4px（三处 section）        → border-radius:${theme.titleRadius}px
//   font-size:22px                          → font-size:${theme.titleFontSize}px
// introCard：
//   border:1.5px solid ${theme.ink}         → border:${theme.thinBorder}px solid ${theme.ink}
//   border-radius:10px                      → border-radius:${theme.radius}px
//   font-size:15px                          → font-size:${theme.bodyFontSize}px
//   line-height:2                           → line-height:${theme.bodyLineHeight}
// sectionTitle：
//   border:2px dashed ${theme.ink}          → border:${theme.borderWidth}px dashed ${theme.ink}
//   font-size:17px                          → font-size:${theme.sectionFontSize}px
// subHeading：
//   border-top:2px solid ${theme.accentB}   → border-top:${theme.borderWidth}px solid ${theme.accentB}
//   font-size:15px                          → font-size:${theme.bodyFontSize}px
// bodyCard：
//   border-radius:10px 0 10px 0             → border-radius:${theme.radius}px 0 ${theme.radius}px 0
//   padding:20px 22px;margin:0 8px 36px     → padding:20px 22px;margin:0 8px ${theme.sectionGap}px
//   font-size:15px ... line-height:2        → font-size:${theme.bodyFontSize}px ... line-height:${theme.bodyLineHeight}
// infoCard：同 bodyCard 的圆角/间距/行高替换；font-size:16px 保留（信息卡刻意大一号）
// quoteCard：
//   border:1.5px solid ${theme.accentA}     → border:${theme.thinBorder}px solid ${theme.accentA}
//   border-radius:4px                       → border-radius:${theme.titleRadius}px
//   margin:0 8px 36px                       → margin:0 8px ${theme.sectionGap}px
//   font-size:15px                          → font-size:${theme.bodyFontSize}px
// footerCard：
//   line-height:2.1                         → line-height:${theme.bodyLineHeight + 0.1}
// listRow：
//   font-size:15px                          → font-size:${theme.bodyFontSize}px
//   line-height:1.9                         → line-height:${theme.bodyLineHeight - 0.1}
```

- [ ] **Step 5: 运行回归测试确认全绿**

```bash
cd frontend && node --test tests/wechat-format.test.mjs
```
Expected: 3 tests PASS（默认值不变，特征全保持）。

- [ ] **Step 6: 追加令牌覆盖测试**

在 `frontend/tests/wechat-format.test.mjs` 末尾追加：

```js
test('overrides 令牌覆盖生效（圆角/字号/间距/描边）', () => {
  const h = markdownToWechatHTML(SAMPLE, 'greenPink', {
    title: '测试标题', eyebrow: '活动报道',
    overrides: { radius: 20, bodyFontSize: 17, sectionGap: 24, borderWidth: 3 },
  });
  assert.ok(h.includes('border-radius:20px 0 20px 0'), '圆角覆盖');
  assert.ok(h.includes('font-size:17px'), '字号覆盖');
  assert.ok(h.includes('margin:0 8px 24px'), '间距覆盖');
  assert.ok(h.includes('border:3px solid'), '描边覆盖');
});

test('新预设皮肤可渲染且色值生效', () => {
  const h = markdownToWechatHTML(SAMPLE, 'guochao', {});
  assert.ok(h.includes('#E63946'), '国潮红');
  assert.ok(h.includes('#E9B44C'), '国潮金');
});

test('未知主题回退默认不报错', () => {
  const h = markdownToWechatHTML(SAMPLE, 'not-exist', {});
  assert.ok(h.includes('#FD98C9'), '回退 greenPink');
});
```

先运行确认 `overrides` 测试 FAIL（覆盖尚未接线时 titleRadius 等仍硬编码——Step 4 完成后应直接 PASS，若 Step 4 已做则此步为验证性运行）：

```bash
cd frontend && node --test tests/wechat-format.test.mjs
```
Expected: 6 tests PASS。

- [ ] **Step 7: frontend/package.json 加 test script**

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "node --test tests/"
}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/themes.js frontend/src/utils/wechat-format.js frontend/tests/wechat-format.test.mjs frontend/package.json
git commit -m "feat(P0-1): 排版引擎令牌化+4套新预设皮肤（圆角/字号/间距/描边可调，默认输出特征不变）"
```

---

## Task 2: 排版参数面板 + 自定义组合持久化（P0-1 前端交互）

**Files:**
- Modify: `frontend/src/components/TaskDetail.vue`
- Modify: `backend/functions/tasks.mjs`（PATCH 接受 theme 字段）
- Modify: `docs/supabase-schema.sql`（幂等段，见 Task 8 统一给出）

**Interfaces:**
- Consumes: `resolveTheme` 间接经 `markdownToWechatHTML(markdown, themeId, { overrides })`；Task 1 的 THEMES 新预设
- Produces: 任务字段 `theme jsonb`，结构 `{ id: 'greenPink', overrides: { radius: 12, ... } }`；Task 6（复用）依赖此字段

- [ ] **Step 1: tasks.mjs PATCH 支持 theme 字段**

在 `tasks.mjs` L59（`material` 更新块）之后加：

```js
// 排版主题（P0-1：皮肤 id + 令牌覆盖，随任务持久化供复用）
if (body.theme && typeof body.theme === 'object' && !Array.isArray(body.theme)) {
  patch.theme = { id: String(body.theme.id || ''), overrides: body.theme.overrides || {} };
}
```

- [ ] **Step 2: TaskDetail.vue 增加参数面板状态与逻辑**

在 `<script setup>` 主题区（L404-411 附近）改造：

```js
// 模板皮肤：任务级持久化（task.theme），无则回退 localStorage
const themeId = ref(props.task.theme?.id || localStorage.getItem('themeId') || 'greenPink');
// 令牌覆盖：色板 + 圆角/字号/间距滑杆（clamp 防破坏性布局）
const themeOverrides = reactive({ ...(props.task.theme?.overrides || {}) });
const OVERRIDES_SCHEMA = [
  { key: 'accentA', label: '强调色A', type: 'color' },
  { key: 'accentB', label: '强调色B', type: 'color' },
  { key: 'radius', label: '卡片圆角', type: 'range', min: 0, max: 24, step: 1, unit: 'px' },
  { key: 'titleFontSize', label: '标题字号', type: 'range', min: 18, max: 28, step: 1, unit: 'px' },
  { key: 'bodyFontSize', label: '正文字号', type: 'range', min: 13, max: 18, step: 1, unit: 'px' },
  { key: 'sectionGap', label: '段落间距', type: 'range', min: 16, max: 60, step: 2, unit: 'px' },
];
const panelOpen = ref(false); // 参数面板默认收起

watch(themeId, (v) => localStorage.setItem('themeId', v));
// 切换预设清空覆盖（预设即完整方案）
watch(themeId, () => { for (const k of Object.keys(themeOverrides)) delete themeOverrides[k]; });

// 主题快照进自动保存：皮肤与覆盖随任务持久化
const themeSnapshot = computed(() => JSON.stringify({ id: themeId.value, overrides: themeOverrides }));
watch(themeSnapshot, () => scheduleAutoSave());
```

`save()` 的 body 中（L188-193）追加一行：

```js
      theme: { id: themeId.value, overrides: { ...themeOverrides } },
```

`wechatHTML` computed（L409-411）改为：

```js
const wechatHTML = computed(() =>
  markdownToWechatHTML(content.value, themeId.value, {
    title: title.value, eyebrow: props.task.type, overrides: { ...themeOverrides },
  }),
);
```

任务切换 watch（L154-162）中追加回填：

```js
  themeId.value = props.task.theme?.id || localStorage.getItem('themeId') || 'greenPink';
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
  Object.assign(themeOverrides, props.task.theme?.overrides || {});
```

注意：任务切换 watch 里已有 `switching` 标记，theme 回填放在 `nextTick(() => switching = false)` 之前，避免触发自动保存覆盖。

- [ ] **Step 3: 模板加参数面板 UI**

`preview-header`（L559-566）内、`select` 之后插入：

```html
          <button class="param-toggle" @click="panelOpen = !panelOpen" title="排版参数">
            {{ panelOpen ? '收起参数' : '🎨 调参数' }}
          </button>
```

`editor-right` 内 `preview-header` 之后插入：

```html
        <!-- 参数面板：色板 + 滑杆，即时反映预览（只调令牌，不碰复制链路） -->
        <div v-if="panelOpen" class="param-panel">
          <div v-for="f in OVERRIDES_SCHEMA" :key="f.key" class="param-row">
            <label class="param-label">{{ f.label }}</label>
            <input v-if="f.type === 'color'" type="color" v-model="themeOverrides[f.key]" />
            <template v-else>
              <input type="range" :min="f.min" :max="f.max" :step="f.step" v-model.number="themeOverrides[f.key]" />
              <span class="param-val">{{ themeOverrides[f.key] ?? '默认' }}{{ f.unit }}</span>
            </template>
          </div>
          <button class="param-reset" @click="() => { for (const k of Object.keys(themeOverrides)) delete themeOverrides[k]; }">
            恢复默认
          </button>
        </div>
```

样式（scoped style 末尾追加）：

```css
.param-toggle { padding: 4px 10px; font-size: 12px; }
.param-panel { border: 1px dashed #d8cfc0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
.param-row { display: flex; align-items: center; gap: 8px; }
.param-label { font-size: 12px; color: #666; width: 64px; margin: 0; }
.param-row input[type='range'] { flex: 1; }
.param-row input[type='color'] { width: 40px; height: 26px; padding: 0; border: 1px solid #ddd; border-radius: 4px; }
.param-val { font-size: 12px; color: #999; width: 48px; text-align: right; }
.param-reset { grid-column: 1 / -1; font-size: 12px; color: #999; }
```

- [ ] **Step 4: 功能自测（本地 dev server）**

```bash
cd frontend && npm run dev
```
自测清单（浏览器手动）：
1. 皮肤下拉出现 6 个选项（两旧 + 4 新），greenPink/greenYellow 渲染与改前一致
2. 调强调色A → 预览标题卡错位层颜色即时变化
3. 拖圆角滑杆 → 正文卡圆角即时变化；调到 0 变直角
4. 刷新页面 → 皮肤与覆盖保持（task.theme 持久化生效，Network 面板确认 PATCH body 含 theme）
5. 「复制到公众号」仍可用，粘贴到文本编辑器确认 HTML 带内联样式

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TaskDetail.vue backend/functions/tasks.mjs
git commit -m "feat(P0-1): 排版参数面板（色板+滑杆 clamp）+主题随任务持久化"
```

---

## Task 3: 整改清单式打回（P0-2）

**Files:**
- Create: `backend/functions/lib/checklist.mjs`
- Create: `backend/functions/tests/checklist.test.mjs`
- Modify: `backend/functions/tasks.mjs`
- Modify: `backend/functions/lib/prompts.mjs`
- Modify: `frontend/src/components/TaskDetail.vue`
- Modify: `frontend/src/components/ShareView.vue`
- Modify: `docs/supabase-schema.sql`（幂等段，见 Task 8）

**Interfaces:**
- Produces: `lib/checklist.mjs` 导出 `remainingCount(list)`、`normalizeLines(text)`；任务字段 `review_checklist jsonb`，结构 `[{id, text, done, at}]`；AI action `organize_review_notes`（payload `{text}` → 返回 JSON 数组字符串）
- Consumes: `callAI`（TaskDetail 已有）、`PROMPTS` 分发（ai.mjs 零改动）

- [ ] **Step 1: 写失败测试（纯函数）**

创建 `backend/functions/tests/checklist.test.mjs`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingCount, normalizeLines } from '../lib/checklist.mjs';

test('remainingCount：未完成计数、空/旧任务兼容', () => {
  assert.equal(remainingCount(null), 0);
  assert.equal(remainingCount([]), 0);
  assert.equal(remainingCount([{ done: true }, { done: false }, { done: false }]), 2);
  // 旧结构容错：无 done 字段视为未完成
  assert.equal(remainingCount([{ text: 'x' }]), 1);
});

test('normalizeLines：多行文本 → 去空行去编号的条目数组', () => {
  assert.deepEqual(normalizeLines('第一点\n\n2. 第二点\n、第三点'), ['第一点', '第二点', '第三点']);
  assert.deepEqual(normalizeLines('   \n\n'), []);
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd backend/functions && node --test tests/checklist.test.mjs
```
Expected: FAIL（Cannot find module '../lib/checklist.mjs'）

- [ ] **Step 3: 实现 lib/checklist.mjs**

```js
// 整改清单纯函数：计数与文本归一（门禁校验与前端共用）
export function remainingCount(list) {
  if (!Array.isArray(list)) return 0; // 旧任务无清单 → 不阻塞
  return list.filter((i) => !i?.done).length;
}

// 多行文本 → 条目数组：去空行、去 "1. / 1、/、" 编号前缀、去首尾空白
export function normalizeLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim().replace(/^\d+[.、]\s*/, '').replace(/^[、]\s*/, '').trim())
    .filter(Boolean);
}

// 新建清单条目（带 id 与时间戳）
export function makeItem(text) {
  return { id: crypto.randomUUID().slice(0, 8), text, done: false, at: new Date().toISOString() };
}
```

- [ ] **Step 4: 运行测试通过**

```bash
cd backend/functions && node --test tests/checklist.test.mjs
```
Expected: 2 tests PASS

- [ ] **Step 5: tasks.mjs 接入清单字段与门禁**

5a. 顶部 import：`import { remainingCount } from './lib/checklist.mjs';`

5b. PATCH 内容字段循环（L53）后加：

```js
    // 整改清单（P0-2：整体更新，模式同 material）
    if (Array.isArray(body.review_checklist)) patch.review_checklist = body.review_checklist;
```

5c. 门禁：`if (body.status === 'reviewing')` 块内、`runChecks` 之前加：

```js
      // 门禁2：整改清单未清零禁止推回审核（清单为空=旧任务/未打回，放行）
      const undone = remainingCount(patch.review_checklist ?? task.review_checklist);
      if (undone > 0) {
        return new Response(
          JSON.stringify({ error: `整改清单还有 ${undone} 条未完成，全部勾销后才能推回审核` }),
          { status: 400, headers },
        );
      }
```

- [ ] **Step 6: prompts.mjs 加 AI 整理 action**

`PROMPTS` 字典末尾追加：

```js
  // 整改清单：老师微信"语音转文字" → 逐条意见（P0-2 打回录入）
  organize_review_notes: (p) => [
    { role: 'system', content: '你是编辑助理，擅长把口语化的微信留言整理成清晰的逐条意见。' },
    {
      role: 'user',
      content: `把下面老师的审核意见整理为逐条整改项。要求：
- 拆成独立、可执行、可勾选的短句（每条不超过 30 字）
- 去掉寒暄、语气词、重复内容
- 保留具体要求（如"第二段数据要核实"）
严格按 JSON 数组格式输出，不要任何其他文字和代码块包裹，如 ["意见1","意见2"]

老师意见原文：
${p.text.slice(0, 2000)}`,
    },
  ],
```

- [ ] **Step 7: TaskDetail.vue 打回弹窗 + 清单区 + 推回置灰**

7a. script 增加（状态操作区附近）：

```js
// ========== 整改清单（P0-2：打回绑定清单，清零才能推回审核） ==========
const checklist = ref(Array.isArray(props.task.review_checklist) ? [...props.task.review_checklist] : []);
const rejectModal = reactive({ show: false, input: '', loading: false });

const checklistRemaining = computed(() => checklist.value.filter((i) => !i.done).length);

// 打回：弹窗录入清单（手动逐条 / 粘贴老师留言 AI 整理）
function openRejectModal() { rejectModal.show = true; rejectModal.input = ''; }

// AI 整理：粘贴的老师留言 → 逐条意见（可继续手改）
async function aiOrganizeNotes() {
  if (!rejectModal.input.trim()) return;
  rejectModal.loading = true;
  try {
    const text = await callAI('organize_review_notes', { text: rejectModal.input });
    const arr = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    if (Array.isArray(arr) && arr.length) rejectModal.input = arr.join('\n');
    else error.value = 'AI 未识别出意见，请手动逐行录入';
  } catch (e) {
    error.value = 'AI 整理失败，请手动逐行录入：' + e.message;
  } finally {
    rejectModal.loading = false;
  }
}

// 确认打回：录入内容 → 清单条目，随后执行状态流转
// normalizeLines/makeItem 从 frontend/src/utils/checklist.mjs 顶部静态 import
async function confirmReject() {
  const lines = normalizeLines(rejectModal.input);
  const items = lines.length ? lines.map(makeItem) : checklist.value; // 允许空清单直接打回（同现状）
  rejectModal.show = false;
  checklist.value = items;
  await request('/api/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ id: props.task.id, review_checklist: items, status: 'writing' }),
  });
  Object.assign(props.task, { review_checklist: items, status: 'writing' });
  emit('refresh');
}

// 勾销/恢复某条：整表 PATCH（模式同 material）
async function toggleChecklistItem(item) {
  item.done = !item.done;
  await request('/api/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ id: props.task.id, review_checklist: checklist.value }),
  });
}
```

注意：`normalizeLines/makeItem` 在后端 `lib/checklist.mjs`（Node 环境），前端不能直接 import 后端文件。**新建 `frontend/src/utils/checklist.mjs`**，内容与后端 `lib/checklist.mjs` 相同的三函数（纯函数双份，各 ~15 行，避免跨端打包依赖——两文件头注释互相注明"与对方保持同步"）。confirmReject 中直接顶部 `import { normalizeLines, makeItem } from '../utils/checklist.mjs';`（不用动态 import）。

7b. 任务切换 watch 中追加：`checklist.value = Array.isArray(props.task.review_checklist) ? [...props.task.review_checklist] : [];`

7c. 模板：打回按钮（L579-581）改为打开弹窗：

```html
      <button v-if="task.status === 'reviewing'" class="status-btn reject" @click="openRejectModal">
        打回修改
      </button>
```

推进按钮（L576-578）加置灰：

```html
      <button v-if="nextStatus" class="status-btn" :disabled="nextStatus === 'reviewing' && checklistRemaining > 0"
        :title="nextStatus === 'reviewing' && checklistRemaining > 0 ? `整改清单还剩 ${checklistRemaining} 条` : ''"
        @click="changeStatus(nextStatus)">
        推进为{{ STATUS_TEXT[nextStatus] }} →
      </button>
```

7d. 批注区之前插入清单区：

```html
    <!-- 整改清单：打回时生成，逐条勾销，清零才能推回审核 -->
    <div v-if="checklist.length && task.status === 'writing'" class="checklist">
      <h3>整改清单（剩 {{ checklistRemaining }}/{{ checklist.length }}）</h3>
      <ul>
        <li v-for="item in checklist" :key="item.id" :class="{ done: item.done }">
          <label>
            <input type="checkbox" :checked="item.done" @change="toggleChecklistItem(item)" />
            {{ item.text }}
          </label>
        </li>
      </ul>
      <p v-if="checklistRemaining === 0" class="checklist-ok">✓ 全部完成，可推进到审核</p>
    </div>
```

7e. 末尾弹窗区加打回录入弹窗：

```html
    <!-- 打回弹窗：手动逐行 / 粘贴老师留言 AI 整理 -->
    <div v-if="rejectModal.show" class="modal-mask" @click.self="rejectModal.show = false">
      <div class="modal">
        <p class="modal-title">打回修改 · 录入整改清单</p>
        <textarea v-model="rejectModal.input" rows="6" placeholder="每行一条整改项；或粘贴老师微信留言后点「AI 整理」"></textarea>
        <div class="modal-btns">
          <button @click="rejectModal.show = false">取消</button>
          <button :disabled="rejectModal.loading" @click="aiOrganizeNotes">
            {{ rejectModal.loading ? '整理中…' : '✨ AI 整理' }}
          </button>
          <button class="primary" @click="confirmReject">打回并生成清单</button>
        </div>
      </div>
    </div>
```

样式：

```css
.checklist { border: 1px solid #e6d9c8; border-radius: 8px; padding: 10px 14px; background: #fdf9f2; }
.checklist h3 { margin: 0 0 8px; font-size: 14px; }
.checklist ul { list-style: none; padding: 0; margin: 0; }
.checklist li { padding: 4px 0; font-size: 14px; }
.checklist li.done { color: #999; text-decoration: line-through; }
.checklist-ok { color: #27ae60; font-size: 13px; margin: 6px 0 0; }
```

- [ ] **Step 8: ShareView.vue 展示清单进度（加分项：老师可看勾销情况）**

在正文展示区后追加（具体插入点看 ShareView.vue 现有结构，放在正文之后）：

```html
    <!-- 整改清单进度（老师可看到整改情况） -->
    <div v-if="task.review_checklist?.length" class="checklist">
      <h3>整改清单（{{ task.review_checklist.filter(i => i.done).length }}/{{ task.review_checklist.length }} 已完成）</h3>
      <ul>
        <li v-for="item in task.review_checklist" :key="item.id" :class="{ done: item.done }">
          {{ item.done ? '☑' : '☐' }} {{ item.text }}
        </li>
      </ul>
    </div>
```

（样式可内联或复用现有 scoped 风格，只读无交互。）

- [ ] **Step 9: 后端测试全量 + 本地功能自测**

```bash
cd backend/functions && npm test && node --test tests/checklist.test.mjs
cd frontend && npm run test
```

本地 dev 自测清单：
1. 新建任务 → 填内容过检查 → 推进审核 → 点「打回修改」→ 手动录两条 → 打回成功，清单显示 2 条
2. 勾掉 1 条 → 推进按钮仍置灰且提示"还剩 1 条"；全勾 → 按钮恢复
3. 粘贴一段模拟老师留言（口语化带语气词）→ 「AI 整理」→ 文本框变为逐条意见
4. 后端门禁验证：全勾前用 curl 绕过前端直接 PATCH status=reviewing，应返回 400 与剩余条数
5. **旧任务兼容**：打开一个无清单的旧任务（review_checklist 为空）→ 推进不被阻塞
6. 生成分享链接 → 打开 /share/:token → 清单进度可见

- [ ] **Step 10: Commit**

```bash
git add backend/functions/lib/checklist.mjs backend/functions/tests/checklist.test.mjs backend/functions/tasks.mjs backend/functions/lib/prompts.mjs frontend/src/utils/checklist.mjs frontend/src/components/TaskDetail.vue frontend/src/components/ShareView.vue
git commit -m "feat(P0-2): 整改清单式打回（手动/AI双录入+清零门禁+分享页进度+旧任务兼容）"
```

---

## Task 4: P0 批部署与验收

- [ ] **Step 1: schema 迁移（用户操作，给出指引）**

SQL 已在 Task 8 统一写入 `docs/supabase-schema.sql`。提示用户：Supabase Dashboard → SQL Editor → 粘贴执行 P0 段（见 Task 8），幂等可重复执行。

- [ ] **Step 2: 推送部署**

```bash
git push origin master
```

- [ ] **Step 3: 线上验收清单（用户在 https://timely-rugelach-be68fd.netlify.app 操作）**

1. 皮肤下拉 6 套预设可切换，原两套视觉无变化
2. 调色/圆角/字号/间距 → 预览即时变化，刷新后保持
3. 复制到公众号 → 公众号编辑器粘贴格式正常
4. 打回 → 生成清单 → 勾销 → 清零才能推回审核
5. 旧任务打开、推进均正常

**用户验收通过后，方可开始 P1 批。**

---

# 第二批 P1（界面直观性）

## Task 5: 详情页流程步骤条（P1-3）

**Files:**
- Create: `frontend/src/utils/steps.js`
- Create: `frontend/tests/steps.test.mjs`
- Modify: `frontend/src/components/TaskDetail.vue`

**Interfaces:**
- Produces: `computeSteps(task)` → `[{key, label, done, active}]`，顺序固定 选题→素材→成稿→排版→审核；纯函数，不依赖 Vue

- [ ] **Step 1: 写失败测试**

`frontend/tests/steps.test.mjs`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSteps } from '../src/utils/steps.js';

test('空任务：只有选题完成，素材为当前步', () => {
  const s = computeSteps({ theme: 'x', status: 'writing', material: {}, content: '', title: '' });
  assert.equal(s[0].done, true);  // 选题：有主题即完成
  assert.equal(s[1].active, true); // 素材：当前步
  assert.equal(s[4].done, false);
});

test('素材齐+成稿达标：排版为当前步（writing）', () => {
  const s = computeSteps({
    theme: 'x', status: 'writing',
    material: { name: '晚会', highlights: ['a'] },
    content: 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[1].done, true);
  assert.equal(s[2].done, true);
  assert.equal(s[3].active, true);
});

test('reviewing：审核为当前步；published：全部完成', () => {
  const r = computeSteps({ theme: 'x', status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[4].active, true);
  const p = computeSteps({ theme: 'x', status: 'published', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.ok(p.every((i) => i.done));
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd frontend && node --test tests/steps.test.mjs
```
Expected: FAIL（module not found）

- [ ] **Step 3: 实现 steps.js**

```js
// 流程步骤条纯函数：按数据完备度标完成，按状态标当前步（引导不是闸门）
const hasMaterial = (m) => !!(m?.name || (m?.highlights || []).length);
const hasDraft = (t) => (t.content || '').length >= 300 && (t.title || '').length >= 8;

export function computeSteps(task) {
  const matOk = hasMaterial(task.material);
  const draftOk = hasDraft(task);
  const steps = [
    { key: 'topic', label: '选题', done: true },                       // 已建任务=选题完成
    { key: 'material', label: '素材', done: matOk },
    { key: 'draft', label: '成稿', done: draftOk },
    { key: 'layout', label: '排版', done: draftOk },                   // 排版即时预览，成稿达标即视为可排版
    { key: 'review', label: '审核', done: task.status === 'published' },
  ];
  // 当前步：第一个未完成项；reviewing 时当前=审核
  const activeIdx = task.status === 'reviewing' ? 4 : steps.findIndex((s) => !s.done);
  if (activeIdx >= 0) steps[activeIdx].active = true;
  if (task.status === 'published') steps.forEach((s) => (s.done = true));
  return steps;
}
```

- [ ] **Step 4: 测试通过**

```bash
cd frontend && node --test tests/steps.test.mjs
```
Expected: 3 tests PASS

- [ ] **Step 5: TaskDetail.vue 渲染步骤条**

script 顶部 `import { computeSteps } from '../utils/steps.js';` + `const steps = computed(() => computeSteps(props.task));`

模板 `detail-head` 之后插入：

```html
    <!-- 流程步骤条：引导不是闸门，不改变任何操作可达性 -->
    <div class="steps-bar">
      <template v-for="(s, i) in steps" :key="s.key">
        <span class="step" :class="{ done: s.done, active: s.active }"
          @click="scrollToStep(s.key)" :title="s.done ? '点击回到该区' : s.label">
          <i>{{ s.done ? '✓' : i + 1 }}</i>{{ s.label }}
        </span>
        <span v-if="i < steps.length - 1" class="step-arrow">›</span>
      </template>
    </div>
```

script 加锚点跳转：

```js
// 步骤点击：锚点滚动到对应区块（不拦截任何操作）
const STEP_ANCHORS = { topic: null, material: '.material-panel', draft: '.ai-toolbar', layout: '.editor-split', review: '.toolbar' };
function scrollToStep(key) {
  const sel = STEP_ANCHORS[key];
  if (!sel) return;
  document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
```

样式：

```css
.steps-bar { display: flex; align-items: center; gap: 6px; padding: 6px 0; flex-wrap: wrap; }
.step { font-size: 12px; color: #999; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.step i { font-style: normal; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; border: 1px solid #ccc; font-size: 11px; }
.step.done { color: #27ae60; }
.step.done i { background: #eafaf1; border-color: #27ae60; }
.step.active { color: #1a73e8; font-weight: bold; }
.step.active i { background: #e8f0fe; border-color: #1a73e8; }
.step-arrow { color: #ddd; }
```

- [ ] **Step 6: 自测 + Commit**

自测：空任务步骤条显示 ①选题✓ ②素材高亮；填素材/成稿后步骤推进；点已完成步骤页面滚动到对应区；所有原按钮仍可自由点击。

```bash
git add frontend/src/utils/steps.js frontend/tests/steps.test.mjs frontend/src/components/TaskDetail.vue
git commit -m "feat(P1-3): 详情页流程步骤条（数据完备度驱动+锚点跳转，纯引导不设闸）"
```

---

## Task 6: 详情页降密度（P1-4）

**Files:**
- Modify: `frontend/src/components/TaskDetail.vue`

**Interfaces:** 无新接口。红线：不动保存/复制主链路、不砍功能、不重排热区。

- [ ] **Step 1: 素材面板默认收起 + 折叠摘要态**

L44 改：

```js
const materialOpen = ref(false); // P1-4：默认收起降密度，有素材时头部显示摘要
```

panel-header（L496-498）改为带摘要态：

```html
      <div class="panel-header" @click="materialOpen = !materialOpen">
        📋 素材面板 {{ materialOpen ? '▼' : '▶' }}
        <span v-if="!materialOpen && material.name" class="panel-summary">
          已提取：{{ material.name }} · {{ (materialHighlightsText.match(/[^\n]+/g) || []).length }} 条亮点
        </span>
      </div>
```

- [ ] **Step 2: 主区分区标题明确化**

`ai-toolbar` 前加 `<h3 class="zone-title">✍️ 成稿编辑</h3>`；`editor-right` 的 preview-header 保留（已含皮肤/复制），`preview-body` 前语义不变。样式：

```css
.zone-title { font-size: 14px; color: #555; margin: 12px 0 4px; border-left: 3px solid #53de7b; padding-left: 8px; }
.panel-summary { font-size: 12px; color: #999; margin-left: 8px; }
```

- [ ] **Step 3: 自测 + Commit**

自测：详情页首屏不再被素材面板占据；有素材的任务折叠态一眼看到"已提取：xxx · N 条亮点"；展开/收起、上传、一键成稿全部正常；保存与复制不受影响。

```bash
git add frontend/src/components/TaskDetail.vue
git commit -m "feat(P1-4): 详情页降密度（素材面板默认收起+摘要态+分区标题，主链路不动）"
```

---

## Task 7: 列表页分组筛选搜索（P1-5）

**Files:**
- Modify: `frontend/src/components/TaskList.vue`

**Interfaces:** 无新接口，纯前端过滤。

- [ ] **Step 1: 增加筛选状态与 computed**

script 加：

```js
import { ref, computed } from 'vue';
// 筛选：状态 Tab + 类型下拉 + 关键词（纯前端过滤）
const statusFilter = ref('all');
const typeFilter = ref('all');
const keyword = ref('');
const allTypes = computed(() => [...new Set((props.tasks || []).map((t) => t.type).filter(Boolean))]);
const filteredTasks = computed(() =>
  (props.tasks || []).filter((t) =>
    (statusFilter.value === 'all' || t.status === statusFilter.value) &&
    (typeFilter.value === 'all' || t.type === typeFilter.value) &&
    (!keyword.value.trim() ||
      `${t.theme} ${t.title || ''} ${t.author}`.toLowerCase().includes(keyword.value.trim().toLowerCase())),
  ),
);
```

- [ ] **Step 2: 模板加筛选区，列表改用 filteredTasks**

`new-task` 之后、`task-list` 之前插入：

```html
    <div class="filters">
      <div class="status-tabs">
        <button v-for="s in [['all','全部'],['writing','写稿中'],['reviewing','审核中'],['published','已发布']]"
          :key="s[0]" :class="{ on: statusFilter === s[0] }" @click="statusFilter = s[0]">{{ s[1] }}</button>
      </div>
      <select v-model="typeFilter">
        <option value="all">全部类型</option>
        <option v-for="t in allTypes" :key="t" :value="t">{{ t }}</option>
      </select>
      <input v-model="keyword" placeholder="🔍 搜索主题/标题/署名" />
    </div>
```

`v-for="t in tasks"` 改为 `v-for="t in filteredTasks"`；空态文案改为 `v-if="filteredTasks.length === 0"`（区分"无任务"与"无匹配"：`tasks.length ? '没有匹配的任务' : '暂无任务，新建一个吧'`）。

样式：

```css
.filters { display: flex; gap: 8px; align-items: center; margin: 12px 0; flex-wrap: wrap; }
.status-tabs { display: flex; gap: 4px; }
.status-tabs button { padding: 4px 12px; border: 1px solid #e0e0e0; background: #fff; border-radius: 14px; font-size: 13px; cursor: pointer; }
.status-tabs button.on { background: #1a73e8; color: #fff; border-color: #1a73e8; }
.filters select, .filters input { padding: 5px 10px; font-size: 13px; }
```

- [ ] **Step 3: 自测 + Commit**

自测：建 2-3 个不同状态任务 → Tab 切换正确过滤；类型下拉只列出现有类型；关键词搜索主题/署名命中；组合筛选叠加正确；「推进」按钮在各 Tab 下仍工作。

```bash
git add frontend/src/components/TaskList.vue
git commit -m "feat(P1-5): 列表页状态Tab+类型筛选+关键词搜索"
```

- [ ] **Step 4: P1 批部署与验收**

```bash
git push origin master
```
线上验收：步骤条引导清晰；详情页首屏聚焦编辑+预览；列表筛选搜索可用；旧任务不受影响。**验收通过后进 P2 批。**

---

# 第三批 P2（体验补强）

## Task 8: schema 迁移段统一追加 + 一键复用为新任务（P2-6）

**Files:**
- Modify: `docs/supabase-schema.sql`
- Modify: `backend/functions/tasks.mjs`
- Modify: `frontend/src/components/TaskList.vue`

**Interfaces:**
- Consumes: Task 2 的 `theme` 字段、v2 已有 `material` 字段
- Produces: POST /api/tasks 支持可选 `copyFrom`（任务 id）

- [ ] **Step 1: 追加 schema 幂等段（P0+P2 全部迁移）**

`docs/supabase-schema.sql` 末尾追加：

```sql
-- ========== v3 增量迁移（P0-1/P0-2/P2-6，幂等，可重复执行） ==========

-- P0-1：排版主题（皮肤 id + 令牌覆盖），null = 未自定义（用全局默认）
alter table tasks add column if not exists theme jsonb;

-- P0-2：整改清单 [{id, text, done, at}]，默认空数组（旧任务不阻塞流转）
alter table tasks add column if not exists review_checklist jsonb not null default '[]';
```

> 注：此段在 Task 4（P0 部署）时即需用户在 Supabase 执行；此处为文档唯一真源。执行步骤：Supabase Dashboard → SQL Editor → 粘贴本段 → Run → 确认两个 alter 成功。

- [ ] **Step 2: tasks.mjs POST 支持 copyFrom**

POST 块（L25-37）改造：

```js
  if (req.method === 'POST') {
    const { theme, type, author, copyFrom } = await req.json();
    // P2-6：一键复用已发布任务（继承素材+排版主题，清空成稿，状态重置 writing）
    if (copyFrom) {
      const { data: src, error: findErr } = await db.from('tasks').select('*').eq('id', copyFrom).single();
      if (findErr || !src) {
        return new Response(JSON.stringify({ error: '原任务不存在' }), { status: 404, headers });
      }
      const { data, error } = await db
        .from('tasks')
        .insert({
          theme: `${src.theme}（复用）`, type: src.type, author: src.author,
          material: src.material || {}, theme: src.theme || null, // 素材与排版主题继承
          status: 'writing', // 成稿/标题/摘要/清单清空（用列默认值）
        })
        .select()
        .single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
      return new Response(JSON.stringify({ task: data }), { status: 201, headers });
    }
    if (!theme || !author) {
      return new Response(JSON.stringify({ error: 'theme 和 author 必填' }), { status: 400, headers });
    }
    // ...原有新建逻辑不动
```

- [ ] **Step 3: TaskList.vue 已发布行加复用按钮**

li 内 `advance` 按钮旁（L78-80 附近）加：

```html
        <button v-if="t.status === 'published'" class="reuse" @click.stop="reuseTask(t)">
          ♻️ 复用为新任务
        </button>
```

script 加：

```js
// P2-6：复用已发布任务（素材+排版主题继承，成稿清空）
async function reuseTask(t) {
  error.value = '';
  try {
    const data = await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ copyFrom: t.id }),
    });
    emit('refresh');
    emit('open', data.task); // 直接进入新任务编辑
  } catch (e) {
    error.value = e.message;
  }
}
```

样式：`.reuse { padding: 4px 10px; font-size: 12px; }`

- [ ] **Step 4: 自测 + Commit**

自测：发布一个任务 → 列表点「复用为新任务」→ 新任务自动打开：主题带（复用）后缀、素材面板回填原素材、皮肤与覆盖沿用、正文/标题/摘要为空、状态=写稿中；原任务不受影响。

```bash
git add docs/supabase-schema.sql backend/functions/tasks.mjs frontend/src/components/TaskList.vue
git commit -m "feat(P2-6): 已发布任务一键复用（继承素材+排版主题，清空成稿）+v3幂等迁移段"
```

---

## Task 9: AI 生成进度提示（P2-7）

**Files:**
- Modify: `frontend/src/components/TaskDetail.vue`

**Interfaces:** 无新接口。

- [ ] **Step 1: callAI 与 PDF 解析加等待计时**

script 加：

```js
// ========== P2-7：AI 等待进度（超 8s 显示已等待秒数，避免像卡死） ==========
const aiElapsed = ref(0);
let aiTimer = null;
function startElapse() {
  stopElapse();
  aiElapsed.value = 0;
  aiTimer = setInterval(() => (aiElapsed.value += 1), 1000);
}
function stopElapse() {
  if (aiTimer) clearInterval(aiTimer);
  aiTimer = null;
  aiElapsed.value = 0;
}
onBeforeUnmount(stopElapse);
```

`callAI`（L217-228）与 `onPDFUpload` 的 parsing 段改造：`callAI` 内 `try` 前 `startElapse()`、`finally` 中 `stopElapse()`（与 `aiLoading` 同生命周期）；`onPDFUpload` 中 `parsing.value = true` 后 `startElapse()`、`finally` 中 `stopElapse()`。

- [ ] **Step 2: 模板显示进度**

`ai-toolbar` 之后加：

```html
    <p v-if="aiElapsed >= 8" class="ai-progress">
      ⏳ AI 正在处理（已等待 {{ aiElapsed }} 秒）… 长文生成约需 10-25 秒，请勿离开本页
    </p>
```

素材面板的 `parsing-hint`（L502）改为：

```html
          <span v-if="parsing" class="parsing-hint">AI 正在解析策划书…{{ aiElapsed >= 8 ? `（已等待 ${aiElapsed} 秒）` : '' }}</span>
```

样式：`.ai-progress { color: #b7791f; font-size: 13px; margin: 4px 0; }`

- [ ] **Step 3: 自测 + Commit + P2 批部署**

自测：点「AI 初稿」→ 8 秒后出现等待提示且秒数跳动 → 完成后提示消失；PDF 解析同样生效；错误路径（AI 失败）提示也正确清除。

```bash
cd frontend && npm run test
git add frontend/src/components/TaskDetail.vue
git commit -m "feat(P2-7): AI 等待进度提示（超8s显示已等待秒数）"
git push origin master
```

线上验收：复用按钮、AI 进度提示可用；全部批次完成后整体验收。

---

## 验证与回归总纲（每个任务隐含）

1. **单元测试**：`cd frontend && npm run test` + `cd backend/functions && npm test`（后端 package.json 的 test script 更新为 `node --test tests/` 以覆盖新测试文件）
2. **功能自测**：本地 `npm run dev` + `dev-server.mjs` 按各任务清单手动过
3. **回归红线**：每批交付前必测——①复制到公众号粘贴格式正常 ②旧任务打开/推进/分享正常 ③口令门禁正常
4. **线上验收**：每批 git push 后用户在 Netlify 站点验收，通过才进下一批

## Self-Review 记录

- 规格覆盖：P0-1→Task 1/2，P0-2→Task 3，P1-3→Task 5，P1-4→Task 6，P1-5→Task 7，P2-6→Task 8，P2-7→Task 9，SQL 迁移→Task 8 Step 1（P0 批提前执行）✓
- 与规格的偏差说明：①素材面板折叠机制已存在（规格当作待做），Task 6 实际只改默认值+摘要态；②自定义组合存 task.theme 字段而非仅 localStorage——为满足 P2-6「继承排版参数」所需，且向后兼容（null 回退 localStorage）
- 类型一致性：`theme jsonb {id, overrides}` / `review_checklist [{id,text,done,at}]` / `resolveTheme(themeId, overrides)` / `computeSteps(task)` 各任务引用一致 ✓
