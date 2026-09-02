// 策划书 PDF 解析：unpdf 提取文本 → AI 提取结构化素材（JSON）
// unpdf 为 serverless 优化的 ESM 库，兼容 Netlify Functions v2（pdf-parse 有 ESM 兼容问题）
import { requireAuth } from './lib/auth.mjs';
import { callLLM } from './lib/ai-providers.mjs';
import { PROMPTS } from './lib/prompts.mjs';
import { extractText, getDocumentProxy } from 'unpdf';

const headers = { 'Content-Type': 'application/json' };

export default async (req) => {
  const authErr = requireAuth(req);
  if (authErr) return authErr;
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST' }), { status: 405, headers });
  }

  // 解析 multipart/form-data 中的 PDF 文件（前端不设 Content-Type，浏览器自动加 boundary）
  let file;
  try {
    const formData = await req.formData();
    file = formData.get('pdf');
  } catch {
    return new Response(JSON.stringify({ error: '请求体解析失败，请用 multipart/form-data 上传' }), { status: 400, headers });
  }
  if (!file) {
    return new Response(JSON.stringify({ error: '未上传 PDF 文件（字段名 pdf）' }), { status: 400, headers });
  }
  if (file.type && file.type !== 'application/pdf') {
    return new Response(JSON.stringify({ error: '仅支持 PDF 文件' }), { status: 400, headers });
  }

  // 提取 PDF 文本（合并所有页）
  let text = '';
  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const result = await extractText(pdf, { mergePages: true });
    text = (result.text || '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'PDF 解析失败：文件可能已损坏或为加密 PDF' }), { status: 400, headers });
  }

  if (text.length < 50) {
    return new Response(
      JSON.stringify({ error: 'PDF 文本提取失败或内容过少（扫描版 PDF 暂不支持，请手动填写素材）' }),
      { status: 400, headers },
    );
  }

  // AI 提取结构化素材
  try {
    const aiText = await callLLM(PROMPTS.extract_material({ text }));
    // AI 可能输出 markdown 代码块，清理后解析
    const clean = aiText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const material = JSON.parse(clean);
    return new Response(JSON.stringify({ material, rawTextLength: text.length }), { headers });
  } catch (e) {
    // 错误信息不回传原文，避免泄露策划书内容；截断提示
    return new Response(JSON.stringify({ error: 'AI 提取失败：' + String(e.message).slice(0, 120) + '，请重试' }), {
      status: 502,
      headers,
    });
  }
};
