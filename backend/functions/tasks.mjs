// 任务 CRUD：Supabase 持久化 + 口令校验 + 状态流转门禁
import { requireAuth } from './lib/auth.mjs';
import { getSupabase } from './lib/supabase.mjs';

const headers = { 'Content-Type': 'application/json' };
const STATUS_FLOW = ['writing', 'typesetting', 'reviewing', 'published'];

export default async (req) => {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  const db = getSupabase();

  // GET：任务列表（新任务在前）
  if (req.method === 'GET') {
    const { data, error } = await db
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    return new Response(JSON.stringify({ tasks: data }), { headers });
  }

  // POST：新建任务
  if (req.method === 'POST') {
    const { theme, type, author } = await req.json();
    if (!theme || !author) {
      return new Response(JSON.stringify({ error: 'theme 和 author 必填' }), { status: 400, headers });
    }
    const { data, error } = await db
      .from('tasks')
      .insert({ theme, type: type || '活动报道', author, status: 'writing' })
      .select()
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    return new Response(JSON.stringify({ task: data }), { status: 201, headers });
  }

  // PATCH：更新内容 / 状态流转 / 加批注
  if (req.method === 'PATCH') {
    const body = await req.json();
    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: 'id 必填' }), { status: 400, headers });

    // 先查当前任务，用于状态流转合法性校验
    const { data: task, error: findErr } = await db.from('tasks').select('*').eq('id', id).single();
    if (findErr || !task) {
      return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404, headers });
    }

    const patch = {};
    // 内容类字段：直接更新
    for (const f of ['content', 'title', 'summary']) {
      if (typeof body[f] === 'string') patch[f] = body[f];
    }
    // 批注：追加而非覆盖
    if (body.comment) {
      patch.comments = [
        ...(task.comments || []),
        { by: body.comment.by || '匿名', text: body.comment.text, at: new Date().toISOString() },
      ];
    }
    // 状态流转：只允许相邻推进或审核打回，published 不可逆
    if (body.status && body.status !== task.status) {
      const from = STATUS_FLOW.indexOf(task.status);
      const to = STATUS_FLOW.indexOf(body.status);
      const forward = to === from + 1;
      const rejectBack = task.status === 'reviewing' && body.status === 'writing'; // 审核打回
      if (!forward && !rejectBack) {
        return new Response(
          JSON.stringify({ error: `不允许从 ${task.status} 流转到 ${body.status}` }),
          { status: 400, headers },
        );
      }
      // 门禁：推进到 reviewing 前必须过规范检查
      if (body.status === 'reviewing') {
        const { runChecks } = await import('./lib/rules-engine.mjs');
        const report = await runChecks(db, { ...task, ...patch });
        if (report.errors.length > 0) {
          return new Response(
            JSON.stringify({ error: '规范检查未通过，请按整改清单修改', report }),
            { status: 400, headers },
          );
        }
      }
      patch.status = body.status;
    }

    // 空补丁（如同状态重复推进）：幂等返回当前任务，避免空 update 导致 .single() 报错
    if (!Object.keys(patch).length) {
      return new Response(JSON.stringify({ task }), { headers });
    }

    const { data, error } = await db.from('tasks').update(patch).eq('id', id).select().single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    return new Response(JSON.stringify({ task: data }), { headers });
  }

  return new Response(JSON.stringify({ error: '不支持的方法' }), { status: 405, headers });
};
