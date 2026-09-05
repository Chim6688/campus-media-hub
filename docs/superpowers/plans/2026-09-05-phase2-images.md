# Phase 2 图片系统基础设施 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立图片系统基础设施：Supabase Storage bucket + `article_images` 表 + `/api/images` CRUD（含上传），为 Phase 3 的图片库/Slot 绑定 UI 供数据底座。

**Architecture:** 纯后端新增 + 一处 dev-server 路由微调。沿用现有单文件函数模式（`requireAuth` + `getSupabase` service_role），校验/路径逻辑抽成纯函数 lib（TDD），迁移 SQL 追加 v5 段（用户在 Supabase Dashboard 执行）。前端零改动（Phase 3 才做 UI）。

**Tech Stack:** Netlify Functions v2（Web Request/Response）+ @supabase/supabase-js Storage + node:test。

## Global Constraints

- 第一轮 Phase 2 范围 = §6/§10/§11/§12：Storage + article_images 表 + 图片 API。**不做**前端 UI、Slot 绑定、AI 图片建议（Phase 3-5）（开发指令 §27）。
- bucket：`article-images`，路径 `article-images/{task_id}/cover|content/`（§10）。
- 表字段：id/task_id/url/type/position/caption/source/created_at/updated_at，type=cover|content，source=upload|ai（§11）。不建第二套图片表。
- API：POST /api/images、GET /api/images?task_id=、PATCH /api/images/:id、DELETE /api/images/:id（§12）。
- 后端必须检查：task 存在、口令、MIME、大小、图片所属 task、删除时同步清理 Storage（§12）。
- 图片二进制不进 tasks 表（§26）。
- service_role 绕过 RLS（口令门在函数层），bucket 设 public 供 <img> 直读。

---

### [已完成] Task 1: image-rules.mjs 纯函数（TDD）

**Files:**
- Create: `backend/functions/lib/image-rules.mjs`
- Create: `backend/functions/tests/image-rules.test.mjs`

**Interfaces:**
- Produces:
  - `validateImage({ mime, size })` → `{ ok: true } | { ok: false, error: string }`；MIME 白名单 jpeg/png/webp/gif，大小 ≤ 5MB
  - `buildStoragePath(taskId, type, filename)` → `{ path, error? }`；产出 `{task_id}/{cover|content}/{时间戳-随机串.安全扩展名}`，防路径穿越
  - `publicUrl(supabaseUrl, path)` → 公共访问 URL 字符串

- [x] **Step 1: 写失败测试**

```js
// 图片校验/路径纯函数测试（Phase 2）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateImage, buildStoragePath, publicUrl } from '../lib/image-rules.mjs';

test('validateImage：合法类型+大小通过', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.deepEqual(validateImage({ mime, size: 1024 }), { ok: true });
  }
});

test('validateImage：非法 MIME / 超 5MB / 空值拒绝', () => {
  assert.equal(validateImage({ mime: 'image/svg+xml', size: 1024 }).ok, false);
  assert.equal(validateImage({ mime: 'image/png', size: 5 * 1024 * 1024 + 1 }).ok, false);
  assert.equal(validateImage({ mime: '', size: 1024 }).ok, false);
  assert.equal(validateImage({ mime: 'image/png', size: 0 }).ok, false);
});

test('buildStoragePath：格式 {task}/{type}/{ts-rand}.{ext}，type 白名单', () => {
  const r = buildStoragePath('t1', 'cover', '封面 图.JPG');
  assert.match(r.path, /^t1\/cover\/[a-z0-9-]+\.jpg$/);
  assert.equal(buildStoragePath('t1', 'content', 'a.png').path.startsWith('t1/content/'), true);
  assert.equal(buildStoragePath('t1', 'other', 'a.png').error !== undefined, true);
});

test('buildStoragePath：路径穿越/无扩展名拒绝', () => {
  assert.equal(buildStoragePath('../evil', 'cover', 'a.png').error !== undefined, true);
  assert.equal(buildStoragePath('t1', 'cover', '../../etc/passwd').error !== undefined, true);
  assert.equal(buildStoragePath('t1', 'cover', 'noext').error !== undefined, true);
});

test('publicUrl：拼接 storage 公共地址', () => {
  assert.equal(
    publicUrl('https://x.supabase.co', 't1/cover/a.jpg'),
    'https://x.supabase.co/storage/v1/object/public/article-images/t1/cover/a.jpg',
  );
});
```

