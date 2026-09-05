// 审核工作台纯函数测试（V1.0 Phase 7，§22）：share_token 认证下的审核操作合法性
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateShareAction, buildRejectPatch } from '../lib/review.mjs';

test('validateShareAction：reviewing 态 allow approve/reject/comment', () => {
  const t = { status: 'reviewing' };
  assert.equal(validateShareAction(t, 'approve'), null);
  assert.equal(validateShareAction(t, 'reject'), null);
  assert.equal(validateShareAction(t, 'comment'), null);
});

test('validateShareAction：非 reviewing 态拒绝 approve/reject（writing 不能在分享页通过；published 不可逆）', () => {
  for (const action of ['approve', 'reject']) {
    assert.ok(validateShareAction({ status: 'writing' }, action), 'writing 态应拒绝');
    assert.ok(validateShareAction({ status: 'published' }, action), 'published 态应拒绝');
  }
});

test('validateShareAction：comment 任意状态允许（写作者留言/审核人批注）；未知动作拒绝', () => {
  assert.equal(validateShareAction({ status: 'writing' }, 'comment'), null);
  assert.equal(validateShareAction({ status: 'published' }, 'comment'), null);
  assert.ok(validateShareAction({ status: 'reviewing' }, 'hack'));
  assert.ok(validateShareAction({ status: 'reviewing' }, ''));
});

test('buildRejectPatch：多行意见 → 整改清单条目（P0-2 格式 {id,text,done,at}），状态重置 writing', () => {
  const patch = buildRejectPatch('第二段数据请核实\n\n标题太长');
  assert.equal(patch.status, 'writing');
  assert.equal(patch.review_checklist.length, 2);
  assert.deepEqual(patch.review_checklist.map((i) => i.text), ['第二段数据请核实', '标题太长']);
  assert.ok(patch.review_checklist.every((i) => i.done === false && i.id && i.at));
});

test('buildRejectPatch：空意见 → 空清单打回（沿用现状语义）', () => {
  const patch = buildRejectPatch('  \n  ');
  assert.equal(patch.status, 'writing');
  assert.deepEqual(patch.review_checklist, []);
});
