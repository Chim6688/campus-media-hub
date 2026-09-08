// 文末责编署名（规范检查硬性要求）：正文缺「责编 | 姓名」格式时自动追加
// 纯函数：TaskDetail 保存前与 StepWriting AI 初稿后共用（防双份漂移）
export function ensureSignatureText(content, author) {
  if (!content) return content; // 空正文不动（原语义：仅在已有内容时追加）
  if (!/责编\s*[|｜]\s*\S+/.test(content)) {
    return content.trimEnd() + `\n\n责编 | ${author}`;
  }
  return content;
}
