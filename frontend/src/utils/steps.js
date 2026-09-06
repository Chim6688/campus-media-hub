// 七步工作流纯函数（V1.0 Phase 2 六改七）：按数据完备度标完成，按状态标当前步（引导不是闸门）
// 工作流 UI 与数据库状态（writing/reviewing/published）解耦：步骤是展示引导，状态是业务事实
const hasMaterial = (m) => !!(m?.name || (m?.highlights || []).length);
const hasDraft = (t) => (t.content || '').length >= 300 && (t.title || '').length >= 8;
// 配图完成：已绑定正文图片（Phase 3），或照片说明非空，或正文已有配图占位
const hasImages = (t, boundCount) =>
  boundCount > 0 || !!(t.material?.photoNotes || '').trim() || /\[配图[：:]/.test(t.content || '');

// contentImagesBound：当前任务已绑定槽位的正文图片数（由配图工作台维护，缺省 0 向后兼容）
// visualOk（Phase 7 升级）：任务视觉图已生成落库（source='ai' 的图片存在，由详情页刷新链路上报）
export function computeSteps(task, contentImagesBound = 0, visualOk = false) {
  // 排版/检查完成 = 已推进到审核或发布（送审前必须认可排版、通过规范检查门禁）
  const layoutOk = task.status === 'reviewing' || task.status === 'published';
  // 视觉完成 = 有视觉图数据，或已送审（送审即视为认可，兼容审核中回看）
  const visualDone = visualOk || layoutOk;
  const steps = [
    { key: 'material', label: '素材', done: hasMaterial(task.material) },
    { key: 'draft', label: '写稿', done: hasDraft(task) },
    { key: 'images', label: '配图', done: hasImages(task, contentImagesBound) },
    { key: 'visual', label: '视觉', done: visualDone },
    { key: 'layout', label: '排版', done: layoutOk },
    { key: 'check', label: '检查', done: layoutOk },
    { key: 'review', label: '审核', done: task.status === 'published' },
  ];
  // 已发布：全部完成，无当前步
  if (task.status === 'published') {
    steps.forEach((s) => (s.done = true));
    return steps;
  }
  // 审核中：锁定审核步为当前步，此前步骤视为已完成（已送审 = 前面流程已走完）
  if (task.status === 'reviewing') {
    steps.forEach((s, i) => { if (i < steps.length - 1) s.done = true; });
    steps[steps.length - 1].active = true;
    return steps;
  }
  // 写稿中：当前步 = 第一个未完成项
  const activeIdx = steps.findIndex((s) => !s.done);
  if (activeIdx >= 0) steps[activeIdx].active = true;
  return steps;
}
