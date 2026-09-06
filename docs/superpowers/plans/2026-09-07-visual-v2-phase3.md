# V2 Phase 3 图片生产闭环补缺 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 V2 构图体系下图片生产闭环的两个缺口——章节卡绑定槽位时正文占位自动对齐（指令 §11"插入正文"完整语义）+ 多图构图的主图/辅图独立换图（photo-stack 真实双图）。

**Architecture:** 缺口 1 用纯函数 `ensurePlaceholder(content, slot)`（占位不足时在文末追加 `[配图：章节卡]`，复用既有占位语法）+ VisualPanel 章节卡生成时经 defineModel content 回写（与 ImageWorkspace 补占位同模式）；缺口 2 在 VisualPanel 换图弹窗 target 加 'card2'（辅图），photo-stack 构图消费 image2Url（渲染层已支持，Task 2 重构时已加容错）。既有导出/上传/绑定链路零改动。

**Tech Stack:** 既有 html2canvas 导出管线、/api/images、Vue 3、node --test（100 测试基线）。

**Spec:** `docs/改造指令-CampusMediaHub-视觉设计V2.md` §11（导出后闭环）+ Phase 3 节

## 核心事实（代码核验结论）

- generateCover/generateSectionCard 完整链路已存在（V1 Phase 3+4 交付）：截图 Blob→上传 article_images（source=ai）→封面替换/槽位绑定——**零改动**
- wechat-format imageSlot：第 N 个整段 `[配图：]` 占位 = 槽位 N，绑定渲染真实 `<img>`——**§12 已满足**（前提：正文有对应占位）
- image2Url：renderSectionCard 的 d 容错已含（V2 Task 2 加），photo-stack 布局已消费（无则复用主图）——**渲染层就绪，缺 UI 入口**
- VisualPanel content prop 已存在（Phase 6 传给 VisualSuggest），但为单向 props——回写正文需 defineModel 或 emit；ImageWorkspace 用 defineModel('content') 模式（可参照）
- insertMissingPlaceholders(images.js) 按"配图计划行数"补插，语义与本缺口不同（本处按槽位号精确补 1 个）

## Global Constraints

- **零回归**：既有 100 测试全绿；导出/上传/封面/槽位绑定链路零改动
- 占位语法严格沿用 `[配图：说明]`（整段独行），微信预览链路（imageSlot 正则）不改
- AI 只建议原则不变：补占位是确定性操作（绑定动作的直接结果），非 AI 决策
- 组件行数：VisualPanel 已 211 行——缺口 2 改动须控制在 +6 行内（弹窗 target 复用）；补占位逻辑在纯函数
- 测试 `npm test`（frontend/）；PowerShell（无 &&，git -m 直传）；同文件多编辑串行

---

### Task 1: ensurePlaceholder 纯函数 + 章节卡绑定自动补占位（TDD）

**Files:**
- Create: `frontend/src/utils/placeholder.js`
- Test: `frontend/tests/placeholder.test.mjs`
- Modify: `frontend/src/components/visual/VisualPanel.vue`（content 改 defineModel + 生成时补占位）

**Interfaces:**
- Consumes: 既有占位语法 `/^\[配图[：:][^\]]*\]\s*$/gm`（与 wechat-format imageSlot 同正则）
- Produces:
  - `countPlaceholders(content) : number`——整段占位数
  - `ensurePlaceholder(content, slot, label) : string`——槽位 ≤ 现有占位数时原样返回；否则文末追加 `\n\n[配图：label]`（幂等：追加后占位数 = slot）

- [ ] **Step 1: 写失败测试**

