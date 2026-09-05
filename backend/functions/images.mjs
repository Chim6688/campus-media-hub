// 图片 API（V1.0 Phase 2）：article_images 表 CRUD + Supabase Storage 上传/清理
// 路由约定（§12）：POST /api/images（multipart 上传）、GET /api/images?task_id=、
// PATCH /api/images/:id、DELETE /api/images/:id（Netlify redirect 保留完整子路径）
import { requireAuth } from './lib/auth.mjs';
import { getSupabase } from './lib/supabase.mjs';
import { validateImage, buildStoragePath, publicUrl } from './lib/image-rules.mjs';

const headers = { 'Content-Type': 'application/json' };
const err = (msg, status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers });

// 从请求 url 提取子路径 id：/api/images/abc?x=1 → 'abc'（无则 null）
// req.url 可能是完整 URL（dev-server）或纯路径（Netlify），统一走 URL 解析
function pathId(req) {
  try {
    const m = new URL(req.url).pathname.match(/^\/api\/images\/([^/?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export default async (req) => {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  const db = getSupabase();

  // GET：某任务的图片列表（按 position 升序，封面在前）
  if (req.method === 'GET') {
    const taskId = new URL(req.url).searchParams.get('task_id');
    if (!taskId) return err('task_id 必填');
    const { data, error } = await db
      .from('article_images')
      .select('*')
      .eq('task_id', taskId)
      .order('position', { ascending: true });
    if (error) return err(error.message, 500);
    return new Response(JSON.stringify({ images: data }), { headers });
  }

  // POST：上传图片（multipart：file/task_id/type/position/caption）→ Storage → 表
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (!form) return err('请求必须是 multipart/form-data 格式');
    const file = form.get('file');
    const taskId = form.get('task_id');
    const type = form.get('type') || 'content';
    if (!(file instanceof File)) return err('缺少 file 字段');
    if (!taskId) return err('task_id 必填');

    // 校验链：task 存在 → MIME/大小 → Storage 路径
    const { data: task } = await db.from('tasks').select('id').eq('id', taskId).single();
    if (!task) return err('任务不存在', 404);
    const v = validateImage({ mime: file.type, size: file.size });
    if (!v.ok) return err(v.error);
    const p = buildStoragePath(taskId, type, file.name, file.type);
    if (p.error) return err(p.error);

    // 上传 Storage（upsert 防同路径冲突，路径含随机后缀实际不会撞）
    const { error: upErr } = await db.storage
      .from('article-images')
      .upload(p.path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
    if (upErr) return err('图片存储失败：' + upErr.message, 500);

    // 落库：URL 为公共读地址，Phase 3/4 的预览与复制共用同一数据源
    const row = {
      task_id: taskId,
      url: publicUrl(process.env.SUPABASE_URL, p.path),
      type,
      position: Number(form.get('position')) || 0,
      caption: (form.get('caption') || '').toString().trim() || null,
      source: form.get('source') === 'ai' ? 'ai' : 'upload',
    };
    const { data: image, error: insErr } = await db.from('article_images').insert(row).select().single();
    if (insErr) return err(insErr.message, 500);
    return new Response(JSON.stringify({ image }), { status: 201, headers });
  }

  // PATCH /:id：仅允许改 caption / position（url/type/task_id 不可变，防破坏绑定关系）
  if (req.method === 'PATCH') {
    const id = pathId(req);
    if (!id) return err('缺少图片 id（PATCH /api/images/:id）');
    const body = await req.json().catch(() => ({}));
    const patch = {};
    if (typeof body.caption === 'string') patch.caption = body.caption.trim() || null;
    if (body.position !== undefined) {
      if (!Number.isInteger(body.position) || body.position < 0) return err('position 必须是非负整数');
      patch.position = body.position;
    }
    if (!Object.keys(patch).length) return err('无可更新字段（caption / position）');
    const { data: image, error } = await db.from('article_images').update(patch).eq('id', id).select().single();
    // PGRST116 = single() 无匹配行 → 图片不存在（而非 500）
    if (error) {
      if (error.code === 'PGRST116') return err('图片不存在', 404);
      return err(error.message, 500);
    }
    return new Response(JSON.stringify({ image }), { headers });
  }

  // DELETE /:id：删行 + best-effort 清理 Storage 文件（孤儿文件可容忍，孤儿记录不可）
  if (req.method === 'DELETE') {
    const id = pathId(req);
    if (!id) return err('缺少图片 id（DELETE /api/images/:id）');
    const { data: img } = await db.from('article_images').select('*').eq('id', id).single();
    if (!img) return err('图片不存在', 404);
    // 从公共 URL 反解 Storage 对象路径：.../article-images/{task}/{type}/{file}
    const m = (img.url || '').match(/\/article-images\/(.+)$/);
    if (m) {
      await db.storage.from('article-images').remove([m[1]]); // 清理失败不阻断删行
    }
    const { error } = await db.from('article_images').delete().eq('id', id);
    if (error) return err(error.message, 500);
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  return err('不支持的方法', 405);
};
