// frontend/src/utils/compositions.js
// Composition 构图注册表（V2 Phase 1）：构图负责"怎么摆"，与 StylePreset 视觉语言完全解耦
// 每种构图对应 visual-templates.js 中一个独立布局函数；新增构图=在此注册+实现布局函数

// 构图注册表：键=构图 id（前缀即类型，防跨类型误用），label 用于 UI 选择器
export const COMPOSITIONS = {
  // —— Cover（900×383 公众号首图）——
  'cover-hero':      { type: 'cover', label: '主视觉横幅' }, // 上信息带 + 下大图（V1 白卡横幅演化）
  'cover-circle':    { type: 'cover', label: '圆形照片' },   // 圆形照片 + 标签 + 地点日期 + 大标题
  'cover-editorial': { type: 'cover', label: '杂志错位' },   // 大留白 + 照片错位 + 编号 + 分割线
  'cover-photo':     { type: 'cover', label: '满版大图' },   // 图占上半主体 + 底部信息条
  'cover-minimal':   { type: 'cover', label: '极简文字' },   // 纯文字层级 + 细线装饰（无图也成立）
  // —— Section（900×1200 竖版章节卡）——
  'section-photo-stack': { type: 'section', label: '照片叠放' }, // 多图负 margin 错位叠放
  'section-editorial':   { type: 'section', label: '杂志章节' }, // 大编号 + 分割线 + 大标题 + 图
  'section-split':       { type: 'section', label: '左右分栏' }, // 左文右图分栏
  'section-minimal':     { type: 'section', label: '极简章节' }, // 纯文字竖排层级
  'section-full-photo':  { type: 'section', label: '满版图浮层' }, // 全图 + 底部信息浮层
};

// 按类型分组的键序（UI 选择器与布局分派用）
export const COVER_COMPOSITIONS = Object.keys(COMPOSITIONS).filter((k) => COMPOSITIONS[k].type === 'cover');
export const SECTION_COMPOSITIONS = Object.keys(COMPOSITIONS).filter((k) => COMPOSITIONS[k].type === 'section');

// 各类型默认构图：cover-hero 承接 V1 零回归锚点；section-editorial 为杂志式基准
export const DEFAULT_COMPOSITION = { cover: 'cover-hero', section: 'section-editorial' };

// 白名单校验：合法且类型归属正确才通过；任何异常回退该类型默认（AI 输出/用户输入不可信）
export function normalizeComposition(raw, visualType) {
  const fallback = DEFAULT_COMPOSITION[visualType] || DEFAULT_COMPOSITION.cover;
  if (typeof raw !== 'string') return fallback;
  const c = COMPOSITIONS[raw];
  return c && c.type === visualType ? raw : fallback;
}
