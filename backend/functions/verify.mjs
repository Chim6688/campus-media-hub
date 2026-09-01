// 共享口令校验：保护 AI 额度，口令由管理者配置在环境变量 ACCESS_CODE
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), { status: 405 });
  }
  const { code } = await req.json();
  const expected = process.env.ACCESS_CODE || 'demo2026'; // 本地开发默认值
  if (code === expected) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: false, error: '口令错误' }), { status: 401 });
};
