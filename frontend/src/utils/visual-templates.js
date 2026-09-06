// frontend/src/utils/visual-templates.js
// 视觉模板渲染函数（V2 Phase 1）：Composition 构图决定布局，StylePreset 只注入视觉语言参数包
// 布局函数签名统一 (theme, d, sp)：sp = getStyleParams 产物，函数体内零 preset 分支
// 单一渲染源：预览与导出共用本文件函数（规格 §3.1），模板只用 CSS 白名单属性
// 布局一律文档流 + flex；图片带 crossorigin 供 html2canvas useCORS 截图
import { resolveTheme } from './themes.js';
import { STYLE_PRESETS, normalizeStylePreset } from './style-presets.js';
import { normalizeComposition } from './compositions.js';

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

// 圆形图片节点：配合外层 50% 圆角 + overflow 容器；空 URL 用同形状 cream 圆占位
function roundImgNode(url, theme) {
  if (url) {
    return `<img src="${esc(url)}" crossorigin="anonymous" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">`;
  }
  return `<div style="width:100%;height:100%;border-radius:50%;background:${theme.cream};"></div>`;
}

// Part 序号补零两位：非数字/非法输入回退 '01'（渲染入口容错）
function pad2(n) {
  const num = Number(n);
  return Number.isFinite(num) ? String(Math.max(0, Math.floor(num))).padStart(2, '0') : '01';
}

// tags 胶囊工厂：各布局共用结构，边框/底色/文字/圆角由调用方传入（纯色 + border 白名单内）
function tagPills(tags, border, bg, textColor, radius) {
  return tags
    .map((t) => `<span style="display:inline-block;padding:2px 12px;margin-right:8px;border:1px solid ${border};border-radius:${radius}px;background:${bg};font-size:12px;color:${textColor};">${esc(clampText(t, 8))}</span>`)
    .join('');
}

// place · date 合并：两者均空时返回空串（避免悬空分隔符）
function joinPlaceDate(place, date) {
  return [place, date].filter(Boolean).join(' · ');
}

// ===== 视觉语言参数包 =====

// 非法风格回退 journal（布局函数只消费此包，零 preset 分支）
export function getStyleParams(presetId) {
  const p = STYLE_PRESETS[normalizeStylePreset(presetId)];
  return { ...p.styleParams };
}

// ===== Cover 布局（900×383）=====

// 主视觉横幅：白卡细描边 + org 装饰方块 + 大标题 + 图片带（零回归锚点布局，journal 参数下输出与历史版本逐字节一致）
function coverHero(theme, d, sp) {
  const tags = tagPills(d.tags, theme.accentA, theme.cardBg, theme.ink, 999);
  const placeDate = joinPlaceDate(d.place, d.date);
  // org 行前置强调色小方块（轻装饰语言；decorations=false 时整段省略）
  const orgDeco = sp.decorations
    ? `<span style="display:inline-block;width:10px;height:10px;margin-right:8px;background:${theme.accentA};"></span>`
    : '';
  const org = d.org
    ? `<div style="height:20px;margin-top:12px;font-size:14px;color:${theme.ink};">${orgDeco}${esc(clampText(d.org, 20))}</div>`
    : '';
  // 强字重视觉语言：卡片改强调色底 + 标题反白；弱字重保持白卡深标题（与历史版本一致）
  const cardSurface = sp.fontWeight !== 'normal' ? theme.accentA : theme.cardBg;
  const titleColor = sp.fontWeight !== 'normal' ? '#ffffff' : '#1a1a1a';
  const title = d.title
    ? `<div style="height:44px;margin-top:6px;font-size:32px;font-weight:bold;color:${titleColor};line-height:1.35;">${esc(clampText(d.title, 28))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:24px;margin-top:2px;font-size:17px;color:${theme.creamText};">${esc(clampText(d.subtitle, 20))}</div>`
    : '';
  // 白卡总高 355（329 内容 + 24 padding + 2 border）+ 上下 margin 14 = 383 精确闭合
  return `<div style="width: 900px;height: 383px;background:${theme.pageBg};display:flex;flex-direction:column;"><div style="margin:14px 18px;height:329px;background:${cardSurface};border:${sp.borderWidth}px solid ${theme.ink};border-radius:${theme.radius * sp.radiusScale}px;padding:12px 20px;display:flex;flex-direction:column;">${org}${title}${subtitle}<div style="margin-top:10px;">${imgNode(d.imageUrl, theme, 158)}</div><div style="margin-top:8px;height:22px;font-size:13px;color:${theme.creamText};">${tags}${placeDate ? esc(placeDate) : ''}</div></div></div>`;
}

