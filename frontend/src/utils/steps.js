// 流程步骤条纯函数：按数据完备度标完成，按状态标当前步（引导不是闸门）
const hasMaterial = (m) => !!(m?.name || (m?.highlights || []).length);
const hasDraft = (t) => (t.content || '').length >= 300 && (t.title || '').length >= 8;

export function computeSteps(task) {
  const matOk = hasMaterial(task.material);
  const draftOk = hasDraft(task);
  // 排版完成 = 已推进到审核/发布（写稿中排版是当前待办：预览调参认可后才送审）
  const layoutOk = task.status === 'reviewing' || task.status === 'published';
  const steps = [
    { key: 'topic', label: '选题', done: true },                       // 已建任务=选题完成
    { key: 'material', label: '素材', done: matOk },
    { key: 'draft', label: '成稿', done: draftOk },
    { key: 'layout', label: '排版', done: layoutOk },
    { key: 'review', label: '审核', done: task.status === 'published' },
  ];
  // 当前步：第一个未完成项；reviewing 时当前=审核
  const activeIdx = task.status === 'reviewing' ? 4 : steps.findIndex((s) => !s.done);
  if (activeIdx >= 0) steps[activeIdx].active = true;
  if (task.status === 'published') steps.forEach((s) => (s.done = true));
  return steps;
}
