// 配图工作台纯函数（V1.0 Phase 3）：配图计划解析、槽位构建、图片库筛选
// 槽位模型：position=0 图片库待选（池）；position≥1 绑定第 N 张正文配图；type=cover 封面
// 换图/移除只改 position（绑定关系），不改正文内容（§7 解耦原则）

// 解析配图计划：每行一条（与素材面板 highlights/flow 同约定）
export function parsePhotoNotes(text) {
  return (text || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

// 构建正文配图槽位列表：{ position, image|null, suggestion }
// 槽数 = max(计划行数, 已绑定最大位置)，末尾恒追加一个空槽便于续加配图
export function buildSlots(images, photoNotesText) {
  const bound = new Map(); // position → 绑定的图片行
  for (const img of images || []) {
    if (img.type === 'content' && img.position > 0 && !bound.has(img.position)) bound.set(img.position, img);
  }
  const notes = parsePhotoNotes(photoNotesText);
  const maxBound = bound.size ? Math.max(...bound.keys()) : 0;
  const count = Math.max(notes.length, maxBound, 0);
  const slots = [];
  for (let n = 1; n <= count + 1; n++) {
    slots.push({ position: n, image: bound.get(n) || null, suggestion: notes[n - 1] || '' });
  }
  return slots;
}

// 图片库待选项：正文图且未绑定槽位（position=0），可被「选这张」绑定
export function poolImages(images) {
  return (images || []).filter((i) => i.type === 'content' && !i.position);
}

// AI 建议清洗（Phase 5，§14 契约）：[{position, description, reason}]
// position 必须正整数、description 非空；reason 缺省空串；按 position 升序
export function normalizeSuggestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (i) =>
        i && typeof i === 'object' &&
        Number.isInteger(i.position) && i.position >= 1 &&
        typeof i.description === 'string' && i.description.trim(),
    )
    .map((i) => ({ position: i.position, description: i.description.trim(), reason: (i.reason || '').toString().trim() }))
    .sort((a, b) => a.position - b.position);
}

// 缺失占位补插（Phase 5）：配图计划有 N 条而正文整段占位不足时，
// 把缺失的 [配图：desc] 均匀插入正文段落间（确定性操作，可 Ctrl+Z 撤销）
export function insertMissingPlaceholders(content, descriptions) {
  const text = content || '';
  const descs = descriptions || [];
  if (!text.trim() || !descs.length) return text;
  // 整段占位 = 行首 [配图：...] 独占一行
  const existing = (text.match(/^\[配图[：:][^\]]*\]\s*$/gm) || []).length;
  const missing = descs.slice(existing);
  if (!missing.length) return text;

  // 按空行切段；段间均匀插占位（gap = 段数 / (缺失数+1) 向下取整，至少 1）
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  if (!paras.length) return text;
  const gap = Math.max(1, Math.floor(paras.length / (missing.length + 1)));
  const out = [];
  let nextInsert = gap; // 下一次插入点（段索引，0-based 之前插入）
  for (let i = 0; i < paras.length; i++) {
    out.push(paras[i]);
    // 在插入点且还有缺失占位时追加（末段后不插，保证占位在正文段落之间/末段前）
    if (i === nextInsert - 1 && missing.length) {
      out.push(`[配图：${missing.shift()}]`);
      nextInsert += gap + 1;
    }
  }
  // 段落太少仍有剩余（如单段正文）：依次追加在末尾
  while (missing.length) out.push(`[配图：${missing.shift()}]`);
  return out.join('\n\n');
}
