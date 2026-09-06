// frontend/src/utils/visual-data.js
// 视觉数据装配器（V1.0 Phase 3+4）：任务数据（title/summary/material）+ 图片行 → 视觉卡 data 契约
// 纯函数：缺省兜底集中在装配层，模板渲染层（visual-templates）不再关心数据来源

// 机构名兜底：素材无组织名时用通用文案（Phase 5 识图/后续可扩展为用户配置）
const DEFAULT_ORG = '校园媒体中心';

// 封面数据装配：主标题=任务标题，副标题=摘要，place/date=素材地点/时间，tags=素材名+首条亮点
export function buildCoverData(task, image) {
  const t = task || {};
  const m = t.material || {};
  const highlights = Array.isArray(m.highlights) ? m.highlights.filter(Boolean) : [];
  return {
    org: (m.name || '').trim() ? `校园媒体 · ${(m.name || '').trim()}` : DEFAULT_ORG,
    title: (t.title || '').trim() || '未命名推文',
    subtitle: (t.summary || '').trim() || '一篇来自校园现场的报道',
    tags: highlights.length ? highlights.slice(0, 3) : ['校园报道'],
    place: (m.location || '').trim() || '',
    date: (m.time || '').trim() || '',
    imageUrl: image?.url || '',
  };
}

// 章节卡数据装配：标题缺省用任务标题（用户可在面板编辑），副标题取摘要截断
export function buildSectionData(partNum, task, image) {
  const t = task || {};
  return {
    partNum: Number(partNum) || 1,
    title: (t.title || '').trim() || '章节标题',
    subtitle: ((t.summary || '').trim() || '').slice(0, 16),
    imageUrl: image?.url || '',
  };
}

// 视觉卡默认主图：第一张未绑定的正文图（position=0）；无可用图返回 null（渲染层显示纯色占位）
export function firstContentImage(images) {
  const pool = (images || []).filter((i) => i && i.type === 'content' && !i.position);
  return pool[0] || null;
}

// ===== AI 视觉建议（V1.0 Phase 6）：文章分析 → 封面/章节卡文案建议清洗 =====

// 建议清洗：AI 输出 → 安全的视觉卡预填结构（白名单字段+数量/长度上限）
// 脏输入一律返回全空结构（调用方据空结构提示"未给出建议"），绝不抛异常
export function normalizeVisualSuggestions(raw) {
  const empty = { coverSubtitle: '', coverTags: [], sectionCards: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  // 封面副标题：字符串截断 30 字（模板 subtitle 上限 20 字渲染再截，此处防超长脏数据）
  const coverSubtitle = typeof raw.coverSubtitle === 'string' ? raw.coverSubtitle.trim().slice(0, 30) : '';
  // 封面标签：只留非空字符串项，各截 8 字，最多 3 个（模板 tagPills 上限对齐）
  const coverTags = (Array.isArray(raw.coverTags) ? raw.coverTags : [])
    .filter((t) => typeof t === 'string' && t.trim())
    .map((t) => t.trim().slice(0, 8))
    .slice(0, 3);
  // 章节卡：title 非空才保留；partNum 缺省按序号补、slot 非法回 1；最多 3 张、按 partNum 升序
  const cards = (Array.isArray(raw.sectionCards) ? raw.sectionCards : [])
    .filter((c) => c && typeof c === 'object' && typeof c.title === 'string' && c.title.trim())
    .slice(0, 3)
    .map((c, i) => ({
      partNum: Number.isInteger(c.partNum) && c.partNum >= 1 ? c.partNum : i + 1,
      title: c.title.trim().slice(0, 18), // 模板章节卡标题截断上限对齐
      subtitle: typeof c.subtitle === 'string' ? c.subtitle.trim().slice(0, 16) : '',
      slot: Number.isInteger(c.slot) && c.slot >= 1 ? c.slot : 1,
    }))
    .sort((a, b) => a.partNum - b.partNum);
  return { coverSubtitle, coverTags, sectionCards: cards };
}
