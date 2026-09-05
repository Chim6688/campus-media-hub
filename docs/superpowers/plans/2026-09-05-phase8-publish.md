# Phase 8 发布准备 · 实施计划（V1.0 收官）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §23 人工发布方式落地：审核通过（published）后，审核步显示"发布准备"面板——[📋 复制文章] [⬇ 获取全部图片] [↗ 打开微信公众号后台]，按 §23 流程完成公众号人工发布。

**Architecture:** 纯前端，仅改 TaskDetail.vue 审核步。复制复用 copyToWechat；图片获取用 listImages(task.id) + fetch blob 逐张下载（文件名=位置-说明）；状态已由 Phase 7 审核通过置为 published（即"标记为已发布"），无需新状态。V1.0 不做微信 API 自动发布（§24）。

## Tasks
1. TaskDetail 审核步：published 态发布准备面板（发布四步指引 + 三按钮）
2. E2E（published 任务验证面板/下载链接生成）+ V1.0 全流程端到端总结汇报
