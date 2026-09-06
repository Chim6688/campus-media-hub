# V1.0 Phase 2 StylePreset 融合 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StylePreset 融合正文排版（wechat-format 组件变体）+ layout_theme 持久化 + 步骤条六改七，视觉面板独立成第④步；现有文章零回归。

**Architecture:** wechat-format.js 六个装饰组件（titleCard/sectionTitle/subHeading/quoteCard/introCard/infoBadge）增加 bold/soft 分支，journal 分支 = 现版代码原样（未指定 preset 时逐字节一致）；stylePreset 作为 tasks.layout_theme 第三个键持久化（零数据库迁移）；steps.js 插入 visual 步。

**Tech Stack:** Vue 3 + Vite 6（既有）、node --test（既有）。

**Spec:** `docs/superpowers/specs/2026-09-06-visual-production-design.md` §4/§8

## Global Constraints

- **零回归红线**：不指定 stylePreset（或历史 layout_theme 无该键）时，wechat-format 输出与现版逐字节一致；既有 55 测试全绿是每任务硬门槛
- journal 分支 = 现有组件代码原样保留（不重写、不挪动）
- bold/soft 变体只用文档流布局（微信编辑器会剥离 position:absolute——项目已知教训）；沿用 inline-style 手法与 theme 令牌取色
- stylePreset 存 `tasks.layout_theme.stylePreset`（jsonb 第三个键），缺省 'journal'，零数据库迁移
- 测试命令在 `frontend/` 目录 `npm test`；环境 PowerShell（无 &&，用分号；提交信息 -m 直传）
- 主要代码段中文注释；同文件多处编辑必须串行执行（并行 Edit 竞态是项目已知事故）

---

### Task 1: steps.js 六步改七步（插入 visual 视觉步）

**Files:**
- Modify: `frontend/src/utils/steps.js`
- Test: `frontend/tests/steps.test.mjs`（重写既有断言：步骤数与索引变化是本任务的目的行为）

**Interfaces:**
- Consumes: 无
- Produces: `computeSteps(task, contentImagesBound)` 返回 7 步数组，key 顺序 `material→draft→images→visual→layout→check→review`；visual 步 `{ key: 'visual', label: '视觉', done }`，done = status 为 reviewing/published（Phase 3 前无独立视觉数据，送审即视为视觉已认可）

- [ ] **Step 1: 重写测试文件（全文替换）**

```js
// 七步工作流纯函数测试：素材→写稿→配图→视觉→排版→检查→审核（V1.0 Phase 2 六改七）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSteps } from '../src/utils/steps.js';

test('步骤 key 顺序固定：material→draft→images→visual→layout→check→review', () => {
  const s = computeSteps({ status: 'writing', material: {}, content: '', title: '' });
  assert.deepEqual(s.map((x) => x.key), ['material', 'draft', 'images', 'visual', 'layout', 'check', 'review']);
});

test('空任务：素材为当前步，全部未完成', () => {
  const s = computeSteps({ theme: 'x', status: 'writing', material: {}, content: '', title: '' });
  assert.equal(s[0].active, true);
  assert.ok(s.every((x) => !x.done));
});

test('素材齐+成稿达标+配图说明：视觉为当前步（writing）', () => {
  const s = computeSteps({
    theme: 'x', status: 'writing',
    material: { name: '晚会', highlights: ['a'], photoNotes: '开场全景' },
    content: 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[0].done, true); // 素材
  assert.equal(s[1].done, true); // 写稿
  assert.equal(s[2].done, true); // 配图：photoNotes 非空即完成
  assert.equal(s[3].key, 'visual');
  assert.equal(s[3].active, true); // 视觉为当前步
  assert.equal(s[3].done, false); // writing 态视觉未完成
});

test('配图完成判定：正文含 [配图：] 占位也算完成', () => {
  const s = computeSteps({
    status: 'writing',
    material: { name: '晚会' },
    content: '[配图：开幕式全景]' + 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[2].done, true);
});

test('配图完成判定：已绑定正文图片（contentImagesBound>0）即完成（Phase 3）', () => {
  const s = computeSteps(
    {
      status: 'writing',
      material: { name: '晚会' },
      content: 'x'.repeat(300), title: '足够长的标题八个字以上',
    },
    1, // 已绑定 1 张正文配图
  );
  assert.equal(s[2].done, true);
  assert.equal(s[3].active, true); // 视觉为当前步
});

test('视觉完成判定：reviewing/published 视为完成（送审必过视觉）', () => {
  const r = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[3].done, true);
});

test('reviewing：审核为当前步，前六步视为完成（送审必过排版与检查）', () => {
  const r = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[6].active, true);
  assert.ok(r.slice(0, 6).every((i) => i.done));
});

test('published：全部完成且无当前步', () => {
  const p = computeSteps({ status: 'published', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.ok(p.every((i) => i.done));
  assert.ok(p.every((i) => !i.active));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`（frontend/ 目录）
