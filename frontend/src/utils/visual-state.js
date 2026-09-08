// frontend/src/utils/visual-state.js
// 视觉设计编辑态纯函数（v6，总方案 §7.1）：构图/槽位/卡文案/选图引用 的清洗与图片反查
// 持久化结构 = "下一张要生成什么"；图片产物仍是 article_images（"已经生成了什么"）
// 与后端 tasks.visual_state 对应；清洗规则与渲染上限对齐（截断防脏数据破坏模板）

import { normalizeComposition } from './compositions.js';

// 各字段渲染上限（与 visual-templates / VisualEditor maxlength 对齐）
const LIMITS = {
  org: 24, title: 30, subtitle: 24, place: 20, date: 20, // 封面
  sectionTitle: 20, sectionSubtitle: 18, // 章节卡
};
const MAX_TAGS = 3;
const TAG_LEN = 8;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const idOf = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const intOr = (v, dft) => (Number.isInteger(v) ? v : dft);

// 封面 draft 清洗：缺省空串/空数组（UI 装配层做默认文案兜底，这里只管安全）
function cleanCoverDraft(raw) {
  const d = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const tags = Array.isArray(d.tags)
    ? d.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, TAG_LEN)).slice(0, MAX_TAGS)
    : [];
  return {
    org: str(d.org, LIMITS.org),
    title: str(d.title, LIMITS.title),
    subtitle: str(d.subtitle, LIMITS.subtitle),
    tags,
    place: str(d.place, LIMITS.place),
    date: str(d.date, LIMITS.date),
    imageId: idOf(d.imageId),
  };
}

// 章节卡 draft 清洗（含 photo-stack 辅图引用 image2Id）
function cleanSectionDraft(raw) {
  const d = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  return {
    partNum: intOr(d.partNum, 1) < 1 ? 1 : intOr(d.partNum, 1),
    title: str(d.title, LIMITS.sectionTitle),
    subtitle: str(d.subtitle, LIMITS.sectionSubtitle),
    imageId: idOf(d.imageId),
    image2Id: idOf(d.image2Id),
  };
}

// 白名单清洗（总方案 §7.1 结构；输入不可信）：非法整体返回 null = 无持久化态
// 单个构图非法 → 回退该类型默认（复用 normalizeComposition）
export function normalizeVisualState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cover = raw.cover && typeof raw.cover === 'object' ? raw.cover : {};
  const section = raw.section && typeof raw.section === 'object' ? raw.section : {};
  return {
    cover: {
      composition: normalizeComposition(cover.composition, 'cover'),
      draft: cleanCoverDraft(cover.draft),
    },
    section: {
      composition: normalizeComposition(section.composition, 'section'),
      cardSlot: Number.isInteger(section.cardSlot) && section.cardSlot >= 1 ? section.cardSlot : 1,
      draft: cleanSectionDraft(section.draft),
    },
  };
}

// imageId → 图行 URL（渲染需要 URL，持久化只存 id 溯源防死链）
// 查不到（图被删/换库）→ 返回 ''，由调用方回填默认（firstContentImage 语义）
export function imageUrlById(images, id) {
  if (!id) return '';
  const row = (images || []).find((i) => i && i.id === id);
  return row?.url || '';
}
