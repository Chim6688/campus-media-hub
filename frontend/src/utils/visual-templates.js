// frontend/src/utils/visual-templates.js
// 视觉模板渲染函数（V1.0 Phase 1）：Cover Poster / Section Card
// 单一渲染源：预览与导出共用本文件函数（规格 §3.1），模板只用 CSS 白名单属性
// 布局一律文档流 + flex；图片带 crossorigin 供 html2canvas useCORS 截图
import { resolveTheme } from './themes.js';
import { normalizeStylePreset } from './style-presets.js';

// 固定尺寸：公众号首图 2.35:1 / 章节卡竖版（导出 scale=2 实际 1800 宽）
export const COVER_SIZE = { width: 900, height: 383 };
export const SECTION_CARD_SIZE = { width: 900, height: 1200 };

// ===== 基础工具 =====

// HTML 转义：与 wechat-format.js 同构（转义 & < > "，防文稿内容被当作标签）
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 超长文本截断：超过 max 字符时截取前 max 字符加省略号，保证不溢出固定尺寸模板
function clampText(s, max) {
  const t = String(s == null ? '' : s);
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// 图片节点：URL 非空输出带 crossorigin 的 img（html2canvas useCORS 依赖）；
// URL 为空输出同尺寸纯色占位（theme.cream），保证缺图时布局高度稳定
function imgNode(url, theme, heightPx) {
  if (url) {
    return `<img src="${esc(url)}" crossorigin="anonymous" alt="" style="width:100%;height:${heightPx}px;display:block;object-fit:cover;">`;
  }
  return `<div style="width:100%;height:${heightPx}px;background:${theme.cream};"></div>`;
}

// Part 序号补零两位：非数字/非法输入回退 '01'（渲染入口容错）
function pad2(n) {
  const num = Number(n);
  return Number.isFinite(num) ? String(Math.max(0, Math.floor(num))).padStart(2, '0') : '01';
}

// tags 胶囊工厂：三风格共用结构，边框/底色/圆角由各风格传入（纯色 + border 白名单内）
function tagPills(tags, border, bg, textColor, radius) {
  return tags
    .map((t) => `<span style="display:inline-block;padding:2px 12px;margin-right:8px;border:1px solid ${border};border-radius:${radius}px;background:${bg};font-size:12px;color:${textColor};">${esc(clampText(t, 8))}</span>`)
    .join('');
}

// place · date 合并：两者均空时返回空串（避免悬空分隔符）
function joinPlaceDate(place, date) {
  return [place, date].filter(Boolean).join(' · ');
}

// ===== Cover Poster：公众号首图 900×383 =====

// 渲染入口：主题解析 + 风格归一化 + 字段容错，再分派到三套结构
export function renderCoverPoster(data, themeId, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides);
  const preset = normalizeStylePreset(opts.stylePreset);
  // 字段全部容错：缺失给空串 / 空数组，绝不向模板泄漏 undefined
  const d = {
    org: data && data.org ? String(data.org) : '',
    title: data && data.title ? String(data.title) : '',
    subtitle: data && data.subtitle ? String(data.subtitle) : '',
    tags: Array.isArray(data && data.tags) ? data.tags.map((t) => String(t)) : [],
    place: data && data.place ? String(data.place) : '',
    date: data && data.date ? String(data.date) : '',
    imageUrl: data && data.imageUrl ? String(data.imageUrl) : '',
  };
  const fn = preset === 'bold' ? coverBold : preset === 'soft' ? coverSoft : coverJournal;
  return fn(theme, d);
}

// journal：pageBg 页底 + 白卡 ink 细描边小圆角，留白多、轻装饰
function coverJournal(theme, d) {
  const tags = tagPills(d.tags, theme.accentA, theme.cardBg, theme.ink, 999);
  const placeDate = joinPlaceDate(d.place, d.date);
  // org 行前置 accentA 小方块装饰（journal 的轻强调用法）
  const org = d.org
    ? `<div style="height:20px;margin-top:12px;font-size:14px;color:${theme.ink};"><span style="display:inline-block;width:10px;height:10px;margin-right:8px;background:${theme.accentA};"></span>${esc(clampText(d.org, 20))}</div>`
    : '';
  const title = d.title
    ? `<div style="height:44px;margin-top:6px;font-size:32px;font-weight:bold;color:#1a1a1a;line-height:1.35;">${esc(clampText(d.title, 28))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:24px;margin-top:2px;font-size:17px;color:${theme.creamText};">${esc(clampText(d.subtitle, 20))}</div>`
    : '';
  // 白卡总高 355（329 内容 + 24 padding + 2 border）+ 上下 margin 14 = 383 精确闭合
  return `<div style="width: 900px;height: 383px;background:${theme.pageBg};display:flex;flex-direction:column;"><div style="margin:14px 18px;height:329px;background:${theme.cardBg};border:1px solid ${theme.ink};border-radius:${theme.radius}px;padding:12px 20px;display:flex;flex-direction:column;">${org}${title}${subtitle}<div style="margin-top:10px;">${imgNode(d.imageUrl, theme, 158)}</div><div style="margin-top:8px;height:22px;font-size:13px;color:${theme.creamText};">${tags}${placeDate ? esc(placeDate) : ''}</div></div></div>`;
}

