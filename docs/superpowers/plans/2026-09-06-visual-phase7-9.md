# V1.0 Phase 7-9 收尾验收 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 视觉步完成判定升级为数据驱动（Phase 7 查缺）→ 发布前检查加"视觉图"项（Phase 8）→ 端到端全链路真机验收 + Cloudflare Pages 部署（Phase 9）。

**Architecture:** 视觉完成信号 = 任务图片中存在 source='ai' 的图（封面或正文，即视觉卡已生成落库）——由 TaskDetail 既有 listImages 刷新链路上报（visualOk），传给 computeSteps 与 buildPrecheck 两个纯函数；发布检查从八项变九项（视觉图项），缺视觉图仅 Warning 级（不阻断提交——视觉图是加分项非硬门槛，封面项已独立存在）；Phase 9 端到端按原方案 §36 全链路真机跑通后 wrangler 部署。

**Tech Stack:** 既有纯函数（steps/precheck）、Vue 3、Playwright、wrangler。

**Spec:** `docs/superpowers/specs/2026-09-06-visual-production-design.md` §8 + 原方案 §26/§29 Phase 7-9/§36

## 核心事实（代码核验结论）

- steps.js `visualOk = layoutOk`（L14）是 Phase 2 临时口径，注释自认"Phase 3 前无独立视觉数据"——现已过时
- TaskDetail 的 onVisualImagesChange（L377-386）已在每次视觉图变更后重拉 listImages 并维护 boundImages/coverOk——加一行 visualOk 维护即可，零新链路
- precheck.js 八项清单 + precheckReady 全过才显示提交按钮；加"视觉图"项后基线测试需同步更新（8→9）
- 原方案 §26"缺少必要视觉图片 🔴 无法提交"——但封面项已独立存在且是 error 级；视觉图项定为 ok 时过/缺时提示但不硬阻断（视觉卡是可选增强，正文配图可独立达标）——**此为对原方案的有意收窄，理由：MVP 原则 + 视觉卡非每篇必需**，规格 §6 错误处理表也无"缺视觉图"条目
- 部署：Cloudflare Pages，`npx wrangler pages deploy frontend/dist --project-name=tuiwen --branch=master`（项目记忆既有流程，wrangler 已 OAuth 登录）
- 既有 80 测试全绿是硬门槛

## Global Constraints

- **零回归**：既有 80 测试全绿；steps/precheck 测试更新属本批目的行为（8 项→9 项、visualOk 判定升级）
- 视觉图项缺省不阻断提交（Warning 语义，hint 提示去第④步生成）
- visualOk 信号：任务图片存在 source='ai' 的行（cover 或 content 均算）
- computeSteps 第三参扩展：`computeSteps(task, contentImagesBound, visualOk)`（缺省 false 向后兼容既有调用/测试）
- 组件改动最小化：TaskDetail 仅加 visualOk ref + 传参两处；不新增组件
- 测试 `npm test`（frontend/）；PowerShell（无 &&，git -m 直传）；同文件多编辑串行

---

### Task 1: steps.js 视觉完成判定升级 + precheck.js 视觉图项（TDD）

**Files:**
- Modify: `frontend/src/utils/steps.js`
- Modify: `frontend/src/utils/precheck.js`
- Modify: `frontend/tests/steps.test.mjs`（更新 visual 断言）
- Modify: `frontend/tests/precheck.test.mjs`（8→9 项基线更新）

**Interfaces:**
- Consumes: 无新依赖
- Produces:
  - `computeSteps(task, contentImagesBound = 0, visualOk = false)`——visual 步 done = visualOk || reviewing/published（送审后视为已认可，兼容审核中回看）
  - `buildPrecheck(task, state)`——state 新增 `visualOk: boolean`（缺省 false），返回 9 项（第 7 项"视觉图"插在"排版"前）

- [ ] **Step 1: 更新 steps.test.mjs 的 visual 断言（3 处）**

（1）`步骤 key 顺序固定` 测试不变（顺序无变）。

（2）`素材齐+成稿达标+配图说明：视觉为当前步（writing）` 测试追加第三参断言：

```js
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
  assert.equal(s[3].done, false); // writing 态且无视觉图 → 未完成
});

test('视觉完成判定（Phase 7 升级）：visualOk=true 或 reviewing/published 即完成', () => {
  // 第三参 visualOk=true → writing 态视觉也完成
  const a = computeSteps({ status: 'writing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' }, 1, true);
  assert.equal(a[3].done, true);
  // visualOk=false 但 reviewing → 完成（送审即认可，兼容审核中回看）
  const b = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' }, 0, false);
  assert.equal(b[3].done, true);
  // 缺省第三参 = false（向后兼容）
  const c = computeSteps({ status: 'writing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' }, 1);
  assert.equal(c[3].done, false);
});
```