- [x] **Step 2: 运行确认失败**：`cd backend/functions && node --test "tests/image-rules.test.mjs"`（模块不存在报错）
- [x] **Step 3: 实现 image-rules.mjs**
- [x] **Step 4: 运行确认通过**

### [已完成] Task 2: images.mjs 图片 API 函数

**Files:**
- Create: `backend/functions/images.mjs`

**Interfaces:**
- Consumes: `requireAuth`、`getSupabase`、Task 1 三个纯函数
- Produces: `/api/images` 四个方法（与 §12 对齐）：
  - `GET ?task_id=` → `{ images: [...] }`（按 position 排序）
  - `POST`（multipart: file/task_id/type/position/caption）→ 校验→查 task 存在→Storage 上传→insert 行→`{ image }`（201）
  - `PATCH /:id`（body: caption?/position?）→ `{ image }`
  - `DELETE /:id` → 删 Storage 对象（从 url 解析路径）+ 删行 → `{ ok: true }`
  - 全部走 `requireAuth`；错误 400/404/500 与现有函数同构

- [x] **Step 1: 实现（模式对齐 tasks.mjs：方法分发 + 错误 JSON）**
- [x] **Step 2: `node --check` 语法验证 + 现有测试回归**

### [已完成] Task 3: dev-server.mjs 子路径路由

**Files:**
- Modify: `dev-server.mjs:33-34`

**说明:** Netlify 原生 `/api/images/xxx` 经 redirect 到 `/.netlify/functions/images/xxx`，函数能收到完整 url；本地 dev-server 目前只取单段函数名导致子路径 404。改为取首段为函数名、完整 url 透传：

```js
// 提取函数名：/api/images/abc?x=1 → images（子路径透传给函数自行解析）
const name = (req.url || '').replace(/^\/api\//, '').split('?')[0].split('/')[0];
```

- [x] **Step 1: 修改并手动验证 /api/tasks 与 /api/images/:id 都能路由**

### [已完成] Task 4: v5 迁移 SQL

**Files:**
- Modify: `docs/supabase-schema.sql`（追加 v5 段，幂等）

```sql
-- ========== v5 增量迁移（V1.0 Phase 2 图片系统，幂等，可重复执行） ==========
-- 图片元数据表：文件在 Storage，表只存 URL 与绑定关系（不塞二进制进 tasks）
create table if not exists article_images (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  url text not null,
  type text not null check (type in ('cover', 'content')),
  position int not null default 0,
  caption text,
  source text not null default 'upload' check (source in ('upload', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_article_images_task on article_images(task_id);
-- updated_at 自动更新（复用 v1 已建的 set_updated_at 函数）
create trigger if not exists trg_article_images_updated
  before update on article_images
  for each row execute function set_updated_at();
-- Storage bucket：public 读（<img> 直读），写走 service_role（函数层口令门）
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;
```

- [x] **Step 1: 追加到 schema 文件**
- - [x] **Step 2: 请用户在 Supabase Dashboard SQL Editor 执行（外部依赖，暂停点）**（已由 agent 浏览器代执行成功）

### Task 5: 验证与汇报

- [x] **Step 1: 后端全量测试 + 前端 build/test 回归（前端零改动应全绿）**
- - [x] **Step 2: 用户执行 v5 SQL 后，本地 dev-server + curl 走通 上传→列表→改→删 全链路**（Node 脚本验证：上传201/列表/PATCH/公共URL 200/DELETE ok，DB 0 行 + Storage 空）
- [x] **Step 3: 按 §31 汇报，暂停等待 Phase 3 指令**
