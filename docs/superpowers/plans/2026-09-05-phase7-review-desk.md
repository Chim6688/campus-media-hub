# Phase 7 审核工作台 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ShareView 从只读页升级为审核工作台（§22 线框）：左=完整公众号预览，右=检查结果+审核意见+[退回修改][审核通过]。审核人不进编辑界面。

**Architecture:** 分享页免口令 → 审核写操作走 **share_token 认证**的 `POST /api/share`（不复用需口令的 /api/tasks）。GET 补充返回 report（runChecks 结果）。审核操作仅限 reviewing 状态；退回生成整改清单（复用 P0-2 格式）；批注 by=审核人。前端复用 buildPrecheck 八项清单。

## Tasks
1. **后端（TDD）**：`lib/review.mjs` 纯函数 `validateShareAction(task, action)`（approve/reject 仅 reviewing；comment 任意状态）；share.mjs 扩展 POST（approve→published / reject→writing+清单 / comment→追加批注）+ GET 带 report
2. **前端 ShareView**：两栏工作台（预览 | 八项检查+批注+通过/退回）；退回弹窗录清单（AI 整理复用 /api/ai? 免口令问题——AI 需口令，分享页手写清单即可）
3. **E2E + §31 汇报暂停**

## 安全边界
- token 16 位随机串仅发审核人；写操作限该任务且限 reviewing 态；comment 任意态（低风险）
- AI 整理能力在分享页不可用（需口令），退回清单手动逐行