Expected: FAIL —— 步骤顺序断言得到 6 步（无 visual）

- [ ] **Step 3: 修改 steps.js**

文件头部注释改为七步说明，`layoutOk` 行后新增 `visualOk`，steps 数组插入 visual 行：

```js
// 七步工作流纯函数（V1.0 Phase 2 六改七）：按数据完备度标完成，按状态标当前步（引导不是闸门）
// 工作流 UI 与数据库状态（writing/reviewing/published）解耦：步骤是展示引导，状态是业务事实
```

```js
  // 排版/检查完成 = 已推进到审核或发布（送审前必须认可排版、通过规范检查门禁）
  const layoutOk = task.status === 'reviewing' || task.status === 'published';
  // 视觉完成 = 同排版口径（Phase 3 前无独立视觉数据，送审即视为视觉已认可）
  const visualOk = layoutOk;
  const steps = [
    { key: 'material', label: '素材', done: hasMaterial(task.material) },
    { key: 'draft', label: '写稿', done: hasDraft(task) },
    { key: 'images', label: '配图', done: hasImages(task, contentImagesBound) },
    { key: 'visual', label: '视觉', done: visualOk },
    { key: 'layout', label: '排版', done: layoutOk },
    { key: 'check', label: '检查', done: layoutOk },
    { key: 'review', label: '审核', done: task.status === 'published' },
  ];
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（steps 新断言全绿 + 其余测试全绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/steps.js frontend/tests/steps.test.mjs
git commit -m "feat(visual): 工作流步骤条六改七，插入视觉设计步（Phase 2 Task 1）"
```

---

### Task 2: wechat-format.js 六组件 stylePreset 变体（TDD）

**Files:**
- Modify: `frontend/src/utils/wechat-format.js`
- Test: `frontend/tests/wechat-format.test.mjs`（文件末尾追加新测试块）

**Interfaces:**
- Consumes: `normalizeStylePreset(raw)`（style-presets.js 既有导出）
- Produces: `markdownToWechatHTML(markdown, themeId, opts)` 的 opts 新增 `stylePreset: string`（缺省/非法 = 'journal' = 现版输出）；组件函数内部签名追加 `preset` 尾参（模块私有，不导出）

- [ ] **Step 1: 在 wechat-format.test.mjs 末尾追加失败测试**

```js
// ===== StylePreset 变体（V1.0 Phase 2）：journal 零回归 + bold/soft 结构差异 =====
const OPTS = { title: '测试标题', eyebrow: '活动报道' };

test('stylePreset：未指定 = journal 显式指定，输出逐字节一致（零回归红线）', () => {
  const a = markdownToWechatHTML(SAMPLE, 'greenPink', OPTS);
  const b = markdownToWechatHTML(SAMPLE, 'greenPink', { ...OPTS, stylePreset: 'journal' });
  const c = markdownToWechatHTML(SAMPLE, 'greenPink', { ...OPTS, stylePreset: '不存在的' });
  assert.equal(a, b, '显式 journal 必须与默认一致');
  assert.equal(a, c, '非法值必须回退 journal');
});

test('stylePreset：bold 输出含实底反白标题卡与色块小节标题', () => {
  const b = markdownToWechatHTML(SAMPLE, 'greenPink', { ...OPTS, stylePreset: 'bold' });
  const j = markdownToWechatHTML(SAMPLE, 'greenPink', OPTS);
  assert.notEqual(b, j, 'bold 必须与 journal 不同');
  // bold 标题卡：accentA 实底 + 白色标题（journal 标题色是 #1a1a1a）
  assert.ok(b.includes('background:#FD98C9'), 'bold 标题卡 accentA 实底');
  assert.ok(b.includes('font-weight:bold;color:#ffffff;line-height:1.6'), 'bold 标题白字');
});

test('stylePreset：soft 输出含大圆角奶油卡与浅描边标题卡', () => {
  const s = markdownToWechatHTML(SAMPLE, 'greenPink', { ...OPTS, stylePreset: 'soft' });
  const j = markdownToWechatHTML(SAMPLE, 'greenPink', OPTS);
  assert.notEqual(s, j, 'soft 必须与 journal 不同');
  // soft 标题卡：cream 底 + accentA 细描边 + 大圆角（radius*2=20px，journal 标题卡圆角 4px 无此组合）
  assert.ok(s.includes('background:#F3EFE6;border:1.5px solid #FD98C9;border-radius:20px'), 'soft 标题卡奶油底细描边');
});

test('stylePreset：bold/soft 互不相同', () => {
  const b = markdownToWechatHTML(SAMPLE, 'greenPink', { ...OPTS, stylePreset: 'bold' });
  const s = markdownToWechatHTML(SAMPLE, 'greenPink', { ...OPTS, stylePreset: 'soft' });
  assert.notEqual(b, s);
});
```

