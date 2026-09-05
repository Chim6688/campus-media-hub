# 响应式适配（手机可用）· 实施计划（C 批 / 模板生产线收尾）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 站点在手机（375px 级视口）上全视图可用——列表页/详情页/画廊/弹窗/分享页无横向滚动、按钮可点、编辑预览可上下布局使用，NeuraPress 式「碎片时间用手机看稿选模板」场景落地。

**Architecture:** 纯 CSS 增量批：统一 @768px 断点（与 TaskDetail 既有断点一致），全部用 `flex-wrap`/`grid 单列化`/间距收缩三种手法，零 JS 改动、零逻辑改动、零新依赖。验证标准唯一且客观：375px 视口下各视图 `document.documentElement.scrollWidth ≤ innerWidth`（无横向溢出）+ 功能按钮全部可点。

**Tech Stack:** CSS media query / Vue 3 scoped style / Playwright 375×812 视口验证（无新依赖）

## Global Constraints（红线，每个任务隐含遵守）

1. 只改样式，不改任何模板结构/script/逻辑/文案——本批是「让现有 UI 在窄屏不破」
2. 断点统一 `@media (max-width: 768px)`，与 TaskDetail.vue L986 既有断点对齐
3. 不引入 JS 断点检测库、不引入 CSS 框架；不使用 container queries（微信无关，但保持简单）
4. 既有 18 项前端测试 + 11 项后端测试必须保持全绿（CSS 不应影响它们，跑通即回归证明）
5. 验证金标准：375px 视口 `scrollWidth ≤ innerWidth + 1`；次标准：按钮无重叠遮挡（截图目测）
6. 注释规范：新增样式块带简明中文注释
7. PowerShell 5.1：不支持 `&&`（用 `;`）；**同一文件多处 Edit 必须串行执行**
8. 部署后用户线上手机验收通过才算交付完成

## 现状关键事实（执行者必读，已逐行核对）

- `frontend/index.html`：已有标准 viewport meta ✓
- `frontend/src/App.vue` L85：`.page { max-width: 1080px; margin: 40px auto; padding: 0 16px; }`——移动端 40px 上下边距浪费，且无 @media
- `frontend/src/components/TaskList.vue` L120-135：
  - `.new-task { display: flex; gap: 8px; margin-bottom: 16px; }` **无 wrap**——input+select+input+button 四件套在 375px 必溢出
  - `.task-list li { display: flex; align-items: center; gap: 12px; ... }` **无 wrap**——标题+meta+按钮同行挤压
  - `.filters` 已有 `flex-wrap: wrap` ✓ 天然适配
- `frontend/src/components/TaskDetail.vue`：
  - L986-989 既有唯一断点：`.editor-split` 折叠为纵向 + `.preview-body` max-height 480px ✓
  - `.detail-head`（L913）flex 无 wrap：返回按钮+长标题+状态标签
  - `.toolbar`（L949）flex 无 wrap：保存/规范检查/推进/打回/分享 5 按钮+已保存时间——**移动端必溢出（最痛）**
  - `.preview-header`（L942）flex 无 wrap：皮肤下拉+画廊+调参数+复制 4 控件
  - `.ai-toolbar`（L952）flex 无 wrap：4 个 AI 按钮
  - `.param-panel`（L993）grid 2 列——窄屏单行内 64px 标签+滑杆+数值过挤，应单列化
  - `.material-fields`（L932）grid `100px 1fr`——可用但单列更稳
  - `.modal`（L970）`width: min(420px, 90vw)` ✓ 已适配
  - `.steps-bar`（L1012）`flex-wrap: wrap` ✓
- `frontend/src/components/ThemeGallery.vue`：`.gallery-modal { width: min(92vw, 1080px); max-height: 86vh; overflow: auto; }` + grid `auto-fill minmax(300px,1fr)`——**天然单列适配 ✓ 无需改动**
- `frontend/src/components/ShareView.vue`：纯文档流 + `.article` 内部 section `max-width:100%`——**基本适配 ✓ 无需改动**
- 弹窗族（modal-mask 居中 flex）✓ 天然适配

---

## Task 1: 列表页 + 全局容器适配（子代理执行）

**Files:**
- Modify: `frontend/src/components/TaskList.vue`（scoped style 末尾追加）
- Modify: `frontend/src/App.vue`（scoped style 末尾追加）

**Interfaces:** 无接口产出，纯样式。

- [ ] **Step 1: TaskList.vue style 末尾追加移动端块**

```css
/* 移动端（C 批）：新建表单与列表行换行，防 375px 横向溢出 */
@media (max-width: 768px) {
  .new-task { flex-wrap: wrap; }
  .new-task input, .new-task select { min-width: 140px; } /* 换行后控件不被压扁 */
  .new-task button { flex: 1; } /* 按钮独占行尾，方便点按 */
  .task-list li { flex-wrap: wrap; } /* 长标题占满首行，meta+按钮自然落到次行 */
}
```

- [ ] **Step 2: App.vue style 末尾追加**

```css
/* 移动端（C 批）：压缩页面上下留白，把屏幕让给内容 */
@media (max-width: 768px) {
  .page { margin: 16px auto; }
}
```