// 圆形照片：左文右圆图，底部细线落款行
function coverCircle(theme, d, sp) {
  const tags = tagPills(d.tags, theme.accentA, theme.cardBg, theme.ink, 999);
  const placeDate = joinPlaceDate(d.place, d.date);
  const org = d.org
    ? `<div style="height:20px;font-size:14px;color:${theme.ink};">${sp.decorations ? `<span style="display:inline-block;width:10px;height:10px;margin-right:8px;background:${theme.accentA};"></span>` : ''}${esc(clampText(d.org, 20))}</div>`
    : '';
  const title = d.title
    ? `<div style="height:96px;margin-top:8px;font-size:34px;font-weight:bold;color:#1a1a1a;line-height:1.4;">${esc(clampText(d.title, 24))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:24px;margin-top:2px;font-size:17px;color:${theme.creamText};">${esc(clampText(d.subtitle, 20))}</div>`
    : '';
  const tagRow = d.tags.length ? `<div style="margin-top:10px;">${tags}</div>` : '';
  // 圆形照片容器：50% 圆角 + overflow 裁切，flex 行内 margin:auto 垂直居中
  const roundPhoto = `<div style="width:320px;height:320px;border-radius:50%;overflow:hidden;margin:auto 30px;flex-shrink:0;">${roundImgNode(d.imageUrl, theme)}</div>`;
  return `<div style="width: 900px;height: 383px;background:${theme.pageBg};display:flex;flex-direction:column;">`
    + `<div style="flex:1;display:flex;flex-direction:row;">`
    + `<div style="flex:1;padding:26px 0 0 32px;display:flex;flex-direction:column;">${org}${title}${subtitle}${tagRow}</div>`
    + roundPhoto
    + `</div>`
    + `<div style="height:40px;margin:0 32px;border-top:1px solid ${theme.creamBorder};font-size:13px;line-height:40px;color:${theme.creamText};">${placeDate ? esc(placeDate) : ''}</div>`
    + `</div>`;
}

// 杂志错位：大留白 + 编号 + ink 粗分割线 + 图片左缩进错位（全部 margin 文档流实现）
function coverEditorial(theme, d, sp) {
  const tags = tagPills(d.tags, theme.accentA, theme.cardBg, theme.ink, 999);
  const placeDate = joinPlaceDate(d.place, d.date);
  // 内层 303（383 - 上下 margin 80）精确预算：16+10+60+26+156+12+22 = 302
  return `<div style="width: 900px;height: 383px;background:${theme.pageBg};display:flex;flex-direction:column;">`
    + `<div style="margin:40px 50px;height:303px;display:flex;flex-direction:column;">`
    + `<div style="height:16px;font-size:14px;color:${theme.creamText};">No.${pad2(d.partNum)}</div>`
    + `<div style="height:0;margin-top:8px;border-top:2px solid ${theme.ink};"></div>`
    + (d.title ? `<div style="height:48px;margin-top:12px;font-size:36px;font-weight:bold;color:#1a1a1a;line-height:1.3;">${esc(clampText(d.title, 22))}</div>` : '')
    + (d.subtitle ? `<div style="height:22px;margin-top:4px;font-size:16px;color:${theme.creamText};">${esc(clampText(d.subtitle, 24))}</div>` : '')
    + `<div style="margin:16px 0 0 60px;">${imgNode(d.imageUrl, theme, 140)}</div>`
    + `<div style="margin-top:12px;font-size:13px;color:${theme.creamText};">${tags}${placeDate ? esc(placeDate) : ''}</div>`
    + `</div></div>`;
}

