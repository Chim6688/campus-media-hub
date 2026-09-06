// 七步工作流纯函数测试：素材→写稿→配图→视觉→排版→检查→审核（V1.0 Phase 2 六改七）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSteps } from '../src/utils/steps.js';

test('步骤 key 顺序固定：material→draft→images→visual→layout→check→review', () => {
  const s = computeSteps({ status: 'writing', material: {}, content: '', title: '' });
  assert.deepEqual(s.map((x) => x.key), ['material', 'draft', 'images', 'visual', 'layout', 'check', 'review']);
});

test('空任务：素材为当前步，全部未完成', () => {
  const s = computeSteps({ theme: 'x', status: 'writing', material: {}, content: '', title: '' });
  assert.equal(s[0].active, true);
  assert.ok(s.every((x) => !x.done));
});

test('素材齐+成稿达标+配图说明：视觉为当前步（writing）', () => {
  const s = computeSteps({
    theme: 'x', status: 'writing',
    material: { name: '晚会', highlights: ['a'], photoNotes: '开场全景' },
    content: 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[0].done, true); // 素材
  assert.equal(s[1].done, true); // 写稿
  assert.equal(s[2].done, true); // 配图：photoNotes 非空即完成
  assert.equal(s[3].key, 'visual');
  assert.equal(s[3].active, true); // 视觉为当前步
  assert.equal(s[3].done, false); // writing 态视觉未完成
});

test('视觉完成判定（Phase 7 升级）：visualOk=true 或 reviewing/published 即完成', () => {
  // 第三参 visualOk=true → writing 态视觉也完成
  const a = computeSteps({ status: 'writing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' }, 1, true);
  assert.equal(a[3].done, true);
  // visualOk=false 但 reviewing → 完成（送审即认可，兼容审核中回看）
  const b = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' }, 0, false);
  assert.equal(b[3].done, true);
  // 缺省第三参 = false（向后兼容）
  const c = computeSteps({ status: 'writing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' }, 1);
  assert.equal(c[3].done, false);
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
  assert.equal(s[3].active, true); // 视觉为当前步
});

test('视觉完成判定：reviewing/published 视为完成（送审必过视觉）', () => {
  const r = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[3].done, true);
});

test('reviewing：审核为当前步，前六步视为完成（送审必过排版与检查）', () => {
  const r = computeSteps({ status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[6].active, true);
  assert.ok(r.slice(0, 6).every((i) => i.done));
});

test('published：全部完成且无当前步', () => {
  const p = computeSteps({ status: 'published', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.ok(p.every((i) => i.done));
  assert.ok(p.every((i) => !i.active));
});