// bold：accentA 大色块做主背景，标题反白，直角/小圆角几何感
function coverBold(theme, d) {
  const tags = tagPills(d.tags, theme.accentB, theme.cardBg, theme.ink, 4);
  const placeDate = joinPlaceDate(d.place, d.date);
  // 上半 accentA 色块（172）+ 图片带（158）+ 白底信息条（53）= 383 精确闭合
  return `<div style="width: 900px;height: 383px;background:${theme.accentA};display:flex;flex-direction:column;">`
    + `<div style="height:172px;">`
    + (d.org ? `<div style="height:20px;margin:20px 32px 0;font-size:14px;color:#fff;">${esc(clampText(d.org, 20))}</div>` : '')
    + (d.title ? `<div style="height:50px;margin:6px 32px 0;font-size:36px;font-weight:bold;color:#fff;line-height:1.35;">${esc(clampText(d.title, 28))}</div>` : '')
    + (d.subtitle ? `<div style="height:24px;margin:4px 32px 0;font-size:17px;color:${theme.cardBg};">${esc(clampText(d.subtitle, 20))}</div>` : '')
    + `</div>`
    + `<div style="height:158px;">${imgNode(d.imageUrl, theme, 158)}</div>`
    + `<div style="height:53px;background:${theme.cardBg};line-height:53px;padding:0 32px;font-size:13px;color:${theme.ink};">${tags}${placeDate ? esc(placeDate) : ''}</div>`
    + `</div>`;
}

// soft：cream 底 + 大圆角（radius×2）白卡，文字低对比、装饰用 accentA/accentB 浅用法
function coverSoft(theme, d) {
  const tags = tagPills(d.tags, theme.accentA, theme.cream, theme.creamText, 999);
  const placeDate = joinPlaceDate(d.place, d.date);
  const softRadius = theme.radius * 2; // soft 专属：基础圆角翻倍的大圆角
  // org 行前置 accentB 小圆点（soft 的柔和强调用法）
  const org = d.org
    ? `<div style="height:20px;font-size:14px;color:${theme.creamText};"><span style="display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:999px;background:${theme.accentB};"></span>${esc(clampText(d.org, 20))}</div>`
    : '';
  const title = d.title
    ? `<div style="height:42px;margin-top:8px;font-size:30px;font-weight:bold;color:${theme.ink};line-height:1.35;">${esc(clampText(d.title, 28))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:24px;margin-top:2px;font-size:17px;color:${theme.creamText};">${esc(clampText(d.subtitle, 20))}</div>`
    : '';
  return `<div style="width: 900px;height: 383px;background:${theme.cream};display:flex;flex-direction:column;"><div style="margin:20px 26px 0;height:317px;background:${theme.cardBg};border-radius:${softRadius}px;padding:18px 26px;display:flex;flex-direction:column;">${org}${title}${subtitle}<div style="margin-top:12px;">${imgNode(d.imageUrl, theme, 158)}</div><div style="margin-top:10px;height:22px;font-size:13px;color:${theme.creamText};">${tags}${placeDate ? esc(placeDate) : ''}</div></div></div>`;
}

// ===== Section Card：章节卡竖版 900×1200 =====

// 渲染入口：partNum 容错（非数字回退 01）+ 字段容错，再分派三套结构
export function renderSectionCard(data, themeId, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides);
  const preset = normalizeStylePreset(opts.stylePreset);
  const d = {
    partNum: data && data.partNum != null ? data.partNum : 1,
    title: data && data.title ? String(data.title) : '',
    subtitle: data && data.subtitle ? String(data.subtitle) : '',
    imageUrl: data && data.imageUrl ? String(data.imageUrl) : '',
  };
  const fn = preset === 'bold' ? sectionBold : preset === 'soft' ? sectionSoft : sectionJournal;
  return fn(theme, d);
}