注意：SAMPLE 常量含 `## 活动介绍`（sectionTitle）、`### 子小节`（subHeading）、`> 中段金句`（quoteCard）、`> 开头引言`（introCard）、`## 核心信息`（infoBadge）、`# 眉标｜测试标题`（titleCard）——六组件全覆盖。

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— 4 个新测试（journal 一致性测试会因 opts.stylePreset 被忽略而意外通过，bold/soft 差异测试 FAIL：输出与 journal 相同）。记录具体失败信息。

- [ ] **Step 3: 实现（串行编辑，六处小改）**

**3a. import 行追加**（文件头部）：

```js
import { normalizeStylePreset } from './style-presets.js'; // StylePreset 白名单（Phase 2）
```

**3b. 六个组件函数追加 preset 尾参 + 分派**（journal 分支 = 现有代码一行不动，仅函数签名加参、顶部加分派 if；每个变体函数新增在对应组件函数之后）：

titleCard（签名 `function titleCard(theme, title, eyebrow, preset)`，函数体首行插入）：

```js
  // Phase 2 风格分派：bold/soft 走变体，journal/缺省走现版（零回归）
  if (preset === 'bold') return titleCardBold(theme, title, eyebrow);
  if (preset === 'soft') return titleCardSoft(theme, title, eyebrow);
```

新增变体（放在 titleCard 函数之后）：

```js
// bold 标题卡：accentA 实底反白，无错位层（文档流，微信编辑器兼容）
function titleCardBold(theme, title, eyebrow) {
  const t = inline(title, theme);
  const brow = eyebrow
    ? `<span style="display:inline-block;border:1px solid #ffffff;border-radius:20px;padding:2px 16px;font-size:13px;color:#ffffff;">${esc(eyebrow)}</span>`
    : '';
  return `<section style="margin:30px 8px 40px;background:${theme.accentA};border-radius:${theme.titleRadius}px;padding:28px 20px 24px;">
<section style="text-align:center;">${brow}
<p style="font-size:${theme.titleFontSize}px;font-weight:bold;color:#ffffff;line-height:1.6;margin:14px 0 0;">${t}</p>
</section>
</section>`;
}

// soft 标题卡：奶油底 + accentA 细描边 + 大圆角
function titleCardSoft(theme, title, eyebrow) {
  const t = inline(title, theme);
  const brow = eyebrow
    ? `<span style="display:inline-block;background:#ffffff;border-radius:20px;padding:2px 16px;font-size:13px;color:${theme.creamText};">${esc(eyebrow)}</span>`
    : '';
  return `<section style="margin:30px 8px 40px;background:${theme.cream};border:${theme.thinBorder}px solid ${theme.accentA};border-radius:${theme.radius * 2}px;padding:28px 20px 24px;">
<section style="text-align:center;">${brow}
<p style="font-size:${theme.titleFontSize}px;font-weight:bold;color:${theme.ink};line-height:1.6;margin:14px 0 0;">${t}</p>
</section>
</section>`;
}
```

sectionTitle（签名加 `preset` 尾参 + 同款分派）：

```js
// bold 小节标题：ink 实底序号块 + accentA 实底标题块（双实底几何拼接）
function sectionTitleBold(theme, num, text) {
  return `<section style="text-align:center;margin:0 0 30px;">
