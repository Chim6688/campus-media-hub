// 分享/审核接口：GET 免口令查看（审核人）；POST share_token 认证的审核操作（V1.0 Phase 7，§22）
// 安全约束：GET 不返回 comments/material/share_token；POST 写操作限该任务、approve/reject 限 reviewing 态
import { getSupabase } from './lib/supabase.mjs';
import { validateShareAction, buildRejectPatch } from './lib/review.mjs';
import { runChecks } from './lib/rules-engine.mjs';

const headers = { 'Content-Type': 'application/json' };
const err = (msg, status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers });

// 按 token 查任务（含审核操作所需的完整字段；404 统一文案防 token 枚举）
async function findTaskByToken(db, token) {
  const { data: task, error } = await db
    .from('tasks')
    .select('*')
    .eq('share_token', token)
    .single();
  if (error || !task) return null;
  return task;
}

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return err('缺少 token');
  const db = getSupabase();

  // ===== GET：审核工作台数据（任务 + 绑定图片 + 规范检查报告）=====
  if (req.method === 'GET') {
    const task = await findTaskByToken(db, token);
    if (!task) return err('分享链接无效或已过期', 404);

    // 绑定图片（预览同源）；检查报告（审核人看到与作者一致的检查结果）
    const [{ data: images }, report] = await Promise.all([
      db.from('article_images').select('url, type, position, caption').eq('task_id', task.id),
      runChecks(db, task),
    ]);
    // 摘要视图：不外泄 comments/share_token；material 供审核页事实确认项展示（Phase 7）
    const { id, theme, type, author, title, summary, content, status, review_checklist, material } = task;
    return new Response(
      JSON.stringify({ task: { id, theme, type, author, title, summary, content, status, review_checklist, material: material || {} }, images: images || [], report }),
      { headers },
    );
  }

  // ===== POST：审核操作（approve / reject / comment），token 即审核人凭证 =====
  if (req.method === 'POST') {
    const { action, text } = await req.json().catch(() => ({}));
    const task = await findTaskByToken(db, token);
    if (!task) return err('分享链接无效或已过期', 404);

    const deny = validateShareAction(task, action);
    if (deny) return err(deny);

    // 批注：任意状态追加（by=审核人；复用既有 comments 数组结构）
    if (action === 'comment') {
      if (!String(text || '').trim()) return err('批注内容不能为空');
      const patch = {
        comments: [
          ...(task.comments || []),
          { by: '审核人', text: String(text).trim(), at: new Date().toISOString() },
        ],
      };
      const { error } = await db.from('tasks').update(patch).eq('id', task.id);
      if (error) return err(error.message, 500);
      return new Response(JSON.stringify({ ok: true, status: task.status }), { headers });
    }

    // 通过：reviewing → published（§22 审核流程复用三态）
    if (action === 'approve') {
      const { error } = await db.from('tasks').update({ status: 'published' }).eq('id', task.id);
      if (error) return err(error.message, 500);
      return new Response(JSON.stringify({ ok: true, status: 'published' }), { headers });
    }

    // 退回：reviewing → writing + 整改清单（P0-2 格式；空意见=空清单打回，同现状语义）
    const reject = buildRejectPatch(String(text || ''));
    const { error } = await db.from('tasks').update(reject).eq('id', task.id);
    if (error) return err(error.message, 500);
    return new Response(JSON.stringify({ ok: true, status: 'writing', checklist: reject.review_checklist }), { headers });
  }

  return err('仅支持 GET / POST', 405);
};
