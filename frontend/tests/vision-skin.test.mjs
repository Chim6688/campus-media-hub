// 识图输出清洗与压缩参数（V1.0 Phase 5）：AI 输出不可信，双白名单是唯一防线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisionSkin, compressSpec } from '../src/utils/vision-skin.js';

const GOOD = '{"colors":{"pageBg":"#F7F5F0","accentA":"#FD98C9","accentB":"#53DE7B","ink":"#3E3E3E","cardBg":"#ffffff","cream":"#F3EFE6","creamBorder":"#E2DACA","creamText":"#8C8770"},"stylePreset":"soft"}';

test('parseVisionSkin：合法输出 → 8 色 + 风格通过', () => {
  const r = parseVisionSkin(GOOD);
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.colors).length, 8);
  assert.equal(r.colors.accentA, '#FD98C9');
  assert.equal(r.stylePreset, 'soft');
});

test('parseVisionSkin：markdown 代码块包裹容错（```json ... ```）', () => {
  const r = parseVisionSkin('```json\n' + GOOD + '\n```');
  assert.equal(r.ok, true);
});

test('parseVisionSkin：颜色不足 8 个 → ok=false 明确报错', () => {
  const r = parseVisionSkin('{"colors":{"pageBg":"#fff"},"stylePreset":"soft"}');
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('不完整'));
});

test('parseVisionSkin：非法 stylePreset → 回退 journal（不报错）', () => {
  const r = parseVisionSkin(GOOD.replace('"soft"', '"guochao"'));
  assert.equal(r.ok, true);
  assert.equal(r.stylePreset, 'journal');
});

test('parseVisionSkin：非法 JSON / 空输入 / 非对象 → ok=false 不抛异常', () => {
  for (const bad of ['不是JSON', '', 'null', '[1,2]']) {
    const r = parseVisionSkin(bad);
    assert.equal(r.ok, false);
    assert.ok(r.error, `输入 ${JSON.stringify(bad)} 应有错误提示`);
  }
});

test('parseVisionSkin：colors 为 null 容错（不抛 TypeError）', () => {
  const r = parseVisionSkin('{"colors":null,"stylePreset":"bold"}');
  assert.equal(r.ok, false);
});

test('compressSpec：大图最长边压到 1024（宽图）', () => {
  const s = compressSpec(4000, 2000);
  assert.equal(s.targetW, 1024);
  assert.equal(s.targetH, 512);
  assert.equal(s.quality, 0.85);
});

test('compressSpec：竖图按高边压；小图不放大', () => {
  assert.deepEqual(compressSpec(800, 1600), { targetW: 512, targetH: 1024, quality: 0.85 });
  assert.deepEqual(compressSpec(500, 300), { targetW: 500, targetH: 300, quality: 0.85 });
});

test('compressSpec：零/负尺寸容错（返回 1px 下限防 Canvas 报错）', () => {
  const s = compressSpec(0, 0);
  assert.ok(s.targetW >= 1 && s.targetH >= 1);
});
