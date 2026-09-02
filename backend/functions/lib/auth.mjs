// 口令校验：所有业务函数统一调用，修复 tasks.mjs 此前未校验的漏洞
export function requireAuth(req) {
  // Netlify 会把 X-Access-Code 头展开为 req.headers 里的小写键
  const code = req.headers.get('x-access-code') || '';
  const expected = process.env.ACCESS_CODE;
  // 未配置口令时拒绝所有请求（不再有默认口令，防止部署后裸奔）
  if (!expected) {
    return new Response(JSON.stringify({ error: '管理员未配置访问口令' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (code !== expected) {
    return new Response(JSON.stringify({ error: '口令错误或未提供' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null; // null 表示校验通过
}
