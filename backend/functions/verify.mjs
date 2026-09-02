// 共享口令校验：保护 AI 额度，口令由管理者配置在环境变量 ACCESS_CODE
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), { status: 405 });
  }
  const expected = process.env.ACCESS_CODE;
  // 未配置口令时明确报错（不再有默认口令）
  if (!expected) {
    return new Response(JSON.stringify({ ok: false, error: '管理员未配置访问口令' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { code } = await req.json();
  if (code === expected) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: false, error: '口令错误' }), { status: 401 });
};