```js
// 占位对齐纯函数（V2 Phase 3）：章节卡绑定槽位 → 正文占位自动补齐
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPlaceholders, ensurePlaceholder } from '../src/utils/placeholder.js';

test('countPlaceholders：整段占位计数（独行才计，行内不计）', () => {
  assert.equal(countPlaceholders('第一段\n\n[配图：开场]\n\n第二段'), 1);
  assert.equal(countPlaceholders('[配图：a]\n\n[配图：b]'), 2);
  assert.equal(countPlaceholders('文中提到 [配图：行内] 不算'), 0);
  assert.equal(countPlaceholders(''), 0);
  assert.equal(countPlaceholders(null), 0);
});

test('ensurePlaceholder：槽位 ≤ 现有占位数 → 原样返回', () => {
  const c = '[配图：a]\n\n[配图：b]';
  assert.equal(ensurePlaceholder(c, 1, '章节卡'), c);
  assert.equal(ensurePlaceholder(c, 2, '章节卡'), c);
});

test('ensurePlaceholder：槽位超出 → 文末追加占位（差几个补几个）', () => {
  const c = '[配图：a]';
  const out = ensurePlaceholder(c, 2, '章节卡');
  assert.equal(countPlaceholders(out), 2);
  assert.ok(out.includes('[配图：章节卡]'));
  // 原内容保留 + 追加在末尾
  assert.ok(out.startsWith('[配图：a]'));
});

test('ensurePlaceholder：空正文也能补（直接返回占位）', () => {
  const out = ensurePlaceholder('', 1, '视觉章节卡');
  assert.equal(countPlaceholders(out), 1);
  assert.ok(out.includes('[配图：视觉章节卡]'));
});

test('ensurePlaceholder：幂等（连续调两次不重复追加）', () => {
  const c = '[配图：a]';
  const once = ensurePlaceholder(c, 2, '章节卡');
  const twice = ensurePlaceholder(once, 2, '章节卡');
  assert.equal(once, twice);
});

test('ensurePlaceholder：label 缺省与非法 slot 容错', () => {
  const out = ensurePlaceholder('[配图：a]', 3);
  assert.equal(countPlaceholders(out), 3);
  assert.ok(out.includes('[配图：配图]'));
  assert.equal(ensurePlaceholder('[配图：a]', 0, 'x'), '[配图：a]'); // slot<1 原样
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— Cannot find module placeholder.js

- [ ] **Step 3: 实现**

```js
// frontend/src/utils/placeholder.js
// 占位对齐纯函数（V2 Phase 3）：视觉章节卡绑定槽位 N 时，保证正文有第 N 个占位
// 语法严格沿用 wechat-format imageSlot 的整段占位（独行 [配图：说明]），渲染层零改动

// 整段占位正则（与 imageSlot 判定同源：行首 [配图：...] 独占一行）
const PLACEHOLDER_RE = /^\[配图[：:][^\]]*\]\s*$/gm;

// 数整段占位数（null/undefined 容错为 0）
export function countPlaceholders(content) {
  return (String(content || '').match(PLACEHOLDER_RE) || []).length;
}

