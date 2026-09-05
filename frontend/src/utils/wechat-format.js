// Markdown → 手账卡片风微信 HTML 转换器（方向 D 定稿，参照 demo/theme-direction-d.html）
// 纯函数、不调 AI：确定性转换，全部内联样式（公众号会剥离 class）
import { marked } from 'marked';
import { THEMES, DEFAULT_THEME, resolveTheme } from './themes.js';

// ===== 基础工具 =====

// HTML 转义：防止文稿中的 <>& 被当作标签
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 行内格式：转义 + 加粗/斜体 + 行内配图占位
function inline(s, theme) {
  let t = esc(s);
  // 加粗
  t = t.replace(/\*\*([^*]+)\*\*/g, `<strong style="font-weight:bold;color:${theme.ink};">$1</strong>`);
  // 参考文献上标标记〔N〕 → 上标序号（批3：extractLinks 产生的临时标记在此渲染；用内联 span 不用 sup，微信编辑器兼容）
  t = t.replace(/〔(\d+)〕/g, (m, n) => `<span style="vertical-align:super;font-size:0.75em;color:${theme.accentA};">${n}</span>`);
  // 行内配图占位（非整段占位时以小标签呈现）
  t = t.replace(
    /\[配图[：:]\s*([^\]]*)\]/g,
    `<span style="display:inline-block;padding:1px 8px;margin:0 2px;border:1px dashed #bbb;border-radius:4px;color:#999;font-size:12px;">📷配图：$1</span>`,
  );
  // 单换行 → <br>（对齐 marked breaks 行为）
  t = t.replace(/\n/g, '<br>');
  return t;
}

const pad2 = (n) => String(n).padStart(2, '0');
// 整段都是配图占位：[配图：xxx]
const isPlaceholderPara = (t) => /^\[配图[：:]\s*[^\]]*\]\s*$/.test(t.trim());
// 落款段：含 编辑｜/责编 |/校对｜/审核｜ 的段落
const isFooterPara = (t) => /(编辑|责编|校对|审核)\s*[｜|]/.test(t.split('\n')[0]);

// ===== 模板组件（色值全部取自 theme，换皮肤=换theme对象） =====

// 双层错位描边标题卡（demo L13-22）
function titleCard(theme, title, eyebrow) {
  const t = inline(title, theme);
  const brow = eyebrow
    ? `<span style="display:inline-block;border:1px solid ${theme.ink};border-radius:20px;padding:2px 16px;font-size:13px;color:${theme.ink};">${esc(eyebrow)}</span>`
    : '';
  return `<section style="position:relative;margin:30px 8px 40px;background:${theme.cardBg};border:${theme.borderWidth}px solid ${theme.ink};border-radius:${theme.titleRadius}px;padding:28px 20px 24px;">
<section style="position:absolute;left:-8px;top:-8px;right:14px;bottom:14px;border:2px solid ${theme.accentA};border-radius:${theme.titleRadius}px;"></section>
<section style="position:absolute;left:14px;top:14px;right:-8px;bottom:-8px;border:2px solid ${theme.accentB};border-radius:${theme.titleRadius}px;"></section>
<section style="position:relative;text-align:center;">${brow}
<p style="font-size:${theme.titleFontSize}px;font-weight:bold;color:#1a1a1a;line-height:1.6;margin:14px 0 0;">${t}</p>
</section>
</section>`;
}

// 黑细描边引言卡（demo L30-33，用于开头金句）
function introCard(theme, text) {
  return `<section style="background:${theme.cardBg};border:${theme.thinBorder}px solid ${theme.ink};border-radius:${theme.radius}px;padding:18px 20px;margin:0 8px 36px;">
<p style="font-size:${theme.bodyFontSize}px;color:${theme.ink};line-height:${theme.bodyLineHeight};margin:0;">${inline(text, theme)}</p>
</section>`;
}

// 小节标题：半圆序号 + 黑虚线胶囊 + 绿菱形（demo L36-40）
function sectionTitle(theme, num, text) {
  return `<section style="text-align:center;margin:0 0 30px;">
<span style="display:inline-block;background:${theme.accentA};color:#fff;font-size:15px;font-weight:bold;padding:6px 10px;border-radius:6px 20px 20px 6px;vertical-align:middle;">${pad2(num)}</span>
<span style="display:inline-block;background:${theme.cardBg};border:${theme.borderWidth}px dashed ${theme.ink};border-radius:0 24px 24px 0;padding:6px 22px 6px 16px;font-size:${theme.sectionFontSize}px;font-weight:bold;color:#1a1a1a;vertical-align:middle;margin-left:-4px;">${inline(text, theme)}</span>
<span style="display:inline-block;width:10px;height:10px;background:${theme.accentB};vertical-align:middle;margin-left:8px;transform:rotate(45deg);"></span>
</section>`;
}

