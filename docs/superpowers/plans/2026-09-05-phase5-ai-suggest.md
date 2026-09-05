# Phase 5 AI 图片建议 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 分析文章 → 推荐配图位置/画面内容/理由 → 小编确认后应用到配图计划（§14/§19）。AI 只建议，最终由小编决定。

**Architecture:** 后端加 `image_suggestions` prompt（契约测试 TDD）；前端 ImageWorkspace 加「✨ AI 推荐配图」：调 /api/ai → 展示建议列表 → 「应用到配图计划」写 photoNotes（槽位建议随之更新）→ 「补占位到正文」把缺失占位均匀插入正文段落间（可 Ctrl+Z 撤销）。TaskDetail 传 title/summary/content/material 给 ImageWorkspace。

**Tech Stack:** prompts.mjs 契约测试（node:test）+ Vue defineModel 双向 + Playwright E2E（真实 AI 调用）。

## Global Constraints

- AI 输出 JSON：`[{position, description, reason}]`（§14）；position 从 1 起
- AI 不自动改任何数据：应用建议必须小编点按钮（§19 AI 是助手不是决策者）
- 补占位为确定性纯函数（均匀插入段落间），可撤销

---

### Task 1: image_suggestions prompt（TDD）
- Create `backend/functions/tests/image-suggestions.test.mjs`（契约：存在/双消息/输入字段/JSON 输出要求）
- Modify `backend/functions/lib/prompts.mjs` 加 action

### Task 2: 前端 utils/images.js 补占位纯函数（TDD）
- `insertMissingPlaceholders(content, descriptions)` → 缺失占位均匀插入段落间的新正文
- 测试：无缺失不动；2 缺失插 2 处；空正文/无段落容错

### Task 3: ImageWorkspace AI 建议 UI + TaskDetail 传参
- props 加 title/summary/content/material；defineModel('content')
- AI 推荐按钮 + 建议列表 + 应用到配图计划 + 补占位到正文
- TaskDetail 传 :title/:summary/:content/:material + v-model:content

### Task 4: E2E 验证（真实 AI 调用）+ §31 汇报暂停
