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
alter table tasks add column if not exists theme jsonb;

-- P0-2：整改清单 [{id, text, done, at}]，默认空数组（旧任务不阻塞流转）
alter table tasks add column if not exists review_checklist jsonb not null default '[]';
