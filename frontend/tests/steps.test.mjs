// 流程步骤条纯函数测试：数据完备度驱动 + 状态当前步（P1-3）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSteps } from '../src/utils/steps.js';

test('空任务：只有选题完成，素材为当前步', () => {
  const s = computeSteps({ theme: 'x', status: 'writing', material: {}, content: '', title: '' });
  assert.equal(s[0].done, true);  // 选题：有主题即完成
  assert.equal(s[1].active, true); // 素材：当前步
  assert.equal(s[4].done, false);
});

test('素材齐+成稿达标：排版为当前步（writing）', () => {
  const s = computeSteps({
    theme: 'x', status: 'writing',
    material: { name: '晚会', highlights: ['a'] },
    content: 'x'.repeat(300), title: '足够长的标题八个字以上',
  });
  assert.equal(s[1].done, true);
  assert.equal(s[2].done, true);
  assert.equal(s[3].active, true);
});

test('reviewing：审核为当前步；published：全部完成', () => {
  const r = computeSteps({ theme: 'x', status: 'reviewing', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.equal(r[4].active, true);
  const p = computeSteps({ theme: 'x', status: 'published', material: { name: 'y' }, content: 'c'.repeat(300), title: '足够长的标题八个字以上' });
  assert.ok(p.every((i) => i.done));
});
