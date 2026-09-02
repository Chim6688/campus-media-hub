// AI 统一入口：draft/title/summary/rewrite 四个动作，Key 只在本函数端使用
import { requireAuth } from './lib/auth.mjs';
import { callLLM } from './lib/ai-providers.mjs';
import { PROMPTS } from './lib/prompts.mjs';

export default async (req) => {
  const authErr = requireAuth(req);
  if (authErr) return authErr;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), { status: 405 });
  }
  const { action, payload } = await req.json();
  const build = PROMPTS[action];
  if (!build) {
    return new Response(JSON.stringify({ error: `未知动作 ${action}` }), { status: 400 });
  }
  try {
    const text = await callLLM(build(payload || {}));
    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502 });
  }
};
