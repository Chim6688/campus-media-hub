// useAutoSave 自动保存通道测试（总方案 §8）：防抖合并/串行队列/dirty 闭环/flushOnLeave
// composable 纯编排、可注入 persist → node --test 直接测真实时序（debounceMs 参数化缩短）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useAutoSave } from '../src/composables/useAutoSave.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 测试桩宿主：记录 persist 调用与时间
function setup(overrides = {}) {
  const calls = [];
  let version = 0;
  const state = { body: { v: version } };
  const hook = useAutoSave({
    getBody: () => state.body,
    persist: async (body) => { calls.push({ body, t: Date.now() }); },
    onError: overrides.onError || (() => {}),
    onSaved: overrides.onSaved || (() => {}),
    isSwitching: overrides.isSwitching || (() => false),
    debounceMs: overrides.debounceMs ?? 30,
  });
  const bump = () => { state.body = { v: ++version }; }; // 模拟一次编辑
  return { hook, calls, bump, state };
}

test('防抖合并：连续编辑只触发一次持久化，内容为最后一次编辑态', async () => {
  const { hook, calls, bump } = setup();
  hook.markDirty(); bump();
  hook.markDirty(); bump();
  hook.markDirty(); bump(); // 三次编辑一次保存
  await wait(80);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.v, 3, '保存的是最后一次编辑内容');
});

test('保存成功后 dirty 清零：flushOnLeave 不再补存', async () => {
  const { hook, calls, bump } = setup();
  hook.markDirty(); bump();
  await wait(80); // 防抖触发并完成
  assert.equal(calls.length, 1);
  hook.flushOnLeave();
  await wait(30);
  assert.equal(calls.length, 1, '成功保存后无未保存编辑，flush 不补存');
});

test('flushOnLeave：防抖窗口内的编辑离开前补存（不丢稿）', async () => {
  const { hook, calls, bump } = setup();
  hook.markDirty(); bump();
  hook.flushOnLeave(); // 模拟 2s 内离开
  await wait(50);
  assert.equal(calls.length, 1, '离开时立即补存一次');
  assert.equal(calls[0].body.v, 1);
});

test('保存失败：onError 收到提示、dirty 保留（flush 会重试）、save() 向调用方抛错', async () => {
  let fail = true;
  const errors = [];
  const hook = useAutoSave({
    getBody: () => ({ v: 1 }),
    persist: async () => { if (fail) throw new Error('网络断了'); },
    onError: (m) => errors.push(m),
    debounceMs: 30,
  });
  hook.markDirty();
  await assert.rejects(() => hook.save(false), /网络断了/, '调用方（changeStatus 等）仍能 catch');
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('保存失败'));
  fail = false; // 网络恢复
  hook.flushOnLeave();
  await wait(50);
  assert.ok(errors.length >= 1, '失败提示只报一次，重试成功');
});

test('串行队列：并发多次 save 顺序执行（一次一个 persist in flight）', async () => {
  const inflight = [];
  let maxConcurrent = 0;
  let cur = 0;
  const hook = useAutoSave({
    getBody: () => ({ t: Date.now() }),
    persist: async () => {
      cur += 1;
      inflight.push(cur);
      maxConcurrent = Math.max(maxConcurrent, cur);
      await wait(20);
      cur -= 1;
    },
    debounceMs: 30,
  });
  await Promise.all([hook.save(), hook.save(), hook.save()]);
  assert.equal(maxConcurrent, 1, '任何时刻至多一个 PATCH in flight');
});

test('isSwitching 保护：任务切换回填不触发保存', async () => {
  let switching = false;
  const { hook, calls } = setup({ isSwitching: () => switching });
  switching = true;
  hook.markDirty(); // 回填路径
  await wait(80);
  assert.equal(calls.length, 0);
  switching = false;
  hook.markDirty(); // 正常编辑
  await wait(80);
  assert.equal(calls.length, 1);
});

test('cancelPending：任务切换重置时放弃旧任务 pending 编辑', async () => {
  const { hook, calls, bump } = setup();
  hook.markDirty(); bump();
  hook.cancelPending(); // 放弃
  await wait(80);
  assert.equal(calls.length, 0);
  hook.flushOnLeave();
  assert.equal(calls.length, 0, '脏标记已清，flush 不补存旧任务内容');
});
