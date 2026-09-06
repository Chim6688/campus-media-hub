// frontend/src/utils/placeholder.js
// 占位对齐纯函数（V2 Phase 3）：视觉章节卡绑定槽位 N 时，保证正文有第 N 个占位
// 语法严格沿用 wechat-format imageSlot 的整段占位（独行 [配图：说明]），渲染层零改动

// 整段占位正则（与 imageSlot 判定同源：行首 [配图：...] 独占一行）
const PLACEHOLDER_RE = /^\[配图[：:][^\]]*\]\s*$/gm;

// 数整段占位数（null/undefined 容错为 0）
export function countPlaceholders(content) {
  return (String(content || '').match(PLACEHOLDER_RE) || []).length;
}

// 保证正文有第 slot 个占位：不足则在文末追加（差几个补几个，幂等）
// slot ≤ 现有数或 <1 时原样返回；label 缺省用「配图」
export function ensurePlaceholder(content, slot, label = '配图') {
  const text = String(content || '');
  const slotNum = Number(slot);
  if (!Number.isInteger(slotNum) || slotNum < 1) return text;
  const current = countPlaceholders(text);
  const missing = slotNum - current;
  if (missing <= 0) return text;
  const safeLabel = String(label).trim().slice(0, 12) || '配图';
  const additions = Array.from({ length: missing }, () => `[配图：${safeLabel}]`).join('\n\n');
  return text.trim() ? `${text}\n\n${additions}` : additions;
}
