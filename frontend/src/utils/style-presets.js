// StylePreset 结构风格包注册表（V1.0 Phase 1）
// StylePreset = 整篇推文的视觉 DNA：同一风格包同时驱动正文排版与视觉图片（封面/章节卡）
// 注意：这是"结构风格"而非颜色主题；颜色仍由 themes.js 的 8 色契约负责

// 三套风格包：description 同时用于 UI 提示与后端识图 prompt（语义须一致）
export const STYLE_PRESETS = {
  // journal（默认）：现有渲染零回归的基准风格
  journal: {
    id: 'journal', name: '手账杂志',
    description: '轻文艺、留白、细线、轻装饰',
  },
  bold: {
    id: 'bold', name: '大色块',
    description: '高对比、强标题、几何结构、活动感',
  },
  soft: {
    id: 'soft', name: '柔和',
    description: '低对比、圆角、清新、轻装饰',
  },
};

// 默认风格：不指定/非法输入一律 journal（历史数据兼容 + AI 输出容错）
export const DEFAULT_STYLE_PRESET = 'journal';

// 白名单校验：非法值静默回退 journal，绝不让 AI 输出崩掉页面
export function normalizeStylePreset(raw) {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(STYLE_PRESETS, raw)
    ? raw
    : DEFAULT_STYLE_PRESET;
}