// 保证正文有第 slot 个占位：不足则在文末追加（差几个补几个，幂等）
// slot ≤ 现有数或 <1 时原样返回；label 缺省用「配图」
export function ensurePlaceholder(content, slot, label = '配图') {
  const text = String(content || '');
  const slotNum = Number(slot);
  if (!Number.isInteger(slotNum) || slotNum < 1) return text;
  const current = countPlaceholders(text);
  const missing = slotNum - current;
  if (missing <= 0) return text;
  const safeLabel = String(label).trim().slice(0, 12) || '配图';
  const additions = Array.from({ length: missing }, () => `[配图：${safeLabel}]`).join('\n\n');
  return text.trim() ? `${text}\n\n${additions}` : additions;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（106 个全绿：100 + 6）

- [ ] **Step 5: VisualPanel 接线（三处串行）**

（1）content 从 props 改 defineModel（VisualSuggest 的 :content 绑定不受影响——props 传 defineModel 兼容）：

```js
// 正文双向绑定（V2 Phase 3）：章节卡补占位需要回写正文（模式同 ImageWorkspace）
const contentModel = defineModel('content', { type: String, default: '' });
```

props 声明中删 `content: String,`；模板 VisualSuggest 的 `:content="content"` 改 `:content="contentModel"`。

（2）import 区加：

```js
import { ensurePlaceholder } from '../../utils/placeholder.js'; // 占位对齐（V2 Phase 3）
```

（3）generateSectionCard 内 `await uploadImage(...)` 行**之前**加：

```js
    // 绑定槽位超出正文占位数 → 自动补占位（§11"插入正文"完整语义；确定性操作非 AI 决策）
    contentModel.value = ensurePlaceholder(contentModel.value, cardSlot.value, cardData.title || '章节卡');
```

- [ ] **Step 6: TaskDetail 视觉步 VisualPanel 标签加 v-model:content**

`<VisualPanel :task-id="task.id" :title="title" :summary="summary" :content="content"` 中 `:content="content"` 改为 `v-model:content="content"`。

- [ ] **Step 7: 验证 + 提交**

Run: `npm test`（106 全绿）+ `npm run build`（成功）

```bash
git add frontend/src/utils/placeholder.js frontend/tests/placeholder.test.mjs frontend/src/components/visual/VisualPanel.vue frontend/src/components/TaskDetail.vue
git commit -m "feat(visual): 章节卡绑定槽位自动补正文占位（V2 Phase 3 Task 1）"
```

---

### Task 2: photo-stack 辅图换图入口

**Files:**
- Modify: `frontend/src/components/visual/VisualPanel.vue`（picker target 扩 'card2'）

**Interfaces:**
- Consumes: 既有 VisualImagePicker（弹窗）、photo-stack 布局的 image2Url 消费（渲染层就绪）
- Produces: 章节卡「换辅图」按钮——photo-stack 构图时显示；cardData.image2Url 可选真实第二图

- [ ] **Step 1: VisualPanel 四处小改（串行）**

（1）cardData 声明后加辅图状态（reactive 并入 cardData，装配器无此键运行时添加安全）：

```js
// 辅图（V2 Phase 3）：photo-stack 叠放构图第二图（无则渲染层复用主图）
if (!cardData.image2Url) cardData.image2Url = '';
```

（2）onPick 函数加 card2 分支：

```js
function onPick(img) {
  if (picker.target === 'cover') coverData.imageUrl = img.url;
  else if (picker.target === 'card2') cardData.image2Url = img.url;
  else cardData.imageUrl = img.url;
  picker.show = false;
}
```

（3）refreshImages 默认主图填充块加辅图：

```js
    if (!cardData.image2Url) cardData.image2Url = '';
```

（删除——初始化已在（1），此处不动 refreshImages，避免重复。执行者核实（1）放置位置在 refreshImages 之前即可。）

（4）模板章节卡 btn-row：`📷 换图`按钮后加（photo-stack 时才显示）：

```vue
        <button v-if="composition.section === 'section-photo-stack'" type="button" :disabled="exporting" @click="openPicker('card2')">📷 换辅图</button>
```

- [ ] **Step 2: 验证 + 提交**

Run: `npm test`（106 全绿）+ `npm run build`（成功）；行数复核 VisualPanel ≤218

```bash
git add frontend/src/components/visual/VisualPanel.vue
git commit -m "feat(visual): photo-stack 辅图换图入口（V2 Phase 3 Task 2）"
```

---

### Task 3: 真机端到端验收 + 收尾汇报

**Files:** 无新代码

- [ ] **Step 1: 联调环境**：根目录后台 `node dev-server.mjs` + frontend/ 后台 `npm run dev`

- [ ] **Step 2: Playwright 端到端（指令 §11/§12 完整闭环）**

1. 视觉步：章节卡构图切 photo-stack →「📷 换辅图」出现；上传两张真实图（主/辅）→ 预览双图
2. 取当前正文占位数 N（页面写稿步 textarea 计数）；章节卡绑定图设 N+1 →「生成并绑定」
3. 生成成功后：**切写稿步断言正文末尾新增 `[配图：…]` 占位**（占位数 N+1）
4. 切排版步：**微信预览第 N+1 个占位渲染为章节卡真实 `<img>`**（§12 验收）
5. 生成封面链路回归（封面替换正常）
6. 控制台零错误；npm test 106 全绿 + build 成功收尾

- [ ] **Step 3: 清理临时产物、汇报（修改文件/闭环补缺说明/测试结果/已知问题），停止等验收**

---

## Self-Review 记录

- **Spec 覆盖**：指令 §11 链路（导出→上传→article_images→返回 URL）既有零改动确认；"设置封面"既有；"插入正文"→ Task 1（占位自动对齐 = 绑定 Slot 的完整语义）；§12 微信预览真实图→既有 imageSlot + Task 1 保证占位存在；Phase 3 节"真实图片参与设计"→ Task 2（photo-stack 双真实图）。
- **占位符扫描**：无 TBD；Task 2 Step 1(3) 的"删除"项是执行者自查说明（防重复初始化），非占位符。
- **类型一致性**：`ensurePlaceholder(content, slot, label)` Task 1 产出 = VisualPanel generateSectionCard 消费；`countPlaceholders` = 测试消费；`contentModel` defineModel = TaskDetail `v-model:content` 对接（与 ImageWorkspace 同模式）；picker target 'card2' = onPick 分支与模板按钮一致。
