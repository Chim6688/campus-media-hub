# Phase 1 工作流 UI 改造 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 TaskDetail 从"功能堆叠编辑页"改造成"①素材→②写稿→③配图→④排版→⑤检查→⑥审核"的分步引导工作台，右侧公众号预览常驻。

**Architecture:** 纯前端改造。steps.js 纯函数扩展为 6 步（修改复用，不新建）；TaskDetail.vue 增加 `activeStep` 本地 UI 态，把现有功能块按步骤重新分组渲染，底部加上一步/下一步导航。AI 调用、自动保存、预览渲染、审核门禁等核心逻辑零改动。

**Tech Stack:** Vue 3 `<script setup>` + node:test（TDD）。无新依赖、无后端改动、无数据库改动。

## Global Constraints

- 第一轮只做 Phase 1；不实现 Supabase Storage / 图片上传 / AI 图片生成 / 新数据库表 / 微信 API / 新编辑器 / 后端重构（开发指令 §5）。
- 数据库状态保持 `writing / reviewing / published`；工作流 UI 独立计算 `material / draft / images / layout / check / review`，二者不合并（§5）。
- 已有 `steps.js` 优先修改复用，不新建第二套步骤系统（§5）。
- 不重写 AI、Markdown 编辑器、公众号预览、审核核心逻辑（§0）。
- 步骤条只做引导不是权限闸门，不改变任何操作可达性（§4）。
- 当前步骤视觉最突出；已完成显示 ✓；可点击返回之前的步骤（§4）。
- 右侧公众号预览尽量始终存在；当前阶段只突出该阶段最重要的操作（§4）。
- 配图步 Phase 1 无真实图片系统：用现有 `material.photoNotes`（照片说明）承载配图计划，并提示 Phase 2 接入上传。
- 窄屏（≤768px）保持 C 批结论：左右分栏改上下堆叠，不横向溢出。

---

### Task 1: steps.js 扩展为六步工作流（TDD）

**Files:**
- Modify: `frontend/src/utils/steps.js`
- Modify: `frontend/tests/steps.test.mjs`

**Interfaces:**
- Consumes: 无（纯函数，入参 task 对象）
- Produces: `computeSteps(task)` 返回 6 元素数组，key 顺序固定为 `['material','draft','images','layout','check','review']`，每项 `{ key, label, done, active? }`。TaskDetail 依赖此 key 顺序做步骤导航。

- [x] **Step 1: 重写测试（先写失败测试）**

`frontend/tests/steps.test.mjs` 全文替换为：

```js
// 六步工作流纯函数测试：素材→写稿→配图→排版→检查→审核（V1.0 Phase 1）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSteps } from '../src/utils/steps.js';

test('步骤 key 顺序固定：material→draft→images→layout→check→review', () => {
  const s = computeSteps({ status: 'writing', material: {}, content: '', title: '' });
  assert.deepEqual(s.map((x) => x.key), ['material', 'draft', 'images', 'layout', 'check', 'review']);
});

test('空任务：素材为当前步，全部未完成', () => {
  const s = computeSteps({ theme: 'x', status: 'writing', material: {}, content: '', title: '' });
  assert.equal(s[0].active, true);
  assert.ok(s.every((x) => !x.done));
});

test('素材齐+成稿达标+配图说明：排版为当前步（writing）', () => {
  const s = computeSteps({
    theme: 'x', status: 'writing',
    material: { name: '晚会', highlights: ['a'], photoNotes: '开场全景' },
    content: 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[0].done, true); // 素材
  assert.equal(s[1].done, true); // 写稿
  assert.equal(s[2].done, true); // 配图：photoNotes 非空即完成
  assert.equal(s[3].active, true); // 排版为当前步
});

test('配图完成判定：正文含 [配图：] 占位也算完成', () => {
  const s = computeSteps({
    status: 'writing',
    material: { name: '晚会' },
    content: '[配图：开幕式全景]' + 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[2].done, true);
});

test('reviewing：审核为当前步，前五步视为完成（送审必过排版与检查）', () => {
  const r = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[5].active, true);
  assert.ok(r.slice(0, 5).every((i) => i.done));
});

test('published：全部完成且无当前步', () => {
  const p = computeSteps({ status: 'published', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.ok(p.every((i) => i.done));
  assert.ok(p.every((i) => !i.active));
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm test`
Expected: FAIL（key 顺序为旧的 5 步 topic/material/draft/layout/review）

- [x] **Step 3: 实现 steps.js**

`frontend/src/utils/steps.js` 全文替换为：