// journal：白卡细描边 + accentA PART 胶囊 + 大号序号 + 细分隔线
function sectionJournal(theme, d) {
  const part = pad2(d.partNum);
  const title = d.title
    ? `<div style="height:48px;margin-top:18px;font-size:34px;font-weight:bold;color:#1a1a1a;line-height:1.4;">${esc(clampText(d.title, 18))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:28px;margin-top:6px;font-size:19px;color:${theme.creamText};">${esc(clampText(d.subtitle, 16))}</div>`
    : '';
  // 白卡总高 1156（1102 内容 + 52 padding + 2 border）+ 上下 margin 20 = 1196 ≤ 1200
  return `<div style="width: 900px;height: 1200px;background:${theme.pageBg};display:flex;flex-direction:column;">`
    + `<div style="margin:20px 24px;height:1102px;background:${theme.cardBg};border:1px solid ${theme.ink};border-radius:${theme.radius}px;padding:26px 30px;display:flex;flex-direction:column;">`
    + `<div style="height:96px;"><span style="display:inline-block;padding:2px 14px;margin-right:12px;border:1px solid ${theme.accentA};border-radius:999px;font-size:15px;color:${theme.ink};">PART</span><span style="display:inline-block;font-size:72px;font-weight:bold;color:${theme.ink};line-height:1.3;">${esc(part)}</span></div>`
    + `<div style="height:0;margin-top:14px;border-top:2px solid ${theme.accentA};"></div>`
    + `${title}${subtitle}`
    + `<div style="margin-top:24px;">${imgNode(d.imageUrl, theme, 640)}</div>`
    + `</div></div>`;
}

// bold：上半 accentA 大色块（PART 反白 84px）+ 白底大图区，几何强对比
function sectionBold(theme, d) {
  const part = pad2(d.partNum);
  const title = d.title
    ? `<div style="height:48px;margin:28px 36px 0;font-size:34px;font-weight:bold;color:#1a1a1a;line-height:1.4;">${esc(clampText(d.title, 18))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:28px;margin:8px 36px 0;font-size:19px;color:${theme.creamText};">${esc(clampText(d.subtitle, 16))}</div>`
    : '';
  // accentA 上块 360 + 白底下块 840 = 1200 精确闭合；图 660 ≈ 55% 总高
  return `<div style="width: 900px;height: 1200px;background:${theme.accentA};display:flex;flex-direction:column;">`
    + `<div style="height:360px;">`
    + `<div style="height:20px;margin:36px 36px 0;font-size:16px;color:#fff;">PART</div>`
    + `<div style="height:104px;margin:6px 36px 0;font-size:84px;font-weight:bold;color:#fff;line-height:1.2;">${esc(part)}</div>`
    + `<div style="height:0;margin:10px 36px 0;border-top:3px solid #fff;"></div>`
    + `</div>`
    + `<div style="height:840px;background:${theme.cardBg};">${title}${subtitle}<div style="margin-top:24px;">${imgNode(d.imageUrl, theme, 660)}</div></div>`
    + `</div>`;
}

// soft：cream 底 + 大圆角白卡文字区 + creamBorder 细分隔线 + accentB 圆点，低对比
function sectionSoft(theme, d) {
  const part = pad2(d.partNum);
  const softRadius = theme.radius * 2;
  const title = d.title
    ? `<div style="height:48px;margin-top:18px;font-size:34px;font-weight:bold;color:${theme.ink};line-height:1.4;">${esc(clampText(d.title, 18))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:28px;margin-top:6px;font-size:19px;color:${theme.creamText};">${esc(clampText(d.subtitle, 16))}</div>`
    : '';
  // 文字圆角卡（总高 500）+ 图片 640 + 间距 ≈ 1188 ≤ 1200
  return `<div style="width: 900px;height: 1200px;background:${theme.cream};display:flex;flex-direction:column;">`
    + `<div style="margin:24px 28px 0;height:448px;background:${theme.cardBg};border-radius:${softRadius}px;padding:26px 30px;display:flex;flex-direction:column;">`
    + `<div style="height:20px;font-size:15px;color:${theme.creamText};"><span style="display:inline-block;width:10px;height:10px;margin-right:8px;border-radius:999px;background:${theme.accentB};"></span>PART</div>`
    + `<div style="height:86px;margin-top:8px;font-size:64px;font-weight:bold;color:${theme.ink};line-height:1.3;">${esc(part)}</div>`
    + `<div style="height:0;margin-top:16px;border-top:1px solid ${theme.creamBorder};"></div>`
    + `${title}${subtitle}`
    + `</div>`
    + `<div style="margin:24px 28px 0;">${imgNode(d.imageUrl, theme, 640)}</div>`
    + `</div>`;
}