// 满版大图：上 260 高图区 + 下 123 白底信息条
function coverPhoto(theme, d, sp) {
  const tags = tagPills(d.tags, theme.accentA, theme.cardBg, theme.ink, 999);
  const placeDate = joinPlaceDate(d.place, d.date);
  return `<div style="width: 900px;height: 383px;background:${theme.pageBg};display:flex;flex-direction:column;">`
    + `<div style="height:260px;">${imgNode(d.imageUrl, theme, 260)}</div>`
    + `<div style="height:123px;background:${theme.cardBg};padding:0 32px;display:flex;flex-direction:column;justify-content:center;">`
    + (d.title ? `<div style="font-size:30px;font-weight:bold;color:#1a1a1a;line-height:1.3;">${esc(clampText(d.title, 24))}</div>` : '')
    + (d.subtitle ? `<div style="margin-top:2px;font-size:15px;color:${theme.creamText};">${esc(clampText(d.subtitle, 26))}</div>` : '')
    + `<div style="margin-top:6px;font-size:13px;color:${theme.creamText};">${tags}${placeDate ? esc(placeDate) : ''}</div>`
    + `</div></div>`;
}

// 极简文字：无图纯文字纵排居中，上下细线装饰；字重/强调文本由参数包驱动
function coverMinimal(theme, d, sp) {
  const placeDate = joinPlaceDate(d.place, d.date);
  const line = sp.decorations
    ? `<div style="height:0;width:60px;margin:24px auto;border-top:${sp.borderWidth}px solid ${theme.ink};"></div>`
    : '';
  // 强调文本语言：对文字内容做大写处理（不使用 text-transform CSS，规避 html2canvas 兼容红线）
  const orgText = clampText(d.org, 24);
  const org = d.org
    ? `<div style="font-size:14px;color:${theme.ink};">${esc(sp.uppercase ? orgText.toUpperCase() : orgText)}</div>`
    : '';
  const title = d.title
    ? `<div style="margin-top:6px;font-size:40px;font-weight:bold;color:#1a1a1a;line-height:1.3;">${esc(clampText(d.title, 20))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="margin-top:6px;font-size:17px;font-weight:${sp.fontWeight};color:${theme.creamText};">${esc(clampText(d.subtitle, 24))}</div>`
    : '';
  return `<div style="width: 900px;height: 383px;background:${theme.pageBg};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">`
    + `${line}${org}${title}${subtitle}${line}`
    + (placeDate ? `<div style="margin-top:4px;font-size:13px;color:${theme.creamText};">${esc(placeDate)}</div>` : '')
    + `</div>`;
}

// ===== Section 布局（900×1200）=====

// 杂志章节：白卡细描边 + PART 胶囊 + 大号序号 + 强调色细线 + 大图（journal 参数下输出与历史版本逐字节一致）
function sectionEditorial(theme, d, sp) {
  const part = pad2(d.partNum);
  const title = d.title
    ? `<div style="height:48px;margin-top:18px;font-size:34px;font-weight:bold;color:#1a1a1a;line-height:1.4;">${esc(clampText(d.title, 18))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="height:28px;margin-top:6px;font-size:19px;color:${theme.creamText};">${esc(clampText(d.subtitle, 16))}</div>`
    : '';
  // PART 胶囊与强调色细线属轻装饰语言（decorations=false 时省略，仅保留序号层级）
  const partPill = sp.decorations
    ? `<span style="display:inline-block;padding:2px 14px;margin-right:12px;border:1px solid ${theme.accentA};border-radius:999px;font-size:15px;color:${theme.ink};">PART</span>`
    : '';
  const divider = sp.decorations
    ? `<div style="height:0;margin-top:14px;border-top:2px solid ${theme.accentA};"></div>`
    : '';
  // 白卡总高 1156（1102 内容 + 52 padding + 2 border）+ 上下 margin 20 = 1196 ≤ 1200
  return `<div style="width: 900px;height: 1200px;background:${theme.pageBg};display:flex;flex-direction:column;">`
    + `<div style="margin:20px 24px;height:1102px;background:${theme.cardBg};border:${sp.borderWidth}px solid ${theme.ink};border-radius:${theme.radius * sp.radiusScale}px;padding:26px 30px;display:flex;flex-direction:column;">`
    + `<div style="height:96px;">${partPill}<span style="display:inline-block;font-size:72px;font-weight:bold;color:${theme.ink};line-height:1.3;">${esc(part)}</span></div>`
    + divider
    + `${title}${subtitle}`
    + `<div style="margin-top:24px;">${imgNode(d.imageUrl, theme, 640)}</div>`
    + `</div></div>`;
}

