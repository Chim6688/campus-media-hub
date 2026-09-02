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