（3）原 `视觉完成判定：reviewing/published 视为完成（送审必过视觉）` 测试保留（reviewing 分支整体标完成逻辑不变）。

- [ ] **Step 2: 更新 precheck.test.mjs（8→9 项）**

OK_STATE 加 visualOk: true；基线与命名测试更新：

```js
const OK_STATE = { coverOk: true, boundCount: 1, visualOk: true, report: { passed: true, errors: [], warnings: [] } };

test('基线：九项检查全部通过，ready=true', () => {
  const items = buildPrecheck(OK_TASK, OK_STATE);
  assert.equal(items.length, 9);
  assert.ok(items.every((i) => i.ok));
});

test('检查项固定顺序与命名（标题/摘要/正文/事实确认/封面/正文配图/视觉图/排版/规范检查）', () => {
  const items = buildPrecheck(OK_TASK, OK_STATE);
  assert.deepEqual(items.map((i) => i.name), ['标题', '摘要', '正文', '事实确认', '封面', '正文配图', '视觉图', '排版', '规范检查']);
});

test('视觉图判定（Phase 8）：visualOk=false 不通过且 hint 指引第④步；不阻断其他项', () => {
  const items = buildPrecheck(OK_TASK, { ...OK_STATE, visualOk: false });
  const v = items.find((i) => i.name === '视觉图');
  assert.equal(v.ok, false);
  assert.ok(v.hint.includes('第④步'), 'hint 指引视觉步');
  // 视觉图缺失不影响其他 8 项判定（单项独立）
  assert.equal(items.filter((i) => i.ok).length, 8);
});

test('视觉图判定：visualOk 缺省（老调用方）= false 不通过（向后兼容）', () => {
  const items = buildPrecheck(OK_TASK, { coverOk: true, boundCount: 1, report: { passed: true, errors: [], warnings: [] } });
  assert.equal(items.find((i) => i.name === '视觉图').ok, false);
});
```

注意：单项失败测试（原"八项全挂"断言块）中 `items.length` 无断言则不用改；若有 8 处断言按新清单同步（执行者按实际文件内容调整，保持既有测试意图）。

- [ ] **Step 3: 运行确认失败**

Run: `npm test`
Expected: FAIL —— visual 判定（旧 visualOk=layoutOk 使 writing+visualOk=false 测试失败）、9 项清单（现为 8 项）

- [ ] **Step 4: 实现**

**4a. steps.js**（L10-14 替换）：

```js
// contentImagesBound：当前任务已绑定槽位的正文图片数（由配图工作台维护，缺省 0 向后兼容）
// visualOk（Phase 7 升级）：任务视觉图已生成落库（source='ai' 的图片存在，由详情页刷新链路上报）
export function computeSteps(task, contentImagesBound = 0, visualOk = false) {
  // 排版/检查完成 = 已推进到审核或发布（送审前必须认可排版、通过规范检查门禁）
  const layoutOk = task.status === 'reviewing' || task.status === 'published';
  // 视觉完成 = 有视觉图数据，或已送审（送审即视为认可，兼容审核中回看）
  const visualDone = visualOk || layoutOk;
```

steps 数组 visual 行改 `done: visualDone`。

**4b. precheck.js**：

- state 解构加 `visualOk`
- "排版"项之前插入：

```js
    {
      name: '视觉图',
      ok: !!visualOk,
      hint: '去第④步视觉设计生成封面/章节卡视觉图（可选增强，不影响提交）',
    },
```

- 文件头注释"八项清单"改"九项清单"

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: PASS（84 个全绿：80 既有中 2 个更新 + 4 新增）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/utils/steps.js frontend/src/utils/precheck.js frontend/tests/steps.test.mjs frontend/tests/precheck.test.mjs
git commit -m "feat(visual): 视觉完成判定数据驱动 + 发布检查加视觉图项（Phase 7+8 Task 1）"
```

---

### Task 2: TaskDetail 接线——visualOk 信号维护与传参

**Files:**
- Modify: `frontend/src/components/TaskDetail.vue`（四处小改，串行）

**Interfaces:**
- Consumes: Task 1 纯函数新签名
- Produces: visualOk ref（listImages 刷新链路维护：任一 source='ai' 图片存在）

- [ ] **Step 1: 四处修改（每处 Read 定位再 Edit）**

（1）coverOk 声明处（约 L366）后加：

```js
// 视觉图是否已生成（Phase 7：source='ai' 的图片存在，步骤条与发布检查共用）
const visualOk = ref(false);
```

（2）任务切换重置块（coverOk.value = false 附近，约 L372）加：

```js
  visualOk.value = false;