<span style="display:inline-block;background:${theme.ink};color:#ffffff;font-size:15px;font-weight:bold;padding:6px 12px;vertical-align:middle;">${pad2(num)}</span>
<span style="display:inline-block;background:${theme.accentA};padding:6px 22px;font-size:${theme.sectionFontSize}px;font-weight:bold;color:#ffffff;vertical-align:middle;">${inline(text, theme)}</span>
</section>`;
}

// soft 小节标题：奶油胶囊一体式（序号 · 标题）
function sectionTitleSoft(theme, num, text) {
  return `<section style="text-align:center;margin:0 0 30px;">
<span style="display:inline-block;background:${theme.cream};border:${theme.thinBorder}px solid ${theme.accentB};border-radius:24px;padding:6px 22px;font-size:${theme.sectionFontSize}px;font-weight:bold;color:${theme.ink};vertical-align:middle;">${pad2(num)} · ${inline(text, theme)}</span>
</section>`;
}
```

subHeading：

```js
// bold 子标题：accentA 实底方块序号 + 左粗线标题
function subHeadingBold(theme, num, text) {
  return `<section style="text-align:center;margin:0 8px 14px;">
<span style="display:inline-block;background:${theme.accentA};color:#ffffff;font-size:13px;font-weight:bold;width:26px;height:26px;line-height:26px;vertical-align:middle;">${num}</span>
<span style="display:inline-block;background:${theme.cardBg};border-left:4px solid ${theme.accentA};padding:6px 18px;font-size:${theme.bodyFontSize}px;font-weight:bold;color:#1a1a1a;vertical-align:middle;">${inline(text, theme)}</span>
</section>`;
}

// soft 子标题：奶油圆片序号 + 无底标题
function subHeadingSoft(theme, num, text) {
  return `<section style="text-align:center;margin:0 8px 14px;">
<span style="display:inline-block;background:${theme.cream};color:${theme.creamText};font-size:13px;font-weight:bold;width:26px;height:26px;line-height:26px;border-radius:50%;vertical-align:middle;">${num}</span>
<span style="display:inline-block;padding:6px 18px;font-size:${theme.bodyFontSize}px;font-weight:bold;color:${theme.ink};vertical-align:middle;">${inline(text, theme)}</span>
</section>`;
}
```

introCard：

```js
// bold 引言卡：accentA 左粗条 + 直角右圆角
function introCardBold(theme, text) {
  return `<section style="background:${theme.cardBg};border-left:6px solid ${theme.accentA};border-radius:0 ${theme.radius}px ${theme.radius}px 0;padding:18px 20px;margin:0 8px 36px;">
<p style="font-size:${theme.bodyFontSize}px;color:${theme.ink};line-height:${theme.bodyLineHeight};margin:0;">${inline(text, theme)}</p>
</section>`;
}

// soft 引言卡：奶油底大圆角
function introCardSoft(theme, text) {
  return `<section style="background:${theme.cream};border-radius:${theme.radius * 2}px;padding:18px 20px;margin:0 8px 36px;">
<p style="font-size:${theme.bodyFontSize}px;color:${theme.ink};line-height:${theme.bodyLineHeight};margin:0;">${inline(text, theme)}</p>
</section>`;
}
```

quoteCard：

```js
// bold 金句条：accentA 实底白字加粗
function quoteCardBold(theme, text) {
  return `<section style="background:${theme.accentA};border-radius:${theme.titleRadius}px;padding:14px 20px;margin:0 8px ${theme.sectionGap}px;text-align:center;">
<span style="font-size:${theme.bodyFontSize}px;color:#ffffff;line-height:1.9;font-weight:bold;">${inline(text, theme)}</span>
</section>`;
}

// soft 金句条：奶油底大圆角浅字
function quoteCardSoft(theme, text) {
  return `<section style="background:${theme.cream};border-radius:${theme.radius * 2}px;padding:14px 20px;margin:0 8px ${theme.sectionGap}px;text-align:center;">
<span style="font-size:${theme.bodyFontSize}px;color:${theme.creamText};line-height:1.9;">${inline(text, theme)}</span>
</section>`;
}
```

infoBadge：

```js
// bold 信息标签：ink 实底直角
function infoBadgeBold(theme, text) {
  return `<section style="text-align:center;margin:0 8px 14px;">
