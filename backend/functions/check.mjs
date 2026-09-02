// 规范检查入口：前端随时可手动触发，报告含可行动整改清单
import { requireAuth } from './lib/auth.mjs';
import { getSupabase } from './lib/supabase.mjs';
import { runChecks } from './lib/rules-engine.mjs';

export default async (req) => {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), { status: 405 });
  }
  const { taskId } = await req.json();
  const db = getSupabase();
  const { data: task, error } = await db.from('tasks').select('*').eq('id', taskId).single();
  if (error || !task) {
    return new Response(JSON.stringify({ error: '任务不存在' }), { status: 404 });
  }
  const report = await runChecks(db, task);
  return new Response(JSON.stringify({ report }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