// 子标题：绿圆片序号 + 白底绿顶线（demo L64-68，对应 ###）
function subHeading(theme, num, text) {
  return `<section style="text-align:center;margin:0 8px 14px;">
<span style="display:inline-block;background:${theme.accentB};color:#fff;font-size:13px;font-weight:bold;width:26px;height:26px;line-height:26px;border-radius:50%;vertical-align:middle;">${num}</span>
<span style="display:inline-block;background:${theme.cardBg};border-top:${theme.borderWidth}px solid ${theme.accentB};border-radius:0 0 10px 10px;padding:6px 18px;font-size:${theme.bodyFontSize}px;font-weight:bold;color:#1a1a1a;vertical-align:middle;">${inline(text, theme)}</span>
</section>`;
}

// 正文卡：白底对角圆角（demo L43-45）
function bodyCard(theme, text) {
  return `<section style="background:${theme.cardBg};border-radius:${theme.radius}px 0 ${theme.radius}px 0;padding:20px 22px;margin:0 8px ${theme.sectionGap}px;">
<p style="font-size:${theme.bodyFontSize}px;color:${theme.ink};line-height:${theme.bodyLineHeight};text-align:justify;text-indent:2em;margin:0;">${inline(text, theme)}</p>
</section>`;
}

// 绿胶囊标签（demo L48-50，用于"核心信息"节标题）
function infoBadge(theme, text) {
  return `<section style="text-align:center;margin:0 8px 14px;">
<span style="display:inline-block;background:${theme.accentB};color:#fff;font-size:15px;font-weight:bold;padding:5px 20px;border-radius:14px;box-shadow:0 0 0 3px ${theme.pageBg}, 0 0 0 5px ${theme.accentB};">${inline(text, theme)}</span>
</section>`;
}

// 信息卡：等宽行（demo L53-55）
function infoCard(theme, text) {
  return `<section style="background:${theme.cardBg};border-radius:${theme.radius}px 0 ${theme.radius}px 0;padding:20px 24px;margin:0 8px ${theme.sectionGap}px;">
<p style="font-size:16px;color:${theme.ink};line-height:${theme.bodyLineHeight + 0.2};margin:0;">${inline(text, theme)}</p>
</section>`;
}

// 粉描边金句条（demo L71-73，正文中段引用）
function quoteCard(theme, text) {
  return `<section style="background:${theme.cardBg};border:${theme.thinBorder}px solid ${theme.accentA};border-radius:${theme.titleRadius}px;padding:14px 20px;margin:0 8px ${theme.sectionGap}px;text-align:center;">
<span style="font-size:${theme.bodyFontSize}px;color:${theme.ink};line-height:1.9;">${inline(text, theme)}</span>
</section>`;
}

// 奶油落款卡（demo L76-79）
function footerCard(theme, text) {
  return `<section style="background:${theme.cream};border:1px solid ${theme.creamBorder};border-radius:12px;padding:20px 24px;margin:0 8px;text-align:center;">
<p style="font-size:14px;color:${theme.ink};line-height:${theme.bodyLineHeight + 0.1};margin:0;">${inline(text, theme)}</p>
</section>`;
}

// 配图槽位（V1.0 Phase 4）：第 N 个整段占位 = 槽位 N
// 已绑定 → 真实 <img>（预览/复制/分享同源）；未绑定 → 缺图提示占位（绝不渲染假图）
function imageSlot(theme, desc, img) {
  if (img) {
    // 真实图：全宽圆角 + 可选说明条（说明优先取图片 caption，缺省用占位描述）
    const cap = (img.caption || '').trim() || desc;
    const capHtml = cap
      ? `<p style="font-size:12px;color:${theme.creamText};text-align:center;margin:6px 0 0;">${esc(cap)}</p>`
      : '';
    return `<section style="margin:16px 8px 36px;"><img src="${esc(img.url)}" alt="${esc(cap || '配图')}" style="width:100%;display:block;border-radius:${theme.radius}px;border:1px solid ${theme.creamBorder};">${capHtml}</section>`;
  }
  return `<section style="margin:16px 8px 36px;padding:24px 20px;border:2px dashed #e67e22;border-radius:8px;text-align:center;color:#999;font-size:13px;background:${theme.cardBg};">📷 配图：${esc(desc)}<br><span style="font-size:11px;color:#e67e22;">（未绑定图片：去第③步配图选择或上传）</span></section>`;
}

// 列表条目：绿圆点（无序列表）
function listRow(theme, text) {
  return `<section style="margin:0 8px 10px;">
<span style="display:inline-block;width:8px;height:8px;background:${theme.accentB};border-radius:50%;margin-right:10px;vertical-align:middle;"></span>
<span style="font-size:${theme.bodyFontSize}px;color:${theme.ink};line-height:${theme.bodyLineHeight - 0.1};vertical-align:middle;display:inline-block;width:calc(100% - 20px);">${inline(text, theme)}</span>
</section>`;
}

// 链接提取（批3）：[label](url) → label〔N〕，url 收进 refs（同 URL 复用序号）
// 只认 http(s) 绝对链接，相对路径原样保留防误伤；〔N〕由 inline() 渲染为上标
export function extractLinks(s, refs) {
  return String(s).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    let i = refs.indexOf(url);
    if (i === -1) { refs.push(url); i = refs.length - 1; }
    return `${label}〔${i + 1}〕`;
  });
}

