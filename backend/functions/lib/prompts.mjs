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
  // 策划书素材提取：PDF文本 → 结构化 JSON（parse-pdf.mjs 调用）
  extract_material: (p) => [
    { role: 'system', content: '你是高校学院融媒体中心的编辑助理，擅长从活动策划书中提取写推文所需的关键信息。' },
    {
      role: 'user',
      content: `从以下活动策划书文本中提取关键信息，严格按 JSON 格式输出，不要输出任何其他文字：
要求字段：
- name: 活动名称（简短）
- time: 活动时间
- location: 活动地点
- target: 参与对象
- highlights: 活动亮点（数组，3-6 条，每条一句话）
- flow: 活动流程（数组，按顺序列出主要环节，每条简短）
- meaning: 活动意义/背景（1-2 句话）

策划书文本：
${p.text.slice(0, 6000)}

输出严格 JSON，不要 markdown 代码块包裹。`,
    },
  ],
  // 一键成稿：结构化素材 + 现场补充 → 完整初稿（含手账卡片模板所需的 Markdown 结构约定）
  draft_from_material: (p) => [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `请为学院公众号写一篇【${p.type || '活动报道'}】推文。

活动信息：
- 活动名称：${p.material?.name || p.theme}
- 时间：${p.material?.time || '（待补充）'}
- 地点：${p.material?.location || '（待补充）'}
- 参与对象：${p.material?.target || '（待补充）'}

活动亮点：
${(p.material?.highlights || []).map((h, i) => `${i + 1}. ${h}`).join('\n')}

活动流程：
${(p.material?.flow || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

活动意义：${p.material?.meaning || ''}

现场补充亮点/素材：${p.liveNotes || '（无补充，请基于以上信息合理展开）'}
照片说明（用于配图占位）：${p.photoNotes || '（无）'}

篇幅：600-900 字。
正文必须按以下 Markdown 结构约定输出（供手账卡片风模板渲染）：
- 正文开头用 1-3 句引导性金句（将被渲染为引言卡）
- 用 ## 划分 2-4 个小节（如 ## 活动介绍、## 核心信息、## 活动流程；"核心信息"小节内逐行写时间/地点/名额等要点）
- 段落之间用空行分隔，合适位置插入 [配图：说明] 占位
- 文末输出署名行（编辑｜作者名）
请严格按以下 JSON 格式输出（不要输出任何其他文字，不要用 markdown 代码块包裹）：
{"title":"标题","summary":"摘要（50字内）","content":"正文内容（Markdown，含##小节/[配图：说明]占位/文末署名）"}`,
    },
  ],
  // 整改清单：老师微信"语音转文字" → 逐条意见（P0-2 打回录入）
  organize_review_notes: (p) => [
    { role: 'system', content: '你是编辑助理，擅长把口语化的微信留言整理成清晰的逐条意见。' },
    {
      role: 'user',
      content: `把下面老师的审核意见整理为逐条整改项。要求：
- 拆成独立、可执行、可勾选的短句（每条不超过 30 字）
- 去掉寒暄、语气词、重复内容
- 保留具体要求（如"第二段数据要核实"）
严格按 JSON 数组格式输出，不要任何其他文字和代码块包裹，如 ["意见1","意见2"]

老师意见原文：
${p.text.slice(0, 2000)}`,
    },
  ],
};
