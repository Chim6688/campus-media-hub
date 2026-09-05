// 极简本地函数服务器：模拟 Netlify Functions v2 路由（/api/xxx → backend/functions/xxx.mjs）
// 用途：netlify dev 在沙箱环境下无法运行时的本地替代方案
// 用法：node dev-server.mjs（端口 8888，与 frontend/vite.config.js 的代理目标一致）
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// 加载 .env.local（若存在），提供 SUPABASE_URL 等本地环境变量
const envFile = path.resolve(process.cwd(), '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq).trim() : '';
    // 兼容 CRLF 行尾与可能的 BOM，key 校验用严格大写正则
    if (eq > 0 && /^[A-Z_]+$/.test(key) && !process.env[key]) {
      process.env[key] = line.slice(eq + 1).trim();
    }
  }
}

const ROOT = path.resolve(process.cwd(), 'backend/functions');

// 动态加载函数模块：加时间戳参数避免 import 缓存，改代码后重启即生效
async function loadHandler(name) {
  const file = path.join(ROOT, `${name}.mjs`);
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  if (typeof mod.default !== 'function') throw new Error(`函数 ${name} 缺少 default 导出`);
  return mod.default;
}

createServer(async (req, res) => {
  // 提取函数名：/api/images/abc?x=1 → images（子路径 /abc 透传给函数自行解析）
  const name = (req.url || '').replace(/^\/api\//, '').split('?')[0].split('/')[0];
  const jsonHeaders = { 'Content-Type': 'application/json' };

  if (!name || name.includes('/')) {
    res.writeHead(404, jsonHeaders);
    return res.end(JSON.stringify({ error: '未知路径' }));
  }

  try {
    const handler = await loadHandler(name);
    // 把 Node 原生请求转成 Netlify Functions v2 风格的 Web Request
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://localhost:8888${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
    });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    // 函数抛错（如缺少环境变量）→ 500 + 错误信息，便于本地排查
    res.writeHead(500, jsonHeaders);
    res.end(JSON.stringify({ error: e.message }));
  }
}).listen(8888, () => console.log('函数服务已启动：http://localhost:8888/api/*（Ctrl+C 停止）'));
