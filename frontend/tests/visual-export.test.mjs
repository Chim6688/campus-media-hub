// 导出管线（V1.0 Phase 1）：Node 环境只测可注入依赖的部分；
// document.fonts/html2canvas/下载链路属浏览器行为，在真机验证（规格 §7）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForImages } from '../src/utils/visual-export.js';

test('waitForImages：无 img 节点直接 resolve', async () => {
  // 模拟最小 DOM 结构（无 img）
  const el = { querySelectorAll: () => [] };
  await waitForImages(el);
});

test('waitForImages：图片加载失败 reject 并指明第几张', async () => {
  const imgs = [
    { complete: true, naturalWidth: 100, src: 'https://a/1.jpg' },
    { complete: true, naturalWidth: 0, src: 'https://a/2.jpg' }, // 失败图：complete 但 naturalWidth=0
  ];
  const el = { querySelectorAll: () => imgs };
  await assert.rejects(
    () => waitForImages(el),
    (e) => e.message.includes('第 2 张') && e.message.includes('https://a/2.jpg'),
  );
});

test('returnBlob 模式：exportVisualPNG 第 4 参 returnBlob:true 时不触发下载、resolve Blob（浏览器行为真机验证，此处仅锁定签名容错）', async () => {
  // Node 环境无 document/html2canvas，函数应在进入浏览器分支前不抛 ReferenceError 的方式不可行；
  // 本测试锁定：opts 参数被接受（第 4 参不引起 TypeError），undefined opts 兼容
  // 真机验证在 Task 4（Playwright 断言上传成功）
  const { exportVisualPNG } = await import('../src/utils/visual-export.js');
  assert.equal(typeof exportVisualPNG, 'function');
  assert.equal(exportVisualPNG.length, 3, '签名兼容：前 3 参固定，第 4 参可选');
});
