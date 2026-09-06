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
