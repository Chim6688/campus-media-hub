// 任务管理：当前为内存占位实现，Supabase 接入后仅替换 store 部分，接口不变
let seq = 0;
const tasks = [];

export default async (req) => {
  const headers = { 'Content-Type': 'application/json' };

  // GET：任务列表
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ tasks }), { headers });
  }

  // POST：新建任务
  if (req.method === 'POST') {
    const { theme, type, author } = await req.json();
    if (!theme || !author) {
      return new Response(JSON.stringify({ error: 'theme 和 author 必填' }), { status: 400, headers });
    }
    const task = {
      id: ++seq,
      theme,
      type: type || '活动报道',
      author,
      status: 'writing', // writing -> typesetting -> reviewing -> published
      content: '',
      createdAt: new Date().toISOString(),
    };
    tasks.push(task);
    return new Response(JSON.stringify({ task }), { status: 201, headers });
  }

  return new Response(JSON.stringify({ error: '不支持的方法' }), { status: 405, headers });
};
