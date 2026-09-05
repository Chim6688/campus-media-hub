-- 推文工作流建表脚本（在 Supabase Dashboard SQL Editor 中执行）
create extension if not exists "pgcrypto";

-- 任务表
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  theme text not null,                      -- 推文主题
  type text not null default '活动报道',     -- 类型：活动报道/通知公告/人物专访...
  author text not null,                     -- 作者署名
  status text not null default 'writing',   -- writing/typesetting/reviewing/published
  title text not null default '',           -- 推文标题（AI 生成后可改）
  summary text not null default '',         -- 摘要（公众号推送摘要）
  content text not null default '',         -- 正文 Markdown
  comments jsonb not null default '[]',     -- 审核批注 [{by, text, at}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 规范规则表（MVP 存禁用词/敏感词，其余规则内置在代码）
create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- 规则名，如"绝对化用语"
  pattern text not null,                    -- 匹配文本（MVP 用包含匹配，大小写不敏感）
  message text not null,                    -- 命中时的提示语
  severity text not null default 'error',   -- error=阻断流转 / warning=仅提示
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- 内置一批初始禁用词规则（可在线编辑）
insert into rules (name, pattern, message, severity) values
  ('绝对化用语', '最好的', '禁用绝对化用语"最好的"，改为具体描述', 'warning'),
  ('绝对化用语', '第一名', '禁用"第一名"，改为具体事实描述', 'warning'),
  ('低俗用语', '震惊', '标题党词汇"震惊"不建议使用', 'warning'),
  ('称呼规范', '我院', '对外推送统一用学院全称，不用"我院"', 'error'),
  ('称呼规范', '我校', '对外推送统一用学校全称，不用"我校"', 'error');

-- updated_at 自动更新触发器
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before update on tasks
for each row execute function touch_updated_at();

-- ========== v2 增量迁移（幂等，可重复执行） ==========

-- AI 从策划书提取的结构化素材：{name, time, location, target, highlights[], flow[], meaning}
alter table tasks add column if not exists material jsonb not null default '{}';

-- 只读分享链接的随机 token（null = 未生成分享链接，/share/:token 免口令只读）
alter table tasks add column if not exists share_token text;

-- 旧数据迁移：四态 → 三态（"排版中"任务视为还在写稿）
update tasks set status = 'writing' where status = 'typesetting';

-- ========== v3 增量迁移（P0-1/P0-2/P2-6，幂等，可重复执行） ==========

-- P0-1：排版主题（皮肤 id + 令牌覆盖），null = 未自定义（用全局默认）
-- ⚠️ 此条已废弃：theme 列名与 v1 建表的推文主题 text 撞名，if not exists 静默跳过；
-- 排版主题改由 v4 段的 layout_theme 列承担（见 v4 修复说明）
alter table tasks add column if not exists theme jsonb;

-- P0-2：整改清单 [{id, text, done, at}]，默认空数组（旧任务不阻塞流转）
alter table tasks add column if not exists review_checklist jsonb not null default '[]';

-- ========== v4 增量迁移（P2-6 排版主题字段分离修复，幂等，可重复执行） ==========
-- 修复说明：v3 想建的排版主题列 theme jsonb 与 v1 的推文主题 theme text 撞名，
-- add column if not exists 静默跳过导致列未建成；PostgREST 把排版主题对象
-- 字符串化写入 theme text 列，覆盖了推文主题。本段分离到独立列 layout_theme。

-- P2-6：排版主题独立列（{id, overrides}），null = 未自定义（用全局默认/ localStorage 回退）
alter table tasks add column if not exists layout_theme jsonb;

-- 安全 JSON 转换：非法 JSON 返回 null 而非报错（数据修复容错用，幂等）
create or replace function try_jsonb(t text) returns jsonb language plpgsql immutable as $$
begin
  return t::jsonb;
exception when others then return null;
end $$;

-- 数据修复：被误存进 theme 的排版 JSON（含 id 键的对象串）挪到 layout_theme，theme 恢复占位
-- 条件含 layout_theme is null：已迁移/已自定义的行不覆盖，保证幂等
update tasks set
  layout_theme = try_jsonb(theme),
  theme = '主题待补'
where theme like '{%' and try_jsonb(theme) ? 'id' and layout_theme is null;

-- ========== v5 增量迁移（V1.0 Phase 2 图片系统，幂等，可重复执行） ==========
-- 图片元数据表：文件在 Storage，表只存 URL 与绑定关系（图片二进制绝不进 tasks）
create table if not exists article_images (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,  -- 任务删除时图片记录级联清理
  url text not null,
  type text not null check (type in ('cover', 'content')),      -- cover=封面 content=正文配图
  position int not null default 0,                               -- 正文图片顺序（封面恒为 0）
  caption text,                                                  -- 图片说明（对应 [配图：xxx] 占位）
  source text not null default 'upload' check (source in ('upload', 'ai')), -- 来源：上传或 AI 生成
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_article_images_task on article_images(task_id);

-- updated_at 自动更新（复用 v1 已建的 touch_updated_at 函数；PG 无 create trigger if not exists，用 drop+create 保证幂等）
drop trigger if exists article_images_touch on article_images;
create trigger article_images_touch before update on article_images
for each row execute function touch_updated_at();

-- Storage bucket：public 读（公众号预览 <img> 直读），写走 service_role（函数层口令门）
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;