```js
// 六步工作流纯函数（V1.0 Phase 1）：按数据完备度标完成，按状态标当前步（引导不是闸门）
// 工作流 UI 与数据库状态（writing/reviewing/published）解耦：步骤是展示引导，状态是业务事实
const hasMaterial = (m) => !!(m?.name || (m?.highlights || []).length);
const hasDraft = (t) => (t.content || '').length >= 300 && (t.title || '').length >= 8;
// 配图完成（Phase 1 无真实图片系统）：照片说明非空，或正文已有配图占位
const hasImages = (t) => !!(t.material?.photoNotes || '').trim() || /\[配图[：:]/.test(t.content || '');

export function computeSteps(task) {
  const layoutOk = task.status === 'reviewing' || task.status === 'published';
  const steps = [
    { key: 'material', label: '素材', done: hasMaterial(task.material) },
    { key: 'draft', label: '写稿', done: hasDraft(task) },
    { key: 'images', label: '配图', done: hasImages(task) },
    // 排版/检查完成 = 已推进到审核或发布（送审前必须认可排版、通过规范检查门禁）
    { key: 'layout', label: '排版', done: layoutOk },
    { key: 'check', label: '检查', done: layoutOk },
    { key: 'review', label: '审核', done: task.status === 'published' },
  ];
  // 当前步：审核中锁定审核步；已发布全部完成；否则落在第一个未完成项
  const activeIdx = task.status === 'reviewing' ? steps.length - 1 : steps.findIndex((s) => !s.done);
  if (activeIdx >= 0) steps[activeIdx].active = true;
  if (task.status === 'published') steps.forEach((s) => (s.done = true));
  return steps;
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `cd frontend && npm test`
Expected: PASS（6 个用例全绿）

---

### Task 2: TaskDetail.vue 工作台布局改造

**Files:**
- Modify: `frontend/src/components/TaskDetail.vue`（script 增量 + template 重组 + style 增量）

**Interfaces:**
- Consumes: `computeSteps(task)`（Task 1 的 6 步契约）、全部现有函数与响应式状态（save/callAI/runCheck/changeStatus 等，零改动）
- Produces: `activeStep` UI 态 + `gotoStep/prevStep/nextStep` 步骤导航。删除 `STEP_ANCHORS/scrollToStep`（滚动定位被面板切换取代）。

布局目标（开发指令 §4）：

```text
┌─────────────────────────────────────────────┐
│ ← 返回  [标题输入]  状态标签  保存  已保存 ✓  │
├─────────────────────────────────────────────┤
│ ①素材 → ②写稿 → ③配图 → ④排版 → ⑤检查 → ⑥审核 │
├───────────────────────┬─────────────────────┤
│ 当前步骤操作区         │   公众号预览（常驻）  │
├───────────────────────┴─────────────────────┤
│             ← 上一步             下一步 →    │
└─────────────────────────────────────────────┘
```

- [x] **Step 1: script 增量——步骤导航态**

在 `// ========== 流程步骤条` 区块原位替换（删除 STEP_ANCHORS/scrollToStep）：

```js
// ========== 工作流步骤导航（Phase 1：分步引导工作台） ==========
// 六步完成度由纯函数计算；activeStep 是本地 UI 态（当前展示哪一步的操作面板）
const steps = computed(() => computeSteps(props.task));
const activeStep = ref('material');
// 任务切换时落到计算出的当前步（并入既有 switching 保护语义：只影响展示不触发保存）
watch(() => props.task.id, () => {
  activeStep.value = steps.value.find((s) => s.active)?.key || 'material';
});

// 固定步序：上一步/下一步按此导航（纯 UI 引导，不做任何校验拦截）
const STEP_ORDER = ['material', 'draft', 'images', 'layout', 'check', 'review'];
const prevStep = computed(() => STEP_ORDER[STEP_ORDER.indexOf(activeStep.value) - 1] || null);
const nextStep = computed(() => STEP_ORDER[STEP_ORDER.indexOf(activeStep.value) + 1] || null);
const stepLabel = (key) => steps.value.find((s) => s.key === key)?.label || key;
function gotoStep(key) {
  activeStep.value = key;
}
```

另将 `materialOpen` 初始值改为 `ref(true)`（素材步内面板常展开，保留手动折叠能力）。

- [x] **Step 2: template 重组——头部 + 步骤条 + 底部导航**

头部（原 `.detail-head` 改为标题行内嵌标题输入与保存态）：

