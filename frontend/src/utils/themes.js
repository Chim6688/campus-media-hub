// 手账卡片风主题皮肤：所有组件渲染时从 theme 对象取色，新增皮肤只需在此加一个对象
export const THEMES = {
  // 绿粉款（方向 D demo 原版配色，参照 demo/theme-direction-d.html）
  greenPink: {
    id: 'greenPink',
    label: '手账卡片·绿粉',
    pageBg: '#F7F5F0', // 页面底色（近纸纹纯色，微信兼容）
    accentA: '#FD98C9', // 强调色A：标题卡错位层/半圆序号/金句描边
    accentB: '#53DE7B', // 强调色B：胶囊标签/圆片序号/错位层/菱形装饰
    ink: '#3E3E3E', // 主文字与描边色
    cardBg: '#ffffff', // 卡片底色
    cream: '#F3EFE6', // 落款卡底色
    creamBorder: '#E2DACA', // 落款卡描边
    creamText: '#8C8770', // 落款卡副文字
  },
  // 绿黄款（黄色替换粉色位，同绿粉款结构）
  greenYellow: {
    id: 'greenYellow',
    label: '手账卡片·绿黄',
    pageBg: '#F7F5F0',
    accentA: '#FFD04D',
    accentB: '#53DE7B',
    ink: '#3E3E3E',
    cardBg: '#ffffff',
    cream: '#F3EFE6',
    creamBorder: '#E2DACA',
    creamText: '#8C8770',
  },
};

// 默认主题
export const DEFAULT_THEME = 'greenPink';

// ===== P0-1 令牌系统：圆角/字号/间距/描边等可调参数（渲染函数统一取值） =====
// 所有用 px 的令牌由参数面板 clamp 后传入，防止调出破坏性布局
export const TOKEN_DEFAULTS = {
  radius: 10,        // 卡片基础圆角
  titleRadius: 4,    // 标题卡圆角（错位描边风用小圆角）
  borderWidth: 2,    // 标题卡/胶囊描边粗细
  thinBorder: 1.5,   // 引言卡/金句条细描边
  titleFontSize: 22, // 标题卡字号
  sectionFontSize: 17, // 小节标题字号
  bodyFontSize: 15,  // 正文/金句/列表字号
  bodyLineHeight: 2, // 正文行高（无单位）
  sectionGap: 36,    // 小节下间距
};

// 合并令牌：预设皮肤 → 默认令牌 → 用户覆盖（overrides 来自参数面板）
export function resolveTheme(themeId, overrides = {}) {
  const base = THEMES[themeId] || THEMES[DEFAULT_THEME];
  return { ...TOKEN_DEFAULTS, ...base, ...(overrides || {}) };
}

// ===== 新增预设皮肤（仅配色差异，令牌用默认值） =====
Object.assign(THEMES, {
  fresh: {
    id: 'fresh', label: '清新·蓝绿',
    pageBg: '#F4FAFD', accentA: '#6EC6F5', accentB: '#7BD9A5',
    ink: '#2F3A45', cardBg: '#ffffff',
    cream: '#EDF6FA', creamBorder: '#D5E8F0', creamText: '#7A99A8',
  },
  retro: {
    id: 'retro', label: '复古·棕绿',
    pageBg: '#F5EFE3', accentA: '#C89F6E', accentB: '#8A9A5B',
    ink: '#4A3F35', cardBg: '#FFFDF8',
    cream: '#EFE6D4', creamBorder: '#DBCBB0', creamText: '#9A8B72',
  },
  guochao: {
    id: 'guochao', label: '国潮·红金',
    pageBg: '#FBF3EC', accentA: '#E63946', accentB: '#E9B44C',
    ink: '#3D2B26', cardBg: '#ffffff',
    cream: '#F7E8DA', creamBorder: '#E5CDB4', creamText: '#A0876B',
  },
  minimal: {
    id: 'minimal', label: '简约·灰黑',
    pageBg: '#FAFAFA', accentA: '#4A4A4A', accentB: '#8C8C8C',
    ink: '#333333', cardBg: '#ffffff',
    cream: '#F0F0F0', creamBorder: '#DDDDDD', creamText: '#999999',
  },
});
