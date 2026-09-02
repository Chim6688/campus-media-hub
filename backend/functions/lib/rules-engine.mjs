// 规范检查纯代码规则引擎：确定性步骤不调 LLM（省钱且结果稳定）
// 返回 { errors, warnings, passed }：errors 非空则阻断流转到"审核"

// 内置规则：纯文本可检查的硬规范
function builtinChecks(task) {
  const issues = { errors: [], warnings: [] };
  const content = (task.content || '').trim();
  const paragraphs = content.split(/\n+/).filter((p) => p.trim());
  const title = (task.title || '').trim();

  // 1. 标题必填且长度 8-30 字
  if (!title) {
    issues.errors.push({ rule: '标题', message: '标题不能为空', hint: '填写标题或点「AI 改标题」生成' });
  } else if (title.length < 8 || title.length > 30) {
    issues.warnings.push({ rule: '标题长度', message: `当前 ${title.length} 字，建议 8-30 字`, hint: '过长会被公众号折叠' });
  }

  // 2. 摘要必填（公众号推送必需）
  if (!(task.summary || '').trim()) {
    issues.errors.push({ rule: '摘要', message: '摘要不能为空', hint: '填写摘要或点「AI 摘要」生成' });
  }

  // 3. 正文篇幅：少于 300 字提示太短
  if (content.length < 300) {
    issues.warnings.push({ rule: '篇幅', message: `正文仅 ${content.length} 字，公众号推文建议 600 字以上`, hint: '可选中段落点「选中改写-扩写细节」' });
  }

  // 4. 文末责编署名：须有"责编 | 姓名"格式
  if (!/责编\s*[|｜]\s*\S+/.test(content)) {
    issues.errors.push({ rule: '责编署名', message: '文末缺少责编署名', hint: '在文末添加一行：责编 | 你的名字' });
  }

  // 5. 配图占位：每 4 段以内应有一处 [配图 说明]（配图由用户在搜图神器自备）
  const imgMarks = (content.match(/\[配图[^\]]*\]/g) || []).length;
  const need = Math.max(1, Math.ceil(paragraphs.length / 4));
  if (imgMarks < need) {
    issues.warnings.push({
      rule: '配图占位',
      message: `正文约 ${paragraphs.length} 段，建议至少 ${need} 处 [配图： 说明]（当前 ${imgMarks} 处）`,
      hint: '长文无图阅读疲劳，去搜图神器找图后替换占位',
    });
  }

  return issues;
}

// 数据库自定义规则（禁用词/称呼规范等，pattern 为包含匹配）
async function dbChecks(db, task) {
  const issues = { errors: [], warnings: [] };
  const { data: rules } = await db.from('rules').select('*').eq('enabled', true);
  const text = `${task.title || ''}\n${task.content || ''}`;
  for (const r of rules || []) {
    if (text.includes(r.pattern)) {
      const issue = { rule: r.name, message: r.message, hint: `命中："${r.pattern}"` };
      (r.severity === 'error' ? issues.errors : issues.warnings).push(issue);
    }
  }
  return issues;
}

export async function runChecks(db, task) {
  const a = builtinChecks(task);
  const b = await dbChecks(db, task);
  const errors = [...a.errors, ...b.errors];
  const warnings = [...a.warnings, ...b.warnings];
  return { errors, warnings, passed: errors.length === 0 };
}