// 照片叠放：上文字区 + 图 A 全宽 + 图 B 负 margin 错位叠放（文档流实现叠层感）
function sectionPhotoStack(theme, d, sp) {
  const part = pad2(d.partNum);
  const url2 = d.image2Url || d.imageUrl;
  const title = d.title
    ? `<div style="height:44px;margin-top:8px;font-size:32px;font-weight:bold;color:#1a1a1a;line-height:1.35;">${esc(clampText(d.title, 16))}</div>`
    : '';
  return `<div style="width: 900px;height: 1200px;background:${theme.pageBg};display:flex;flex-direction:column;">`
    + `<div style="padding:40px 40px 0;">`
    + `<div style="height:20px;font-size:15px;color:${theme.creamText};">PART</div>`
    + `<div style="height:68px;margin-top:4px;font-size:56px;font-weight:bold;color:${theme.ink};line-height:1.2;">${esc(part)}</div>`
    + title
    + `</div>`
    + `<div style="margin-top:16px;">${imgNode(d.imageUrl, theme, 500)}</div>`
    + `<div style="width:70%;margin:-200px 40px 0 auto;">${imgNode(url2, theme, 380)}</div>`
    + (d.subtitle ? `<div style="margin:20px 40px 0;font-size:16px;color:${theme.creamText};">${esc(clampText(d.subtitle, 30))}</div>` : '')
    + `</div>`;
}

// 左右分栏：左 45% 文字列（PART + 大序号 + 细线 + 标题 + 副标题）+ 右 55% 满高图
function sectionSplit(theme, d, sp) {
  const part = pad2(d.partNum);
  const placeDate = joinPlaceDate(d.place, d.date);
  const line = sp.decorations
    ? `<div style="height:0;width:60px;margin-top:14px;border-top:${sp.borderWidth}px solid ${theme.ink};"></div>`
    : '';
  const title = d.title
    ? `<div style="height:90px;margin-top:18px;font-size:32px;font-weight:bold;color:#1a1a1a;line-height:1.4;">${esc(clampText(d.title, 14))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="margin-top:8px;font-size:17px;color:${theme.creamText};">${esc(clampText(d.subtitle, 20))}</div>`
    : '';
  return `<div style="width: 900px;height: 1200px;background:${theme.pageBg};display:flex;flex-direction:row;">`
    + `<div style="width:45%;padding:60px 36px;box-sizing:border-box;display:flex;flex-direction:column;">`
    + `<div style="height:20px;font-size:15px;color:${theme.creamText};">PART</div>`
    + `<div style="height:116px;margin-top:8px;font-size:96px;font-weight:bold;color:${theme.ink};line-height:1.2;">${esc(part)}</div>`
    + line + title + subtitle
    + (placeDate ? `<div style="margin-top:16px;font-size:13px;color:${theme.creamText};">${esc(placeDate)}</div>` : '')
    + `</div>`
    + `<div style="width:55%;">${imgNode(d.imageUrl, theme, 1200)}</div>`
    + `</div>`;
}

// 极简章节：无图纯文字竖排大留白（padding 100/60），细线 + 大序号 + 大标题
function sectionMinimal(theme, d, sp) {
  const part = pad2(d.partNum);
  const placeDate = joinPlaceDate(d.place, d.date);
  const line = sp.decorations
    ? `<div style="height:0;width:80px;margin-top:20px;border-top:${sp.borderWidth}px solid ${theme.ink};"></div>`
    : '';
  const title = d.title
    ? `<div style="margin-top:24px;font-size:44px;font-weight:bold;color:#1a1a1a;line-height:1.3;">${esc(clampText(d.title, 14))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="margin-top:10px;font-size:20px;font-weight:${sp.fontWeight};color:${theme.creamText};">${esc(clampText(d.subtitle, 22))}</div>`
    : '';
  const footerText = placeDate ? esc(sp.uppercase ? placeDate.toUpperCase() : placeDate) : '';
  return `<div style="width: 900px;height: 1200px;background:${theme.pageBg};display:flex;flex-direction:column;padding:100px 60px;box-sizing:border-box;">`
    + `<div style="height:20px;font-size:15px;color:${theme.creamText};">PART</div>`
    + `<div style="height:144px;margin-top:10px;font-size:120px;font-weight:bold;color:${theme.ink};line-height:1.2;">${esc(part)}</div>`
    + line + title + subtitle
    + (footerText ? `<div style="margin-top:auto;font-size:13px;color:${theme.creamText};">${footerText}</div>` : '')
    + `</div>`;
}