// 参考链接落款卡（批3）：文末奶油卡列出全部链接，读者长按复制
function refCard(theme, refs) {
  const rows = refs
    .map((u, i) => `<p style="font-size:12px;color:${theme.creamText};line-height:1.8;margin:0;word-break:break-all;">[${i + 1}] ${esc(u)}</p>`)
    .join('');
  return `<section style="background:${theme.cream};border:1px solid ${theme.creamBorder};border-radius:12px;padding:14px 20px;margin:20px 8px 8px;text-align:left;"><p style="font-size:12px;color:${theme.creamText};margin:0 0 6px;">📎 参考链接（微信正文链接不可点，长按复制网址打开）</p>${rows}</section>`;
}

// ===== 主入口 =====

// markdown: 正文 Markdown；opts.title/opts.eyebrow 用于文首标题卡；opts.images 为绑定正文图
// （{position,url,caption}[]，Phase 3 槽位模型：第 N 个整段 [配图：] 占位 = 槽位 N）
export function markdownToWechatHTML(markdown, themeId = DEFAULT_THEME, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides); // 预设 + 用户覆盖合并后的完整令牌
  const tokens = marked.lexer(markdown || '');
  const refs = []; // 批3：全文链接收集（同 URL 复用序号）
  // Phase 4：position → 绑定图片映射（稀疏绑定场景按 position 精确查）
  const imageByPos = new Map((opts.images || []).map((i) => [i.position, i]));
  let slotIdx = 0; // 整段占位出现次序（第 1 个占位 = 槽位 1）
  const parts = [];
  let sectionNum = 0; // 小节/子标题共用递增序号（01/02/03...）
  let inInfoSection = false; // 是否处于"核心信息"类小节内
  let introDone = false; // 开头引言卡只渲染一次
  let hasH1 = false;

  for (const tok of tokens) {
    switch (tok.type) {
      case 'heading': {
        const text = (tok.text || '').trim();
        if (tok.depth === 1) {
          hasH1 = true;
          // 支持 "# 眉标｜标题" 拆分
          const m = text.match(/^(.+?)[｜|]\s*(.+)$/);
          parts.push(m ? titleCard(theme, m[2], m[1]) : titleCard(theme, text, opts.eyebrow));
        } else if (tok.depth === 2) {
          inInfoSection = /核心信息|重要信息|活动信息/.test(text);
          if (inInfoSection) {
            parts.push(infoBadge(theme, text));
          } else {
            sectionNum += 1;
            parts.push(sectionTitle(theme, sectionNum, text));
          }
        } else {
          inInfoSection = false;
          sectionNum += 1;
          parts.push(subHeading(theme, sectionNum, text));
        }
        break;
      }
      case 'paragraph': {
        const text = extractLinks((tok.text || '').trim(), refs);
        if (isPlaceholderPara(text)) {
          // 第 N 个整段占位 = 槽位 N：绑定则渲染真实图，未绑定显示缺图提示
          slotIdx += 1;
          parts.push(imageSlot(theme, text.replace(/^\[配图[：:]\s*/, '').replace(/\]$/, ''), imageByPos.get(slotIdx) || null));
        } else if (isFooterPara(text)) {
          parts.push(footerCard(theme, text));
        } else if (inInfoSection) {
          parts.push(infoCard(theme, text));
        } else {
          parts.push(bodyCard(theme, text));
        }
        break;
      }
      case 'blockquote': {
        // 第一个引用 = 开头引言卡；后续引用 = 金句条
        if (!introDone) {
          introDone = true;
          parts.push(introCard(theme, extractLinks(tok.text || '', refs)));
        } else {
          parts.push(quoteCard(theme, extractLinks(tok.text || '', refs)));
        }
        break;
      }
      case 'list': {
        for (const item of tok.items || []) {
          if (inInfoSection) {
            parts.push(infoCard(theme, extractLinks(item.text || '', refs)));
          } else {
            parts.push(listRow(theme, extractLinks((tok.ordered ? `${item.taskDelimiter ? '' : ''}` : '') + (item.text || ''), refs)));
          }
        }
        // 列表结束后补一段间距
        parts.push(`<section style="height:20px;line-height:20px;">&nbsp;</section>`);
        break;
      }
      case 'hr':
        parts.push(`<section style="border-top:1px dashed ${theme.creamBorder};margin:20px 8px 30px;"></section>`);
        break;
      default:
        break; // space/code 等暂不特殊处理
    }
  }

  // 文首标题卡：内容无 # 标题且外部传了标题时，用任务标题渲染
  if (!hasH1 && opts.title) {
    parts.unshift(titleCard(theme, opts.title, opts.eyebrow));
  }

  // 批3：有链接时文末追加参考链接区（放在最末，落款卡之后，与 wechat-format 先例一致）
  if (refs.length) parts.push(refCard(theme, refs));

  // 外层包裹：底色 + 字体（复制到公众号时底色随行）
  return `<section style="background:${theme.pageBg};padding:24px 16px 40px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;max-width:100%;">\n${parts.join('\n')}\n</section>`;
}

// 纯文本版（剪贴板 text/plain 用）
export function markdownToPlainText(markdown) {
  return markdown || '';
}