```html
<div class="detail-head">
  <button class="back" @click="emit('back')">← 返回</button>
  <input v-model="title" class="head-title" placeholder="推文标题（可点 AI 生成）" />
  <span class="status-tag" :class="task.status">{{ STATUS_TEXT[task.status] || task.status }}</span>
  <button :disabled="saving" @click="save()">{{ saving ? '保存中…' : '保存' }}</button>
  <span v-if="savedAt" class="saved">{{ autoSaved ? '已自动保存 ✓' : '已保存 ✓' }} {{ savedAt }}</span>
</div>
```

步骤条（点击=切换面板，不再是滚动锚点）：

```html
<div class="steps-bar">
  <template v-for="(s, i) in steps" :key="s.key">
    <span class="step" :class="{ done: s.done, active: s.key === activeStep }" @click="gotoStep(s.key)"
      :title="s.done ? '已完成，点击返回查看' : '点击切换到该步'">
      <i>{{ s.done ? '✓' : i + 1 }}</i>{{ s.label }}
    </span>
    <span v-if="i < steps.length - 1" class="step-arrow">›</span>
  </template>
</div>
```

主区两栏 + 底部导航骨架（六个面板为 Task 3-8 逐一填充，此处先立骨架）：

```html
<div class="workbench">
  <div class="step-panel"><!-- 各步骤面板按 activeStep 切换 --></div>
  <div class="preview-pane"><!-- 常驻预览 --></div>
</div>
<div class="step-nav">
  <button :disabled="!prevStep" @click="gotoStep(prevStep)">← 上一步{{ prevStep ? '：' + stepLabel(prevStep) : '' }}</button>
  <button class="next" :disabled="!nextStep" @click="gotoStep(nextStep)">下一步{{ nextStep ? '：' + stepLabel(nextStep) : '' }} →</button>
</div>
```

- [x] **Step 3: template 六个步骤面板（现有块迁移，函数零改动）**

`.step-panel` 内按 `activeStep` 切换：

```html
<div class="step-panel">
  <!-- ① 素材：上传策划书 → AI 提取 → 人工补充 → 一键成稿 -->
  <div v-if="activeStep === 'material'" class="material-panel">
    <!-- 原 material-panel 的 panel-body 内容整体迁移（materialOpen 恒为 true，去掉折叠头） -->
  </div>

  <!-- ② 写稿：摘要 + AI 工具条 + 正文编辑 -->
  <template v-else-if="activeStep === 'draft'">
    <label>摘要</label>
    <textarea v-model="summary" rows="2" placeholder="公众号推送摘要（可点 AI 生成）"></textarea>
    <div class="ai-toolbar"><!-- 原 4 个 AI 按钮整体迁移 --></div>
    <p v-if="aiElapsed >= 8" class="ai-progress"><!-- 原样迁移 --></p>
    <div class="editor-left">
      <textarea ref="contentRef" v-model="content" rows="24" placeholder="正文 Markdown：## 小节、> 金句、[配图：说明]、文末署名"></textarea>
      <p class="word-count">{{ content.length }} 字</p>
    </div>
  </template>

  <!-- ③ 配图（Phase 1 无上传）：照片说明 = 配图计划，Phase 2 接入真实图片 -->
  <template v-else-if="activeStep === 'images'">
    <label>照片说明（每张图打算拍什么，用于配图占位）</label>
    <textarea v-model="photoNotes" rows="4" placeholder="如：开场全景、互动特写、全场大合唱"></textarea>
    <p class="step-hint">📷 真实图片上传将在下一阶段接入；当前先写好配图计划，生成初稿时会转为 [配图：xxx] 占位</p>
  </template>

  <!-- ④ 排版：模板/画廊/AI配色/调参数（预览在右侧实时刷新） -->
  <template v-else-if="activeStep === 'layout'">
    <div class="layout-controls">
      <select v-model="themeId" title="模板皮肤"><!-- 原 option 循环迁移 --></select>
      <button class="param-toggle" @click="galleryOpen = true">🖼 画廊</button>
      <button class="param-toggle" @click="openSkinModal">✨ AI 配色</button>
      <button class="param-toggle" @click="panelOpen = !panelOpen">{{ panelOpen ? '收起参数' : '🎨 调参数' }}</button>
    </div>
    <div v-if="panelOpen" class="param-panel"><!-- 原 param-row 循环整体迁移 --></div>
    <p class="step-hint">右侧预览实时反映排版效果，满意后进入下一步</p>
  </template>

  <!-- ⑤ 检查：规范检查 + 报告 + 整改清单 + 提交审核 -->
  <template v-else-if="activeStep === 'check'">
    <div class="check-actions">
      <button :disabled="saving" @click="runCheck">规范检查</button>
      <button v-if="task.status === 'writing'" class="status-btn"
        :disabled="checklistRemaining > 0"
        :title="checklistRemaining > 0 ? `整改清单还剩 ${checklistRemaining} 条` : ''"
        @click="changeStatus('reviewing')">
        提交审核 →
      </button>
    </div>
    <!-- 原 report 块与 checklist 块整体迁移 -->
  </template>

  <!-- ⑥ 审核：分享链接 + 状态推进/打回 + 批注 -->
  <template v-else>
    <div class="review-actions">
      <button v-if="task.status === 'reviewing'" class="status-btn" @click="changeStatus('published')">审核通过，推进为已发布 →</button>
      <button v-if="task.status === 'reviewing'" class="status-btn reject" @click="openRejectModal">打回修改</button>
      <button v-if="task.status !== 'published'" class="status-btn share" @click="generateShareLink">生成分享链接（发审核人）</button>
    </div>
    <!-- 原 share-link / comments 块整体迁移 -->
  </template>
</div>
```

