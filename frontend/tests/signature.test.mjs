// 文末署名纯函数测试：确保签名追加逻辑单一实现、无重复漂移
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSignatureText } from '../src/utils/signature.js';

test('已有「责编 | 姓名」不重复追加', () => {
  assert.equal(ensureSignatureText('正文\n\n责编 | 张三', '张三'), '正文\n\n责编 | 张三');
});

test('有「责编｜全角竖线」也不追加', () => {
  assert.equal(ensureSignatureText('正文\n责编｜李四', '李四'), '正文\n责编｜李四');
});

test('缺署名时文末追加（空行分隔）', () => {
  assert.equal(ensureSignatureText('正文内容', '王五'), '正文内容\n\n责编 | 王五');
});

test('空正文不动（原语义）', () => {
  assert.equal(ensureSignatureText('', '王五'), '');
});

test('已有其他编辑署名不算责编（只认责编行）', () => {
  assert.ok(ensureSignatureText('正文\n编辑 | 张三', '张三').includes('责编 | 张三'));
});