<span style="display:inline-block;background:${theme.ink};color:#ffffff;font-size:15px;font-weight:bold;padding:5px 24px;">${inline(text, theme)}</span>
</section>`;
}

// soft 信息标签：奶油底细描边圆角
function infoBadgeSoft(theme, text) {
  return `<section style="text-align:center;margin:0 8px 14px;">
<span style="display:inline-block;background:${theme.cream};border:1px solid ${theme.creamBorder};color:${theme.ink};font-size:15px;font-weight:bold;padding:5px 24px;border-radius:20px;">${inline(text, theme)}</span>
</section>`;
}
```

**3c. 主入口接线**（markdownToWechatHTML 内，`const theme = resolveTheme(...)` 行之后加）：

```js
  const preset = normalizeStylePreset(opts.stylePreset); // Phase 2：结构风格（journal=现版零回归）
```

六处调用点传参（逐一修改，串行）：`titleCard(theme, m[2], m[1])` → `titleCard(theme, m[2], m[1], preset)`；`titleCard(theme, text, opts.eyebrow)` → 加 `, preset`；`sectionTitle(theme, sectionNum, text)`、`subHeading(theme, sectionNum, text)`、`introCard(theme, ...)`、`quoteCard(theme, ...)`、`infoBadge(theme, text)` 同样追加 `, preset` 尾参。文首兜底 `parts.unshift(titleCard(theme, opts.title, opts.eyebrow))` 同样追加。

注意：bodyCard/infoCard/imageSlot/footerCard/listRow/refCard 不加变体（色值已随 theme 走，Phase 2 范围仅六个装饰组件）。

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（4 个新测试全绿 + 既有全部测试全绿——特别是既有特征化测试证明 journal 零回归）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/wechat-format.js frontend/tests/wechat-format.test.mjs
git commit -m "feat(visual): wechat-format 六组件 stylePreset 变体（journal 零回归）（Phase 2 Task 2）"
```

---

### Task 3: TaskDetail 集成——stylePreset 状态/持久化/七步面板

**Files:**
- Modify: `frontend/src/components/TaskDetail.vue`（6 处小改，全部串行执行）
- Modify: `frontend/src/components/visual/VisualPanel.vue`（stylePreset 从内部 ref 提升为 defineModel）

**Interfaces:**
- Consumes: Task 1 七步 steps、Task 2 `opts.stylePreset`、Phase 1 VisualPanel/VisualTemplateSelector
- Produces: 任务级 stylePreset 状态（`layout_theme.stylePreset` 持久化 + 预览/复制自动生效 + 第④步视觉面板）

- [ ] **Step 1: VisualPanel.vue 提升风格状态为 model**

把 `const stylePreset = ref('journal');` 替换为：

```js
// 风格状态提升到 TaskDetail（Phase 2）：正文排版预览与视觉卡共用同一 stylePreset
const stylePreset = defineModel('stylePreset', { type: String, default: 'journal' });
```

（`ref` import 若仍被其他引用使用则保留；模板无需改动。）

- [ ] **Step 2: TaskDetail.vue 六处修改（严格串行，每次 Edit 后确认）**

**2a. script 顶部 import 区**（VisualPanel import 之后加）：

```js
import VisualTemplateSelector from './visual/VisualTemplateSelector.vue'; // 风格三选一（Phase 2）
```

**2b. 状态声明**（L524 附近 `const themeId = ref(...)` 行后加）：

```js
// 结构风格（Phase 2）：任务级持久化于 layout_theme.stylePreset，缺省 journal（历史数据零迁移兼容）
const stylePreset = ref(props.task.layout_theme?.stylePreset || 'journal');
```

**2c. 任务切换回填**（L169-172 回填块内，`Object.assign(themeOverrides, ...)` 行后加）：

```js
  stylePreset.value = props.task.layout_theme?.stylePreset || 'journal';
```

**2d. 保存 payload**（L209 `layout_theme: { id: themeId.value, overrides: { ...themeOverrides } }` 改为）：

```js
      layout_theme: { id: themeId.value, overrides: { ...themeOverrides }, stylePreset: stylePreset.value }, // 排版主题+结构风格随任务持久化