`.preview-pane`（常驻右栏，原 `.editor-right` 内容迁移）：

```html
<div class="preview-pane">
  <div class="preview-header">
    <span class="preview-tag">📱 公众号预览</span>
    <button class="copy-wechat" :disabled="!content" @click="copyToWechat">
      {{ copied ? '✓ 已复制，去公众号粘贴' : '📋 复制到公众号' }}
    </button>
  </div>
  <div class="preview-body" v-html="wechatHTML"></div>
</div>
```

删除原有独立块：`<label>标题</label><input v-model="title">`（已入头部）、`.editor-split` 双栏结构、`.toolbar` 中已迁移按钮（保留块内未迁移项如无需则整块删除）。

- [x] **Step 4: style 增量——工作台网格 + 底部导航 + 窄屏**

```css
/* 工作台两栏：左操作区随步骤切换，右预览常驻 */
.workbench { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.step-panel { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.preview-pane { border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; position: sticky; top: 12px; min-width: 0; }
.preview-tag { font-size: 13px; font-weight: 600; color: #555; }
.preview-body { overflow-y: auto; max-height: 620px; background: #ebebeb; }
/* 底部步骤导航：上一步灰置，下一步蓝色主按钮 */
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; }
.step-nav .next { background: #1e88e5; color: #fff; border: none; border-radius: 4px; padding: 8px 20px; cursor: pointer; }
.step-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
.step-hint { font-size: 12px; color: #999; margin: 0; }
.head-title { flex: 1; font-size: 16px; font-weight: 600; min-width: 0; }
/* 窄屏：左右改上下堆叠（延续 C 批），预览不再 sticky */
@media (max-width: 768px) {
  .workbench { grid-template-columns: 1fr; }
  .preview-pane { position: static; }
  .preview-body { max-height: 480px; }
  .detail-head { flex-wrap: wrap; }
}
```

同时删除已无引用的旧样式（`.editor-split/.editor-left/.editor-right`、`.zone-title`）。

- [x] **Step 5: 自查清单（模板迁移完整性）**

逐项确认旧模板块在新结构中都有归宿：素材面板→素材步；摘要/AI工具条/正文/字数→写稿步；photoNotes→配图步；主题select/画廊/AI配色/调参→排版步；规范检查/report/checklist/提交审核→检查步；推进已发布/打回/分享链接/批注→审核步；复制到公众号→预览头；保存/已保存→头部。弹窗（modal/titlePicker/rewritePicker/rejectModal/gallery/skinModal）全部原样保留在模板尾部。

---

### Task 3: 构建、测试与浏览器验证

**Files:**
- 无新改动（验证任务；发现问题则回修 Task 1/2）

- [x] **Step 1: 构建与单测**

Run: `cd frontend && npm run build`
Expected: vite build 成功无报错

Run: `cd frontend && npm test`
Expected: 全部通过

Run: `cd backend/functions && node --test tests/`
Expected: 全部通过（本次无后端改动，确认无回归）

- [x] **Step 2: Playwright 视口冒烟（375/768/1280）**

启动 dev-server 后用 webapp-testing 技能截图检查：步骤条渲染为 6 步、点击步骤切换面板、右侧预览常驻、底部导航可用、窄屏无横向溢出。

- [x] **Step 3: 按开发指令 §31 格式汇报，暂停等待确认**

不自动进入 Phase 2。