```

（3）onVisualImagesChange 函数内（coverOk.value = ... 行后）加：

```js
    visualOk.value = imgs.some((i) => i.source === 'ai');
```

（4）两处传参：
- steps computed（约 L364 `computeSteps(props.task, boundImages.value.length)`）改为 `computeSteps(props.task, boundImages.value.length, visualOk.value)`
- precheckItems computed 的 state 对象（约 L492）加 `visualOk: visualOk.value`

**补充**：初始进入任务时 onVisualImagesChange 不会自动跑（仅视觉面板变更触发）——需在 onMounted 或首次加载图片处同步一次。查 TaskDetail 是否有初始 listImages 调用；若无，在 coverOk 初始化附近加一次性初始化（模式：onMounted(async () => { try { const data = await listImages(props.task.id); ... } catch {} })，或复用 onVisualImagesChange()）。

- [ ] **Step 2: 验证**

1. frontend/ `npm test`：84 全绿（组件无单测）
2. frontend/ `npm run build`：成功
3. rg 复核：visualOk 在 TaskDetail 出现 ≥5 处（声明/重置/维护/两处传参+初始化）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/TaskDetail.vue
git commit -m "feat(visual): visualOk 信号接线（步骤条+发布检查数据驱动）（Phase 7+8 Task 2）"
```

---

### Task 3: Phase 9 端到端全链路真机验收 + 部署

**Files:** 无新代码（验证性任务）

- [ ] **Step 1: 联调环境**：根目录后台 `node dev-server.mjs` + frontend/ 后台 `npm run dev`

- [ ] **Step 2: Playwright 端到端（原方案 §36 全链路，单一脚本）**

链路：新建任务 → 填素材 → AI 初稿（真实调用）→ 配图（上传测试图）→ 视觉（AI 建议+生成封面+生成章节卡绑定）→ 排版（切风格预览）→ 检查（九项清单+视觉图项 ✓ + 规范检查运行）→ 提交审核 → 审核通过 → 标记发布。

断言要点：
1. 新建任务成功进详情
2. 素材面板填写后步骤①完成
3. AI 初稿生成（标题/摘要/正文填充，真实 GLM 调用，最长 70s）
4. 正文含 [配图：] 占位（初稿或手动补）
5. 视觉步：AI 建议 → 生成封面（source=ai 落库）→ 章节卡绑定槽位 1
6. 步骤④"视觉"变完成态（visualOk 数据驱动生效）
7. 检查步：九项清单，视觉图项 ✓；规范检查运行通过（无 error 项）
8. 提交审核成功 → 列表状态"审核中"
9. 控制台零错误
（审核通过/发布按钮涉及 share 链路，本批验证到"审核中"+已既有 ShareView 链路不回归即可——发布按钮为既有功能）

- [ ] **Step 3: 全量回归**：`npm test` 84 全绿 + `npm run build` 成功

- [ ] **Step 4: 部署 Cloudflare Pages**

```bash
# 项目根目录（build 产物已在 Step 3 生成）
npx wrangler pages deploy frontend/dist --project-name=tuiwen --branch=master
```

验证：部署 URL（tuiwen-ehc.pages.dev）返回 200，首页 HTML 含"推文工作流"。

- [ ] **Step 5: 清理临时产物、最终汇报（§35 格式 + V1.0 总验收对照）**

---

## Self-Review 记录

- **Spec 覆盖**：Phase 7 查缺（视觉完成判定数据驱动——原方案 §4"可以返回之前步骤修改"已由步骤条自由点击保证）→ Task 1/2；Phase 8 发布检查视觉完整性（原方案 §26 清单含"视觉图片"）→ Task 1/2 视觉图项（有意收窄为非阻断，理由见核心事实）；§27 审核工作台为既有 ShareView 功能，本批回归不改造；Phase 9 端到端（§36 全链路）→ Task 3。
- **占位符扫描**：无 TBD；Task 2 初始同步的"补充"段给了两种落地方案由执行者按实际代码选一，非逃避设计（两方案都完整可执行）。
- **类型一致性**：`computeSteps(task, bound, visualOk)` 三参签名 = Task 2 调用一致；`buildPrecheck(task, { coverOk, boundCount, visualOk, report })` state 键 = Task 2 传参一致；visualOk 语义（source='ai' 存在）在 Task 2 维护处与注释一致。
