// AI 生成皮肤（B 批）：配色契约与清洗纯函数
// 契约 = themes.js 皮肤对象的 8 个色键；AI 只生成配色，圆角/字号等数值令牌仍由用户手调

// 字段清单：key/label/hint 与后端 gen_skin prompt 语义一一对应（prompt 见 prompts.mjs）
export const SKIN_FIELDS = [
  { key: 'pageBg', label: '页面底色', hint: '浅色，整页背景' },
  { key: 'accentA', label: '强调色A', hint: '标题错位层/序号胶囊/金句描边' },
  { key: 'accentB', label: '强调色B', hint: '标签胶囊/圆点/菱形装饰' },
  { key: 'ink', label: '正文墨色', hint: '深色，正文文字与卡片描边' },
  { key: 'cardBg', label: '卡片底色', hint: '接近白色' },
  { key: 'cream', label: '落款底色', hint: '浅色，落款卡背景' },
  { key: 'creamBorder', label: '落款描边', hint: '比落款底色深一档' },
  { key: 'creamText', label: '落款文字', hint: '灰色调' },
];

// 合法 hex：#rgb 或 #rrggbb（大小写均可）
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// 清洗 AI 输出：只保留 8 个契约键中的合法 hex；任何异常输入返回空对象（调用方据此报错）
export function normalizeSkin(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const { key } of SKIN_FIELDS) {
    const v = raw[key];
    if (typeof v === 'string' && HEX_RE.test(v.trim())) out[key] = v.trim();
  }
  return out;
}
