// 整改清单纯函数：计数与文本归一（打回弹窗录入与清单展示用）
// 注意：本文件与 backend/functions/lib/checklist.mjs 为纯函数双份（避免跨端打包依赖），修改任一方须同步另一方
export function remainingCount(list) {
  if (!Array.isArray(list)) return 0; // 旧任务无清单 → 不阻塞
  return list.filter((i) => !i?.done).length;
}

// 多行文本 → 条目数组：去空行、去 "1. / 1、/、" 编号前缀、去首尾空白
export function normalizeLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim().replace(/^\d+[.、]\s*/, '').replace(/^[、]\s*/, '').trim())
    .filter(Boolean);
}

// 新建清单条目（带 id 与时间戳）
export function makeItem(text) {
  return { id: crypto.randomUUID().slice(0, 8), text, done: false, at: new Date().toISOString() };
}
