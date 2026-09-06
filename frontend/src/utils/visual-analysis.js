// frontend/src/utils/visual-analysis.js
// AI 视觉分析清洗与方案工厂（V2 Phase 2）：参考图 → 全维度分析 → 3 个构图互异方案
// 三白名单防线：visualType/composition（compositions.js）+ stylePreset（style-presets.js）+ palette hex（skin.js）
import { normalizeComposition, COMPOSITIONS, COVER_COMPOSITIONS, SECTION_COMPOSITIONS } from './compositions.js';
import { normalizeStylePreset } from './style-presets.js';

// palette 数组 → 8 色键契约映射（顺序即语义：底/主强调/卡底/墨/落款字/落款描边/落款底/次强调）
const PALETTE_KEYS = ['pageBg', 'accentA', 'cardBg', 'ink', 'creamText', 'creamBorder', 'cream', 'accentB'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// 字符串数组清洗：留非空字符串、截 40 字加省略号、最多 5 条
function cleanStrList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x) => (x.trim().length > 40 ? `${x.trim().slice(0, 40)}…` : x.trim()))
    .slice(0, 5);
}

// 解析 AI 视觉分析输出：JSON 容错 → visualType 归一（cover/section 二选一，非法回 section）
// → composition 白名单 → palette 数组映射 8 色（非法 hex 丢弃，不足 8 色失败）
export function parseVisualAnalysis(text) {
  try {
    const clean = String(text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    if (!clean) return { ok: false, error: '分析返回为空，请重试' };
    const raw = JSON.parse(clean);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '分析返回格式异常，请重试' };
    }
    // visualType：白名单二选一（cover/section），非法回 section
    const visualType = raw.visualType === 'cover' ? 'cover' : 'section';
    const composition = normalizeComposition(raw.composition, visualType);
    const stylePreset = normalizeStylePreset(raw.stylePreset);
    // palette：数组映射键契约，逐个 hex 校验
    const paletteArr = Array.isArray(raw.palette) ? raw.palette : [];
    const colors = {};
    paletteArr.forEach((hex, i) => {
      if (typeof hex === 'string' && HEX_RE.test(hex.trim())) colors[PALETTE_KEYS[i]] = hex.trim();
    });
    if (Object.keys(colors).length < 8) {
      return { ok: false, error: 'AI 提取的配色不足 8 色，请换一张色彩更明确的参考图重试' };
    }
    return {
      ok: true, visualType, composition, stylePreset, colors,
      elements: cleanStrList(raw.elements),
      recommendations: cleanStrList(raw.recommendations),
      layoutReason: typeof raw.layoutReason === 'string' ? raw.layoutReason.trim().slice(0, 80) : '',
    };
  } catch {
    return { ok: false, error: '分析返回无法解析，请重试' };
  }
}

// 方案工厂：AI 主方案 + 同类型白名单补齐，3 个构图互异（确定性顺序，AI 构图非法时白名单兜底）
// note：AI 主方案用 layoutReason，补充方案用构图自身说明
export function buildDesignPlans(analysis, visualType) {
  const type = visualType === 'cover' ? 'cover' : 'section';
  const pool = type === 'cover' ? COVER_COMPOSITIONS : SECTION_COMPOSITIONS;
  const mainComp = pool.includes(analysis.composition)
    ? analysis.composition
    : normalizeComposition(analysis.composition, type);
  const plans = [{
    name: '方案 A',
    composition: mainComp,
    compositionLabel: COMPOSITIONS[mainComp].label,
    stylePreset: analysis.stylePreset,
    note: analysis.layoutReason || 'AI 推荐主方案',
  }];
  // 补齐 2 个不同构图（白名单顺序跳过主方案）
  for (const comp of pool) {
    if (plans.length >= 3) break;
    if (comp === mainComp) continue;
    plans.push({
      name: `方案 ${String.fromCharCode(65 + plans.length)}`, // B / C
      composition: comp,
      compositionLabel: COMPOSITIONS[comp].label,
      stylePreset: analysis.stylePreset, // 同风格不同构图（构图才是方案差异维度）
      note: `${COMPOSITIONS[comp].label}构图 · 与方案A不同布局`,
    });
  }
  return plans;
}
