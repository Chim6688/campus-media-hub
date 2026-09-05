// 发布前检查纯函数（V1.0 Phase 6，§20）：把分散的完成度信号汇总为八项清单
// state：coverOk（配图工作台上报有封面）、boundCount（绑定正文图数）、report（/api/check 结果，null=未跑）
// 返回 [{ name, ok, hint }]；ok 全 true 才可提交审核（体验层；后端 rules-engine 为真门禁）

export function buildPrecheck(task, state) {
  const content = task.content || '';
  const title = (task.title || '').trim();
  const summary = (task.summary || '').trim();
  const hasMaterial = !!(task.material?.name || (task.material?.highlights || []).length);
  const imgMarks = (content.match(/\[配图[^\]]*\]/g) || []).length;
  const { coverOk, boundCount, report } = state;

  return [
    {
      name: '标题',
      ok: !!title && title.length >= 8 && title.length <= 30,
      hint: title ? `当前 ${title.length} 字，建议 8-30 字（过长会被公众号折叠）` : '头部标题框填写，或第②步点「AI 改标题」',
    },
    {
      name: '摘要',
      ok: !!summary,
      hint: '填写公众号推送摘要，或第②步点「AI 摘要」生成',
    },
    {
      name: '正文',
      ok: content.length >= 300,
      hint: `当前 ${content.length} 字，公众号推文建议 600 字以上`,
    },
    {
      name: '事实确认',
      ok: !hasMaterial || task.material?.confirmed === true,
      hint: hasMaterial ? '去第①步素材面板勾选「素材已核实」' : '（无素材任务，跳过）',
    },
    {
      name: '封面',
      ok: !!coverOk,
      hint: '去第③步配图上传封面（建议 900×383）',
    },
    {
      name: '正文配图',
      ok: imgMarks === 0 || boundCount >= imgMarks,
      hint: imgMarks === 0 ? '（无占位，可去第③步补配图计划）' : `占位 ${imgMarks} 处，已绑定 ${boundCount} 张，去第③步配图补齐`,
    },
    {
      name: '排版',
      ok: true, // 模板系统常驻：预览即最终效果，第④步调参满意即视为通过
      hint: '第④步排版预览确认效果',
    },
    {
      name: '规范检查',
      ok: !!report && report.passed === true,
      hint: report ? (report.passed ? '' : `有 ${report.errors.length} 个必须整改项，见下方报告`) : '点「规范检查」运行一次',
    },
  ];
}
