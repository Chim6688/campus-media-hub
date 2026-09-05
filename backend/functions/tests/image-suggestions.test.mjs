// image_suggestions prompt 契约测试（V1.0 Phase 5，§14）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS } from '../lib/prompts.mjs';

test('image_suggestions：存在且返回 system+user 双消息', () => {
  assert.ok(PROMPTS.image_suggestions, 'image_suggestions action 未定义');
  const msgs = PROMPTS.image_suggestions({ title: 't', summary: 's', content: '正文', material: {} });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
});

test('image_suggestions：正文与素材要进 prompt', () => {
  const c = PROMPTS.image_suggestions({
    title: '篮球赛报道', summary: '摘要', content: '比赛正文内容', material: { highlights: ['绝杀瞬间'] },
  })[1].content;
  assert.ok(c.includes('比赛正文内容'), '正文要进 prompt');
  assert.ok(c.includes('绝杀瞬间'), '素材亮点要进 prompt');
});

test('image_suggestions：prompt 含 JSON 输出契约 position/description/reason', () => {
  const c = PROMPTS.image_suggestions({ title: 't', summary: 's', content: 'c', material: {} })[1].content;
  for (const k of ['position', 'description', 'reason']) {
    assert.ok(c.includes(k), `prompt 缺字段说明 ${k}`);
  }
  assert.ok(c.includes('JSON'), '要求 JSON 输出');
});
