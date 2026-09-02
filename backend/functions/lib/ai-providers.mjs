// 三家供应商统一适配：均为 OpenAI 兼容的 chat/completions 接口，差异仅在 baseURL/model/key
// fallback 链：当前供应商失败 → 依次尝试其余已配置 Key 的供应商
const PROVIDERS = {
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.ZHIPU_MODEL || 'glm-4-flash',
    key: process.env.ZHIPU_API_KEY,
    label: '智谱 GLM',
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    key: process.env.DEEPSEEK_API_KEY,
    label: 'DeepSeek',
  },
  doubao: {
    // 豆包走火山方舟 OpenAI 兼容接口，model 需填接入点 ID（ep-xxx）
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: process.env.DOUBAO_MODEL || '',
    key: process.env.DOUBAO_API_KEY,
    label: '豆包',
  },
};

// 单供应商调用：OpenAI 兼容格式（55 秒超时，防止上游挂起导致请求无限等待）
async function callOne(provider, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  let res;
  try {
    res = await fetch(`${provider.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(`${provider.label} ${e.name === 'AbortError' ? '请求超时（55秒）' : '网络错误：' + e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${provider.label} 接口错误 ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// 统一入口：优先当前供应商，失败自动 fallback 到其他已配置的供应商
export async function callLLM(messages, { provider: providerName } = {}) {
  const name = providerName || process.env.AI_PROVIDER || 'zhipu';
  // fallback 顺序：指定供应商在前，其余按配置了 Key 的排后面
  const ordered = [name, ...Object.keys(PROVIDERS).filter((k) => k !== name)];
  const errors = [];
  for (const k of ordered) {
    const p = PROVIDERS[k];
    if (!p.key || (k === 'doubao' && !p.model)) continue; // 未配置则跳过
    try {
      return await callOne(p, messages);
    } catch (e) {
      errors.push(e.message); // 记录失败原因，尝试下一家
    }
  }
  throw new Error(`所有 AI 供应商调用失败：${errors.join(' | ')}`);
}
