// StylePreset 结构风格包注册表（V1.0 Phase 1）
// StylePreset = 整篇推文的视觉 DNA：同一风格包同时驱动正文排版与视觉图片（封面/章节卡）
// 注意：这是"结构风格"而非颜色主题；颜色仍由 themes.js 的 8 色契约负责

// 三套风格包：description 同时用于 UI 提示与后端识图 prompt（语义须一致）
export const STYLE_PRESETS = {
  // journal（默认）：现有渲染零回归的基准风格
  journal: {
    id: 'journal', name: '手账杂志',
    description: '轻文艺、留白、细线、轻装饰',
    // 视觉语言参数包（V2 Phase 1）：布局函数只消费此包，不含任何布局信息
    // borderWidth=1 对齐 V1 白卡 1px 描边（零回归锚点）
    styleParams: { radiusScale: 1, borderWidth: 1, decorations: true, fontWeight: 'normal', uppercase: false },
  },
  bold: {
    id: 'bold', name: '大色块',
    description: '高对比、强标题、几何结构、活动感',
    // 直角无描边、无轻装饰、强字重、强调文本（布局按 fontWeight!=normal 做反白解读）
    styleParams: { radiusScale: 0, borderWidth: 0, decorations: false, fontWeight: 'bold', uppercase: true },
  },
  soft: {
    id: 'soft', name: '柔和',
    description: '低对比、圆角、清新、轻装饰',
    // 大圆角（radius×2）保留细描边与轻装饰
    styleParams: { radiusScale: 2, borderWidth: 1, decorations: true, fontWeight: 'normal', uppercase: false },
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
