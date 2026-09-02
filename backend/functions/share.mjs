// 只读分享链接：审核人免口令查看推文
// 安全约束：不返回 comments/material/share_token，仅展示所需字段
import { getSupabase } from './lib/supabase.mjs';

const headers = { 'Content-Type': 'application/json' };

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: '仅支持 GET' }), { status: 405, headers });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response(JSON.stringify({ error: '缺少 token' }), { status: 400, headers });
  }

  const db = getSupabase();
  const { data: task, error } = await db
    .from('tasks')
    .select('id, theme, type, author, title, summary, content, status')
    .eq('share_token', token)
    .single();

  if (error || !task) {
    return new Response(JSON.stringify({ error: '分享链接无效或已过期' }), { status: 404, headers });
  }
  return new Response(JSON.stringify({ task }), { headers });
};
