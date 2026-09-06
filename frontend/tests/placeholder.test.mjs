// 占位对齐纯函数（V2 Phase 3）：章节卡绑定槽位 → 正文占位自动补齐
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPlaceholders, ensurePlaceholder } from '../src/utils/placeholder.js';

test('countPlaceholders：整段占位计数（独行才计，行内不计）', () => {
  assert.equal(countPlaceholders('第一段\n\n[配图：开场]\n\n第二段'), 1);
  assert.equal(countPlaceholders('[配图：a]\n\n[配图：b]'), 2);
  assert.equal(countPlaceholders('文中提到 [配图：行内] 不算'), 0);
  assert.equal(countPlaceholders(''), 0);
  assert.equal(countPlaceholders(null), 0);
});

test('ensurePlaceholder：槽位 ≤ 现有占位数 → 原样返回', () => {
  const c = '[配图：a]\n\n[配图：b]';
  assert.equal(ensurePlaceholder(c, 1, '章节卡'), c);
  assert.equal(ensurePlaceholder(c, 2, '章节卡'), c);
});

test('ensurePlaceholder：槽位超出 → 文末追加占位（差几个补几个）', () => {
  const c = '[配图：a]';
  const out = ensurePlaceholder(c, 2, '章节卡');
  assert.equal(countPlaceholders(out), 2);
  assert.ok(out.includes('[配图：章节卡]'));
  assert.ok(out.startsWith('[配图：a]'));
});

test('ensurePlaceholder：空正文也能补（直接返回占位）', () => {
  const out = ensurePlaceholder('', 1, '视觉章节卡');
  assert.equal(countPlaceholders(out), 1);
  assert.ok(out.includes('[配图：视觉章节卡]'));
});

test('ensurePlaceholder：幂等（连续调两次不重复追加）', () => {
  const c = '[配图：a]';
  const once = ensurePlaceholder(c, 2, '章节卡');
  const twice = ensurePlaceholder(once, 2, '章节卡');
  assert.equal(once, twice);
});

test('ensurePlaceholder：label 缺省与非法 slot 容错', () => {
  const out = ensurePlaceholder('[配图：a]', 3);
  assert.equal(countPlaceholders(out), 3);
  assert.ok(out.includes('[配图：配图]'));
  assert.equal(ensurePlaceholder('[配图：a]', 0, 'x'), '[配图：a]');
});
