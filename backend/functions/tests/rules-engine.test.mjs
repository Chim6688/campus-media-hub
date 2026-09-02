// 规则引擎单测：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert';
// 内置规则是纯函数逻辑，测试时用假 db（不查库，返回空规则）
import { runChecks } from '../lib/rules-engine.mjs';

const fakeDb = { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) };

test('缺标题/摘要/责编署名 → 3 个 error，不通过', async () => {
  const r = await runChecks(fakeDb, { title: '', summary: '', content: '' });
  assert.equal(r.passed, false);
  assert.equal(r.errors.length, 3);
});

test('合规任务 → 通过且无 error', async () => {
  const content = '正文内容'.repeat(80) + '\n[配图：晚会现场]\n责编 | 张三';
  const r = await runChecks(fakeDb, { title: '这是一个合适的标题长度', summary: '摘要', content });
  assert.equal(r.passed, true);
  assert.equal(r.errors.length, 0);
});

test('标题过短 → warning 但不阻断', async () => {
  const content = '正文内容'.repeat(80) + '\n[配图：现场]\n责编 | 张三';
  const r = await runChecks(fakeDb, { title: '短标', summary: '摘要', content });
  assert.equal(r.passed, true);
  assert.ok(r.warnings.some((w) => w.rule === '标题长度'));
});
