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
    throw new Error(data.error || `请求失败（${res.status}）`);
  }
  return data;
}
