// 按动作组织独立 prompt（参考 wechat-ai-writer 的分步提示词链，而非一个大 prompt 全包）
const SYSTEM = `你是高校学院融媒体中心的资深公众号编辑，熟悉年轻学生读者的阅读习惯。
写作要求：语言自然不说教、多用短句、段落简短（每段 2-4 行）、避免堆砌华丽辞藻。输出纯文本，不要 Markdown 标记。`;

export const PROMPTS = {
  // 生成初稿：输入主题/类型/要点，输出标题+摘要+正文
  draft: (p) => [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `请为学院公众号写一篇【${p.type}】推文。
主题：${p.theme}
要点/素材：${p.notes || '（无补充素材，请围绕主题合理展开）'}
篇幅：600-900 字。
请严格按以下格式输出：
标题：xxx
摘要：xxx（50 字内）
正文：
xxx`,
    },
  ],
  // 改标题：输出 3 个候选
  title: (p) => [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `为以下推文拟 3 个公众号标题，风格各有侧重（一个正式、一个活泼、一个悬念式），每个不超过 25 字，编号输出：
标题原文：${p.title}
正文：${p.content.slice(0, 800)}`,
    },
  ],
  // 写摘要：50 字内
  summary: (p) => [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `为以下推文写公众号推送摘要，50 字以内，一句有信息量的话，不要"本文介绍了"式开头：
标题：${p.title}
正文：${p.content.slice(0, 800)}`,
    },
  ],
  // 选中改写：只重写选中文字，输出不含任何解释
  rewrite: (p) => [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `只改写下面这段文字，要求：${p.instruction}。直接输出改写后的文字，不要任何解释和引号：
${p.selection}`,
    },
  ],
};
