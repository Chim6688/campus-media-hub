// 图片系统纯函数（V1.0 Phase 2）：MIME/大小校验、Storage 路径构建、公共 URL 拼接
// 与 images.mjs 配合：函数层只做 IO，规则判断集中于此便于单测

// 允许的图片 MIME 白名单（svg 有脚本注入风险，明确排除）
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// 单图上限 5MB（公众号单图限制 10M，留余量提速）
const MAX_SIZE = 5 * 1024 * 1024;

// 校验上传图片元数据：返回 {ok:true} 或 {ok:false,error}
export function validateImage({ mime, size }) {
  if (!mime || !ALLOWED_MIME.has(mime)) {
    return { ok: false, error: `不支持的图片类型：${mime || '未提供'}（仅支持 JPG/PNG/WebP/GIF）` };
  }
  if (!size || size <= 0) {
    return { ok: false, error: '图片内容为空' };
  }
  if (size > MAX_SIZE) {
    return { ok: false, error: `图片超过 5MB 上限（当前 ${(size / 1024 / 1024).toFixed(1)}MB）` };
  }
  return { ok: true };
}

// MIME → 扩展名（Storage 路径用小写扩展名，避免原始文件名大小写问题）
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
// task_id / 文件名安全格式：UUID 或基本字母数字（防路径穿越）
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

// 构建 Storage 对象路径：{task_id}/{cover|content}/{时间戳-随机串}.{ext}
// 服务器生成文件名（丢弃用户文件名），从根本上杜绝路径穿越与特殊字符问题
export function buildStoragePath(taskId, type, filename, mime) {
  if (!taskId || !SAFE_ID.test(taskId)) return { error: '非法的任务 ID' };
  if (type !== 'cover' && type !== 'content') return { error: 'type 只能是 cover 或 content' };
  // 优先用 MIME 推扩展名；无 MIME 时从原始文件名提取并校验
  let ext = MIME_EXT[mime];
  if (!ext) {
    const m = (filename || '').match(/\.(jpg|jpeg|png|webp|gif)$/i);
    if (!m) return { error: '文件缺少有效的图片扩展名' };
    ext = m[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
  }
  const rand = crypto.randomUUID().slice(0, 8); // 8 位随机后缀防重名覆盖
  return { path: `${taskId}/${type}/${Date.now()}-${rand}.${ext}` };
}

// Storage 公共读 URL（bucket 设 public，<img> 可直读）
export function publicUrl(supabaseUrl, path) {
  return `${supabaseUrl}/storage/v1/object/public/article-images/${path}`;
}
