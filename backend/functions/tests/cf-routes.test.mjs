// CF 适配层路由一致性测试（总方案 §11）：backend/functions 的 API 函数集合 = 生产 HANDLERS 集合
// 防止「本地 dev-server 能访问 /api/xxx、生产(Cloudflare Pages)却 404」——
// dev-server 按文件名自动发现函数，CF 适配层是静态映射（esbuild 动态 import 不可靠），
// 新增函数漏注册会在本测试直接红，而不是上线后才暴露
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 直接 import CF 适配层（顶层只加载模块、不触 process/env，可安全单测）
// 文件路径含 [[path]] 方括号，Node ESM 按字面处理，非 glob
import { HANDLERS } from '../../../functions/api/[[path]].js';

// backend/functions 下所有 API 入口文件（排除 lib/、tests/）
const FUNC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiFiles = readdirSync(FUNC_DIR)
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => f.replace(/\.mjs$/, '')) // tasks.mjs → tasks；parse-pdf.mjs → parse-pdf（与 dev-server loadHandler 同规则）
  .sort();

const registered = Object.keys(HANDLERS).sort();

test('CF 适配层注册表覆盖全部后端函数（新增函数漏注册即红）', () => {
  const missing = apiFiles.filter((f) => !registered.includes(f));
  const extra = registered.filter((r) => !apiFiles.includes(r));
  assert.deepEqual(missing, [], `以下函数未注册进 functions/api/[[path]].js 的 HANDLERS，生产会 404：${missing.join(', ')}`);
  assert.deepEqual(extra, [], `HANDLERS 含不存在的函数文件（可能已删除，请清理注册）：${extra.join(', ')}`);
  assert.deepEqual(apiFiles, registered);
});

test('注册表包含全部线上路由（tasks/ai/check/share/images/verify/parse-pdf）', () => {
  for (const k of ['tasks', 'ai', 'check', 'share', 'images', 'verify', 'parse-pdf']) {
    assert.ok(HANDLERS[k], `缺少线上路由 ${k}`);
  }
});
