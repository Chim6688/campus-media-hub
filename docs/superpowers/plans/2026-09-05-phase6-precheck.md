# Phase 6 发布前检查 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 检查步升级为 §20 发布前检查面板：标题/摘要/正文/事实确认/封面/正文配图/排版/规范检查逐项 ✓，全绿 🟢 可提交审核，有 error 🔴 阻断并明确原因。

**Architecture:** 复用 rules-engine（封面 warning→error；新增事实确认检查）；前端 precheck 纯函数汇总本地可算项 + 后端 report；素材面板加"已核实"开关（material.confirmed，§15）。

## Tasks
1. **后端 rules-engine（TDD）**：封面缺失→error；有素材但 material.confirmed!==true→error（事实确认，§15）
2. **前端 precheck.js（TDD）**：`buildPrecheck(task, {coverOk, boundCount, report})` → 8 项清单（ok/hint）
3. **接线**：ImageWorkspace emit cover-change；素材面板加"已核实"checkbox；检查步 UI 改造为发布前检查面板
4. **E2E + §31 汇报暂停**
