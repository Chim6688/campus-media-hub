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
