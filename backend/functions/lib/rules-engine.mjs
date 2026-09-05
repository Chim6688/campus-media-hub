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
  const c = await imageChecks(db, task);
  const errors = [...a.errors, ...b.errors, ...c.errors];
  const warnings = [...a.warnings, ...b.warnings, ...c.warnings];
  return { errors, warnings, passed: errors.length === 0 };
}

// 发布前图片/事实检查（V1.0 Phase 4 §13 + Phase 6 §15/§20）：
// 配图占位必须有绑定图（error）；封面必须设置（Phase 6 升 error）；有素材须确认事实（§15）
async function imageChecks(db, task) {
  const issues = { errors: [], warnings: [] };
  if (!task.id || !db) return issues; // 无任务上下文时跳过（防单测外调用出错）

  const { data: images } = await db
    .from('article_images')
    .select('type, position')
    .eq('task_id', task.id);
  const imgs = images || [];

  // 封面必检（§20）：缺失 = error 阻断提交
  if (!imgs.some((i) => i.type === 'cover')) {
    issues.errors.push({
      rule: '封面',
      message: '未设置封面图',
      hint: '公众号推送必需封面，去第③步配图上传（建议 900×383）',
    });
  }

  // 事实确认（§15）：有素材但未勾"已核实" = error（AI 基于未确认素材写稿有编造风险）
  const hasMaterial = !!(task.material?.name || (task.material?.highlights || []).length);
  if (hasMaterial && task.material?.confirmed !== true) {
    issues.errors.push({
      rule: '事实确认',
      message: '素材信息尚未核实确认',
      hint: '去第①步素材面板勾选「素材已核实」，或修正/删除未确认信息',
    });
  }

  // 配图绑定（§13）：占位数 > 绑定数 = error（带占位送审 = 发布时露缺图提示）
  const imgMarks = ((task.content || '').match(/\[配图[^\]]*\]/g) || []).length;
  if (imgMarks > 0) {
    const boundCount = imgs.filter((i) => i.type === 'content' && i.position > 0).length;
    if (boundCount < imgMarks) {
      issues.errors.push({
        rule: '配图绑定',
        message: `有 ${imgMarks - boundCount} 处配图占位未绑定图片`,
        hint: '去第③步配图为每个占位槽选择或上传图片，或删除多余占位',
      });
    }
  }
  return issues;
}
