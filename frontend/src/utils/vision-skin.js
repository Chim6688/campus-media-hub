// frontend/src/utils/vision-skin.js
// 识图皮肤清洗与压缩参数（V1.0 Phase 5）：AI 视觉输出 → 双白名单清洗
// colors 走 normalizeSkin（8 色 hex 契约），stylePreset 走 normalizeStylePreset（三风格白名单）
import { normalizeSkin } from './skin.js';
import { normalizeStylePreset } from './style-presets.js';

// 解析 AI 识图输出：JSON 容错（代码块包裹）→ 双白名单清洗 → 不足 8 色视为失败
// 返回 { ok, colors, stylePreset, error }；任何异常输入都不抛错（AI 输出不可信）
export function parseVisionSkin(text) {
  try {
    const clean = String(text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    if (!clean) return { ok: false, error: '识图返回为空，请重试' };
    const raw = JSON.parse(clean);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '识图返回格式异常，请重试' };
    }
    const colors = normalizeSkin(raw.colors || {});
    if (Object.keys(colors).length < 8) {
      return { ok: false, error: 'AI 提取的配色不完整（需 8 色），请换一张色彩更明确的参考图重试' };
    }
    return { ok: true, colors, stylePreset: normalizeStylePreset(raw.stylePreset) };
  } catch {
    return { ok: false, error: '识图返回无法解析，请重试' };
  }
}

// 压缩参数：最长边 ≤1024、小图不放大、JPEG 质量 0.85（base64 控制在 ~500KB 内）
export function compressSpec(w, h) {
  const W = Math.max(1, Number(w) || 0);
  const H = Math.max(1, Number(h) || 0);
  const MAX = 1024;
  const scale = Math.max(W, H) > MAX ? MAX / Math.max(W, H) : 1;
  return {
    targetW: Math.max(1, Math.round(W * scale)),
    targetH: Math.max(1, Math.round(H * scale)),
    quality: 0.85,
  };
}
