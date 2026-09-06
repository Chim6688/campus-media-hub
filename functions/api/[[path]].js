// Cloudflare Pages Functions 适配层（V1.0 迁移）：/api/* 统一分发到 backend/functions 各处理器
// 后端业务逻辑零改动，本层只做两件事：
// 1) 把 Pages 环境变量注入 process.env 垫片（后端统一用 process.env 读配置，Workers 无此全局）
// 2) 按路径首段路由到对应处理器（与 dev-server / Netlify redirect 同语义，request.url 保持 /api/* 原路径）
import tasks from '../../backend/functions/tasks.mjs';
import ai from '../../backend/functions/ai.mjs';
import check from '../../backend/functions/check.mjs';
import share from '../../backend/functions/share.mjs';
import images from '../../backend/functions/images.mjs';
import verify from '../../backend/functions/verify.mjs';
import parsePdf from '../../backend/functions/parse-pdf.mjs';

// 静态导入映射：esbuild 打包时随入口一起打进函数包（动态 import 模板串在 Workers 打包不可靠）
const HANDLERS = {
  tasks,
  ai,
  check,
  share,
  images,
  verify,
  'parse-pdf': parsePdf,
};
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function onRequest(context) {
  const { request, env } = context;
  // 环境垫片：后端在调用时才读取 process.env，每请求注入一次即可（幂等覆盖）
  if (!globalThis.process) globalThis.process = { env: {} };
  if (!process.env) process.env = {};
  for (const k of Object.keys(env || {})) process.env[k] = env[k];

  // 路由：/api/tasks?x=1 → tasks；/api/images/abc → images（子路径由函数内 new URL 解析）
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/api\//, '').split('?')[0].split('/')[0];
  const handler = HANDLERS[name];
  if (!handler) {
    return new Response(JSON.stringify({ error: '未知路径' }), { status: 404, headers: JSON_HEADERS });
  }
  try {
    return await handler(request);
  } catch (e) {
    // 与 dev-server 同策略：函数抛错返回 500 + 错误信息，便于排查
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: JSON_HEADERS });
  }
}
