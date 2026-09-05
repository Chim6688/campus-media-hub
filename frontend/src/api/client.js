// 统一请求封装：自动携带共享口令（口令门用，非账号体系）
export async function request(path, options = {}) {
  const code = localStorage.getItem('accessCode') || '';
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Code': code,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 完整响应体挂到 error.detail：规范检查不通过时含 report 整改清单
    const err = new Error(data.error || `请求失败（${res.status}）`);
    err.detail = data;
    throw err;
  }
  return data;
}

// PDF 上传（multipart）：不设 Content-Type，浏览器自动加 boundary
export async function uploadPDF(path, file) {
  const code = localStorage.getItem('accessCode') || '';
  const formData = new FormData();
  formData.append('pdf', file);
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'X-Access-Code': code },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `上传失败（${res.status}）`);
    err.detail = data;
    throw err;
  }
  return data;
}

// ========== 图片 API（V1.0 Phase 3：上传/列表/改绑定/删除） ==========
// 槽位模型：position=0 入图片库待选；position≥1 绑定第 N 张正文配图；type=cover 封面

// 统一响应/错误处理（与 request 同构，但 GET 带 query、PATCH/DELETE 带子路径）
async function imageRequest(path, options = {}) {
  const code = localStorage.getItem('accessCode') || '';
  const res = await fetch(path, {
    ...options,
    headers: { 'X-Access-Code': code, ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `请求失败（${res.status}）`);
    err.detail = data;
    throw err;
  }
  return data;
}

// 上传图片（multipart）：file + 元数据；成功返回 { image }
export function uploadImage(file, { taskId, type = 'content', position = 0, caption = '' }) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('task_id', taskId);
  fd.append('type', type);
  fd.append('position', String(position));
  if (caption) fd.append('caption', caption);
  return imageRequest('/api/images', { method: 'POST', body: fd });
}

// 某任务的图片列表（按 position 升序）
export function listImages(taskId) {
  return imageRequest(`/api/images?task_id=${encodeURIComponent(taskId)}`);
}

// 改图片：caption 说明 / position 绑定槽位（0=回图片库）
export function updateImage(id, patch) {
  return imageRequest(`/api/images/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

// 删除图片（行 + Storage 文件）
export function deleteImage(id) {
  return imageRequest(`/api/images/${id}`, { method: 'DELETE' });
}
