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
