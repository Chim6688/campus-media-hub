# Phase 3 图片上传 / 图片库 / Slot 绑定 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现配图工作台 UI：上传 → 图片库 → 选择 → 绑定槽位，覆盖 §17 全部能力（上传/多图/替换/删除/选择/缩略图/封面/正文图）。

**Architecture:** 纯前端新增四组件（§8 建议拆分）+ client.js 图片 API 封装 + TaskDetail 配图步替换。槽位模型：`article_images.position` 即绑定关系——`0=图片库待选（池）`、`N≥1=第 N 张正文配图`、`type=cover=封面`；换图/移除只 PATCH position，不改正文（§7 解耦原则）。公众号预览内渲染真实图片属 Phase 4（wechat-format 改造）。

**Tech Stack:** Vue 3 defineModel + node:test（纯函数 TDD）+ Playwright E2E。后端零改动（Phase 2 已就绪）。

## Global Constraints

- 不做 AI 图片建议（Phase 5）、不做 wechat-format 真实图渲染（Phase 4）、不换编辑器。
- 小编不手写 slot 标记；绑定关系存 position，替换图片不改正文。
- 新组件自带完整 scoped 样式（ThemeGallery 的遮罩样式靠父级 scoped 泄漏生效，嵌套组件不可复用该技巧）。
- 主要代码段中文注释；文件命名大驼峰组件。

---

### Task 1: utils/images.js 纯函数（TDD）

**Files:** Create `frontend/src/utils/images.js`、`frontend/tests/images.test.mjs`

**Interfaces (Produces):**
- `parsePhotoNotes(text)` → `string[]`（按行拆分配图计划）
- `buildSlots(images, photoNotesText)` → `[{ position, image|null, suggestion }]`，槽数 = max(计划行数, 最大绑定位置) + 1 个末尾空槽
- `poolImages(images)` → 未绑定正文图（type=content 且 position=0）

- [x] 失败测试 → 实现 → 通过（RED→GREEN）

### Task 2: steps.js 配图完成判定扩展（TDD）

**Files:** Modify `frontend/src/utils/steps.js`、`frontend/tests/steps.test.mjs`

**Interfaces:** `computeSteps(task, contentImagesBound = 0)`——绑定正文图数 >0 也算配图完成（向后兼容默认 0）

- [x] 失败测试 → 实现 → 通过

### Task 3: client.js 图片 API 封装

**Files:** Modify `frontend/src/api/client.js`

- `uploadImage(file, { taskId, type, position, caption })`（multipart，X-Access-Code）
- `listImages(taskId)` / `updateImage(id, { caption?, position? })` / `deleteImage(id)`

### Task 4: 四组件

**Files:**
- Create `frontend/src/components/ImageUploader.vue` — 上传（多选/MIME/5MB 预检/逐张状态），全部传 position=0 入池
- Create `frontend/src/components/ImageSlot.vue` — 槽位：空槽[选择图片][上传]；绑定槽缩略图[换图][移除][删除]
- Create `frontend/src/components/ImageLibrary.vue` — 弹窗网格：缩略图+徽标（封面/第N图/待选）、待选图[选这张]、删除、emit changed
- Create `frontend/src/components/ImageWorkspace.vue` — 封面区+配图计划(defineModel photoNotes)+槽位列表+库入口；绑定=PATCH position

### Task 5: TaskDetail 集成

**Files:** Modify `frontend/src/components/TaskDetail.vue`

- 配图步替换为 `<ImageWorkspace>`（v-model:photo-notes + @bound-change）
- `contentImagesCount` ref 接入 computeSteps；任务切换时清零

### Task 6: 验证与汇报

- [x] build + 前后端全量测试
- [x] Playwright E2E：封面上传→槽位直传→移除→库选回绑→无控制台错误→375px 无横向溢出→API 清理测试数据
- [x] §31 汇报，暂停等待 Phase 4
