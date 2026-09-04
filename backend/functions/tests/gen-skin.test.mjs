// gen_skin prompt 契约测试：action 存在、双消息结构、8 色键字段与 SKIN_FIELDS 语义对齐
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS } from '../lib/prompts.mjs';

test('gen_skin：存在且返回 system+user 双消息', () => {
  assert.ok(PROMPTS.gen_skin, 'gen_skin action 未定义');
  const msgs = PROMPTS.gen_skin({ text: '蓝金科技感' });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.ok(msgs[1].content.includes('蓝金科技感'), '用户描述要进 prompt');
});

test('gen_skin：prompt 含全部 8 个色键名与严格 JSON 输出要求', () => {
  const c = PROMPTS.gen_skin({ text: 'x' })[1].content;
  for (const k of ['pageBg', 'accentA', 'accentB', 'ink', 'cardBg', 'cream', 'creamBorder', 'creamText']) {
    assert.ok(c.includes(k), `prompt 缺字段说明 ${k}`);
  }
  assert.ok(c.includes('JSON'), '要求 JSON 输出');
  assert.ok(c.includes('hex'), '要求 hex 格式');
});
