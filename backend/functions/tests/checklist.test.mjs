import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingCount, normalizeLines } from '../lib/checklist.mjs';

test('remainingCount：未完成计数、空/旧任务兼容', () => {
  assert.equal(remainingCount(null), 0);
  assert.equal(remainingCount([]), 0);
  assert.equal(remainingCount([{ done: true }, { done: false }, { done: false }]), 2);
  // 旧结构容错：无 done 字段视为未完成
  assert.equal(remainingCount([{ text: 'x' }]), 1);
});

test('normalizeLines：多行文本 → 去空行去编号的条目数组', () => {
  assert.deepEqual(normalizeLines('第一点\n\n2. 第二点\n、第三点'), ['第一点', '第二点', '第三点']);
  assert.deepEqual(normalizeLines('   \n\n'), []);
});