```

**2e. 快照触发自动保存**（L577 themeSnapshot 改为含 stylePreset）：

```js
const themeSnapshot = computed(() => JSON.stringify({ id: themeId.value, overrides: themeOverrides, stylePreset: stylePreset.value }));
```

**2f. 预览接线**（L583 wechatHTML computed 的 opts 内加 `stylePreset`）：

```js
  const wechatHTML = computed(() =>
    markdownToWechatHTML(content.value, themeId.value, {
      title: title.value, eyebrow: props.task.type, overrides: { ...themeOverrides }, images: boundImages.value,
      stylePreset: stylePreset.value, // Phase 2：结构风格进预览与复制（同源）
    }),
  );
```

- [ ] **Step 3: 模板改造——视觉面板独立成第④步**

**3a.** layout 步骤内的 VisualPanel 块（`<!-- ④.5 视觉设计 ... -->` + `<VisualPanel ... />` 两处，约 L797-799）**整块删除**。

**3b.** images 步骤 template 块之后、layout 步骤 template 块之前，插入新步骤块：

```vue
        <!-- ④ 视觉设计（Phase 2 独立成步）：Mock 面板，Phase 3 接真实数据 -->
        <template v-else-if="activeStep === 'visual'">
          <VisualPanel :task-id="task.id" :title="title" :theme-id="themeId"
            :theme-overrides="{ ...themeOverrides }" v-model:style-preset="stylePreset" />
          <p class="step-hint">生成封面与章节卡视觉图（当前为 Mock 数据，Phase 3 接入文章真实数据）</p>
        </template>
```

**3c.** layout 步骤 `.layout-controls` 内（主题 select 之后）加风格选择器：

```vue
            <VisualTemplateSelector v-model="stylePreset" />
```

- [ ] **Step 4: 构建验证**

Run: `npm test` && `npm run build`（frontend/ 目录，分号连接）
Expected: 55 测试全绿（Task 3 无新纯函数测试）；build 成功

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/TaskDetail.vue frontend/src/components/visual/VisualPanel.vue
git commit -m "feat(visual): stylePreset 任务级持久化 + 七步工作流视觉面板成步（Phase 2 Task 3）"
```

---

### Task 4: Phase 2 收尾——真机验证 + 回归 + 汇报

**Files:** 无新文件（验证性任务）

- [ ] **Step 1: 启动联调环境**

项目根目录后台启动 `node dev-server.mjs`（8888）+ frontend/ 后台启动 `npm run dev`（5173）。

- [ ] **Step 2: Playwright 真机验证（脚本一次性覆盖）**

1. 口令进入 → 打开任务：步骤条为**七步**（素材/写稿/配图/视觉/排版/检查/审核）
2. 点"视觉"步：VisualPanel 在独立步骤渲染（三风格选择器 + 两张预览卡 + 导出按钮）
3. 点"排版"步：`.layout-controls` 内出现风格三选一；切到"大色块"→ 右侧公众号预览 HTML 变化（titleCard 实底反白特征 `color:#ffffff`）
4. 切回"手账杂志"：预览恢复 journal 原版渲染（与切换前 HTML 一致——零回归现场验证）
5. 自动保存后刷新页面（page.reload + 重新进入任务）：风格保持"手账杂志"之外先切"柔和"再刷新，验证 `layout_theme.stylePreset` 持久化回填
6. 视觉步切风格 → 排版步预览同步（两处共用同一状态）
7. 控制台零错误断言

- [ ] **Step 3: 全量回归 + 构建**

`npm test`（59 个左右全绿）、`npm run build` 成功。

- [ ] **Step 4: 停服务 + 清理临时产物 + 汇报（原方案 §35 格式，暂停等验收）**

---

## Self-Review 记录

- **Spec 覆盖**：规格 §4"默认 journal 零回归"→ Task 2 逐字节断言 + 既有特征化测试；"同一 stylePreset 驱动正文+视觉卡"→ Task 3 状态提升共用；"layout_theme 第三个键"→ Task 3 持久化；"参数面板三选一"→ Task 3 Step 3c；步骤条六改七 → Task 1。Phase 2 范围外（识图/真实数据对接）正确留待 Phase 5/3。
- **占位符扫描**：无 TBD；Task 2/3 全部给出完整代码与精确编辑点。
- **类型一致性**：`opts.stylePreset`（Task 2 产出 = Task 3 Step 2f 消费）；`defineModel('stylePreset')`（Task 3 Step 1 产出 = Step 3b `v-model:style-preset` 消费）；steps 七步 key（Task 1 产出 = Task 3 Step 3b `activeStep === 'visual'` 消费）。