// 满版图浮层：全幅大图 + 底部信息条负 margin 上移形成浮层（文档流，非定位）
function sectionFullPhoto(theme, d, sp) {
  const part = pad2(d.partNum);
  const title = d.title
    ? `<div style="margin-top:4px;font-size:28px;font-weight:bold;color:#1a1a1a;line-height:1.3;">${esc(clampText(d.title, 18))}</div>`
    : '';
  const subtitle = d.subtitle
    ? `<div style="margin-top:2px;font-size:15px;color:${theme.creamText};">${esc(clampText(d.subtitle, 26))}</div>`
    : '';
  return `<div style="width: 900px;height: 1200px;background:${theme.pageBg};display:flex;flex-direction:column;">`
    + `<div>${imgNode(d.imageUrl, theme, 1200)}</div>`
    + `<div style="margin-top:-140px;height:120px;background:${theme.cardBg};padding:16px 40px;">`
    + `<div style="height:18px;font-size:13px;color:${theme.creamText};">PART · ${esc(part)}</div>`
    + title + subtitle
    + `</div></div>`;
}

// ===== 布局注册表：构图 id → 布局函数（新增构图 = compositions.js 注册 + 此处挂载）=====
export const COVER_LAYOUTS = {
  'cover-hero': coverHero, 'cover-circle': coverCircle, 'cover-editorial': coverEditorial,
  'cover-photo': coverPhoto, 'cover-minimal': coverMinimal,
};
export const SECTION_LAYOUTS = {
  'section-photo-stack': sectionPhotoStack, 'section-editorial': sectionEditorial,
  'section-split': sectionSplit, 'section-minimal': sectionMinimal, 'section-full-photo': sectionFullPhoto,
};

// ===== 渲染入口（V2）：composition 分派布局，stylePreset 只注入视觉语言参数包 =====

// 渲染封面首图：主题解析 + 参数包 + 构图归一化 + 字段容错，再分派布局
export function renderCoverPoster(data, themeId, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides);
  const sp = getStyleParams(opts.stylePreset);
  const comp = normalizeComposition(opts.composition, 'cover');
  // 字段全部容错：缺失给空串 / 空数组，绝不向模板泄漏 undefined
  const d = {
    org: data && data.org ? String(data.org) : '',
    title: data && data.title ? String(data.title) : '',
    subtitle: data && data.subtitle ? String(data.subtitle) : '',
    tags: Array.isArray(data && data.tags) ? data.tags.map((t) => String(t)) : [],
    place: data && data.place ? String(data.place) : '',
    date: data && data.date ? String(data.date) : '',
    imageUrl: data && data.imageUrl ? String(data.imageUrl) : '',
    partNum: data && data.partNum != null ? data.partNum : 1,
  };
  return COVER_LAYOUTS[comp](theme, d, sp);
}

// 渲染章节卡：同构入口（section 构图分派 + image2Url/地点日期容错）
export function renderSectionCard(data, themeId, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides);
  const sp = getStyleParams(opts.stylePreset);
  const comp = normalizeComposition(opts.composition, 'section');
  const d = {
    partNum: data && data.partNum != null ? data.partNum : 1,
    title: data && data.title ? String(data.title) : '',
    subtitle: data && data.subtitle ? String(data.subtitle) : '',
    imageUrl: data && data.imageUrl ? String(data.imageUrl) : '',
    image2Url: data && data.image2Url ? String(data.image2Url) : '',
    place: data && data.place ? String(data.place) : '',
    date: data && data.date ? String(data.date) : '',
  };
  return SECTION_LAYOUTS[comp](theme, d, sp);
}