- [ ] **Step 3: 构建 + 全量测试（回归证明）**

```bash
cd frontend; npm run build
```
Expected: `✓ built in`（忽略沙箱报错）

```bash
cd frontend; npm run test
```
Expected: 18 项全 PASS（CSS 改动不影响逻辑测试）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TaskList.vue frontend/src/App.vue
git commit -m "feat(响应式): 列表页表单/列表行换行+页面留白压缩（375px 无横向溢出）"
```

---

## Task 2: 详情页适配（子代理执行）

**Files:**
- Modify: `frontend/src/components/TaskDetail.vue`（扩展 L986 既有 @media 块 + param-panel/material-fields 补规则）

**Interfaces:** 无接口产出，纯样式。

- [ ] **Step 1: 扩展既有 @media 块（L986-989，Edit 串行）**

将：

```css
/* 窄屏：编辑与预览改为上下布局 */
@media (max-width: 768px) {
  .editor-split { flex-direction: column; }
  .preview-body { max-height: 480px; }
}
```

替换为：

```css
/* 窄屏：编辑与预览改为上下布局 */
@media (max-width: 768px) {
  .editor-split { flex-direction: column; }
  .preview-body { max-height: 480px; }
  /* C 批：工具条/预览头/AI工具条/详情头换行，多按钮不再溢出 */
  .detail-head { flex-wrap: wrap; }
  .toolbar { flex-wrap: wrap; }
  .preview-header { flex-wrap: wrap; }
  .ai-toolbar { flex-wrap: wrap; }
}
```

- [ ] **Step 2: param-panel 与 material-fields 单列化（紧跟上面 @media 块之后追加第二个 @media 块，与既有代码风格一致分段注释）**

```css
/* 窄屏（C 批）：参数面板与素材字段单列化，标签+滑杆不再同行挤压 */
@media (max-width: 768px) {
  .param-panel { grid-template-columns: 1fr; }
  .material-fields { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: 构建 + 全量测试**

```bash
cd frontend; npm run build
```
Expected: `✓ built in`

```bash
cd frontend; npm run test
```
Expected: 18 项全 PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TaskDetail.vue
git commit -m "feat(响应式): 详情页工具条/预览头/AI条/详情头换行+参数面板素材字段单列化"
```

---

## Task 3: 375px 全视图实测 + 部署 + 线上验收（主会话执行，不派子代理）

- [ ] **Step 1: 本地双服务 + Playwright 375×812 视口实测**

脚本验证清单（`D:/Temp/test_responsive.py`，视口 `{'width': 375, 'height': 812}`）：
1. **列表页**：`scrollWidth ≤ 376`；新建表单换行可见；筛选区正常
2. **详情页**：`scrollWidth ≤ 376`；编辑/预览上下布局；工具条按钮全部可见可点（保存/规范检查/推进/分享）
3. **预览头**：皮肤下拉+画廊+调参数+复制四控件换行可见
4. **画廊弹窗**：打开后 `scrollWidth ≤ 376`，卡片单列，可点选应用
5. **AI 配色弹窗**：打开不溢出，textarea 可输入
6. **分享页**：生成分享链接 → 375px 视口打开 `/share/:token` → `scrollWidth ≤ 376`
7. 回归：402px/768px 临界视口各抽查一次列表+详情

断言函数（每视图复用）：

```python
def assert_no_hscroll(page, label):
    sw = page.evaluate('document.documentElement.scrollWidth')
    iw = page.evaluate('window.innerWidth')
    assert sw <= iw + 1, f'{label} 横向溢出: scrollWidth={sw} > innerWidth={iw}'
    print(f'{label}: 无横向溢出 OK (scrollWidth={sw})')
```

- [ ] **Step 2: 清理测试数据**（service key 清测试任务 layout_theme/share_token/content）

- [ ] **Step 3: 推送部署 + 线上 375px 冒烟（同一脚本指向 netlify 域名）**

```bash
git push origin master
```
等 Netlify deploy ready 后跑线上版脚本。

- [ ] **Step 4: 用户线上手机验收**

手机浏览器打开站点（口令 619）：
1. 列表页：新建表单/筛选/任务列表无横向滚动，推进按钮可点
2. 详情页：上下布局看稿，AI 按钮/保存/复制全可用，画廊单列浏览选肤
3. 分享链接在手机微信里打开排版正常
4. 回归红线：复制到公众号、AI 配色、旧任务、口令门禁正常

---

## Self-Review 记录

- 规格覆盖：列表页+App→Task 1；详情页全部破绽（toolbar/preview-header/ai-toolbar/detail-head/param-panel/material-fields）→Task 2；全视图实测+部署验收→Task 3；画廊/分享页侦察确认天然适配无需改动（验证仍覆盖）✓
- 占位符扫描：无 TBD/TODO，全部代码完整（CSS 块逐条给出）✓
- 类型一致性：本批无接口产出；类名与现状核对一致（.new-task/.task-list li/.detail-head/.toolbar/.preview-header/.ai-toolbar/.param-panel/.material-fields 均为现存类）✓
- 风险：wrap 后按钮组可能视觉分散——验证步骤含截图目测；若按钮过散可在验收后微调 gap（不阻塞本批）
