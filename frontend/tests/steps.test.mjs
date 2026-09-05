// 六步工作流纯函数测试：素材→写稿→配图→排版→检查→审核（V1.0 Phase 1）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSteps } from '../src/utils/steps.js';

test('步骤 key 顺序固定：material→draft→images→layout→check→review', () => {
  const s = computeSteps({ status: 'writing', material: {}, content: '', title: '' });
  assert.deepEqual(s.map((x) => x.key), ['material', 'draft', 'images', 'layout', 'check', 'review']);
});

test('空任务：素材为当前步，全部未完成', () => {
  const s = computeSteps({ theme: 'x', status: 'writing', material: {}, content: '', title: '' });
  assert.equal(s[0].active, true);
  assert.ok(s.every((x) => !x.done));
});

test('素材齐+成稿达标+配图说明：排版为当前步（writing）', () => {
  const s = computeSteps({
    theme: 'x', status: 'writing',
    material: { name: '晚会', highlights: ['a'], photoNotes: '开场全景' },
    content: 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[0].done, true); // 素材
  assert.equal(s[1].done, true); // 写稿
  assert.equal(s[2].done, true); // 配图：photoNotes 非空即完成
  assert.equal(s[3].active, true); // 排版为当前步
});

test('配图完成判定：正文含 [配图：] 占位也算完成', () => {
  const s = computeSteps({
    status: 'writing',
    material: { name: '晚会' },
    content: '[配图：开幕式全景]' + 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[2].done, true);
});

test('配图完成判定：已绑定正文图片（contentImagesBound>0）即完成（Phase 3）', () => {
  const s = computeSteps(
    {
      status: 'writing',
      material: { name: '晚会' },
      content: 'x'.repeat(300), title: '足够长的标题八个字以上',
    },
    1, // 已绑定 1 张正文配图
  );
  assert.equal(s[2].done, true);
  assert.equal(s[3].active, true); // 排版为当前步
});

test('reviewing：审核为当前步，前五步视为完成（送审必过排版与检查）', () => {
  const r = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[5].active, true);
  assert.ok(r.slice(0, 5).every((i) => i.done));
});

test('published：全部完成且无当前步', () => {
  const p = computeSteps({ status: 'published', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.ok(p.every((i) => i.done));
  assert.ok(p.every((i) => !i.active));
});
