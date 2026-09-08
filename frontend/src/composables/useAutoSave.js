// frontend/src/composables/useAutoSave.js
// 自动保存统一通道（总方案 §8）：markDirty → 防抖 → 一次 PATCH 全量状态 → 成功"已保存"/失败可见可重试
// - 串行队列：任何时刻至多一个 persist in flight，顺序=发起顺序（杜绝旧响应晚到覆盖新内容）
// - dirty 标记：保存成功清零、失败保留；flushOnLeave 离开页面时补存未保存编辑
// 宿主职责：getBody 组装当前完整可保存状态；persist 执行落库（host 的 /api/tasks PATCH）
// 可测性：纯编排逻辑，不依赖组件实例（getCurrentInstance 保护生命周期注册，node --test 可直接测）
import { ref, getCurrentInstance, onBeforeUnmount } from 'vue';

const DEFAULT_DEBOUNCE_MS = 2000;

export function useAutoSave({ getBody, persist, isSwitching = () => false, onError = () => {}, onSaved = () => {}, debounceMs = DEFAULT_DEBOUNCE_MS }) {
  const saving = ref(false);
  const savedAt = ref('');
  const autoSaved = ref(false);
  let saveTimer = null;
  let dirty = false;
  let saveChain = Promise.resolve();

  // 编辑 → 标记脏 → 防抖调度（宿主所有编辑源统一入口，不各自发 PATCH）
  function markDirty() {
    if (isSwitching()) return; // 任务切换回填不触发保存
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (dirty) void save(true).catch(() => {}); // 失败已由 onError 反馈；.catch 兜底 unhandled
    }, debounceMs);
  }

  // 保存：串行排队。await save() = 等自己（及之前排队者）落库完成
  function save(isAuto = false) {
    const run = saveChain.then(() => doSave(isAuto));
    saveChain = run.catch(() => {}); // 吞错防链断；run 仍向调用方抛错（宿主自行 catch）
    return run;
  }

  async function doSave(isAuto) {
    saving.value = true;
    try {
      const body = getBody(); // 此刻读取最新编辑态（防抖合并后取最后一次全量）
      await persist(body);
      dirty = false;
      savedAt.value = new Date().toLocaleTimeString();
      autoSaved.value = isAuto;
      onSaved();
    } catch (e) {
      onError(`${isAuto ? '自动保存失败' : '保存失败'}：${e.message}`);
      autoSaved.value = false;
      savedAt.value = ''; // 清掉"已保存"标记，避免误导
      dirty = true; // 保留脏标记：flushOnLeave 补存 / 下次编辑重试语义依赖它
      throw e;
    } finally {
      saving.value = false;
    }
  }

  // 取消待触发的保存并清脏（任务切换重置用：放弃旧任务的 pending 编辑）
  function cancelPending() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    dirty = false;
  }

  // 离开页面前补存未保存编辑（尽力而为，失败不阻塞返回）
  function flushOnLeave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (dirty) void save(true).catch(() => {});
  }

  if (getCurrentInstance()) onBeforeUnmount(() => { flushOnLeave(); });

  return { saving, savedAt, autoSaved, markDirty, save, cancelPending, flushOnLeave, hasPending: () => dirty };
}
