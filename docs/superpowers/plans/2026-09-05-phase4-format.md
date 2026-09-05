# Phase 4 Markdown 图片 Slot + WeChat Format · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文章内容 + 槽位绑定图片 + 真实图片 URL = 最终公众号 HTML；编辑器预览、复制到公众号、审核分享页三端同一套图片数据（§13/§18）。

**Architecture:** 沿用 Phase 3 槽位模型：正文中第 N 个整段 `[配图：说明]` 占位 = 槽位 N。wechat-format 渲染时按 position 映射：已绑定 → 真实 `<img>`；未绑定 → 保留占位并显示缺图提示。规则引擎升级：占位未绑定图 → error（§13 发布前检查必须能发现）；无封面 → warning（Phase 6 再升 error）。分享接口带出图片数据。

**Tech Stack:** 纯函数 TDD（前端 wechat-format / 后端 rules-engine）+ 少量接线改动。

## Global Constraints

- 不引入 `<!-- IMAGE:slot-N -->` 新标记体系：复用既有 `[配图：xxx]` 占位（Phase 3 槽位模型已解耦，正文零改动即满足 §7）
- 行内小占位（非整段）保持装饰性标签不变，只有整段占位映射槽位
- 预览、复制、分享三端用同一 markdownToWechatHTML + 同一 images 数据
- 未绑定槽位不许渲染假图；显示明确缺图提示

---

### Task 1: wechat-format.js 真实图片渲染（TDD）
- Create 测试用例：绑定图渲染 `<img src>`+caption；未绑定显示"未绑定图片"提示且保留 📷 前缀（旧断言兼容）；position 稀疏时第 N 个占位查 position=N
- Modify `frontend/src/utils/wechat-format.js`：`opts.images`（{position,url,caption}[]）→ Map；`imagePlaceholder` 拆为 `imageSlot(theme, desc, img|null)`

### Task 2: rules-engine 缺图检查（TDD）
- Modify `backend/functions/lib/rules-engine.mjs`：runChecks 查 article_images（有 task.id 时）；占位数>绑定数 → error；无封面 → warning
- Modify 既有测试：fakeDb 支持按表返回（rules 空、article_images 带图）

### Task 3: 分享页同源
- Modify `backend/functions/share.mjs`：响应加 `images`（封面+绑定正文图）
- Modify `frontend/src/components/ShareView.vue`：传 opts.images

### Task 4: TaskDetail 接线
- Modify `frontend/src/components/ImageWorkspace.vue`：bound-change 改为 emit 绑定图数组（按 position 排序）
- Modify `frontend/src/components/TaskDetail.vue`：boundImages ref；contentImagesCount=computed 长度；wechatHTML 传 images

### Task 5: 验证汇报
- build + 全量测试 + 浏览器验证（占位→绑定→预览出现 img）+ §31 汇报暂停
