// 视觉模板渲染（V1.0 Phase 1）：三风格 × 两模板 + CSS 白名单 + 固定尺寸断言
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_SIZE, SECTION_CARD_SIZE,
  renderCoverPoster, renderSectionCard,
} from '../src/utils/visual-templates.js';

const coverData = {
  org: '深圳信息职业技术大学', title: '山海电白青春突击队', subtitle: '文旅调研实践纪实',
  tags: ['社会实践', '文旅调研'], place: '深圳龙岗 · 茂名电白', date: '2026年8月',
  imageUrl: 'https://example.com/photo.jpg',
};
const cardData = { partNum: 1, title: '旧址参观学党史', subtitle: '追溯红色足迹', imageUrl: 'https://example.com/p.jpg' };

// CSS 禁用清单扫描：html2canvas 兼容性红线（规格 §3.10/3.11）
const BANNED = [/filter\s*:/, /backdrop-filter\s*:/, /linear-gradient\s*\(/, /radial-gradient\s*\(/, /animation\s*:/, /box-shadow\s*:/, /position\s*:\s*absolute/, /transform\s*:/];

test('固定尺寸契约：Cover 900×383 / Section Card 900×1200', () => {
  assert.deepEqual(COVER_SIZE, { width: 900, height: 383 });
  assert.deepEqual(SECTION_CARD_SIZE, { width: 900, height: 1200 });
});

test('Cover 三风格渲染：尺寸/中文/crossorigin/图片 URL 断言', () => {
  for (const preset of ['journal', 'bold', 'soft']) {
    const html = renderCoverPoster(coverData, 'greenPink', { stylePreset: preset });
    assert.ok(html.includes(`width: ${COVER_SIZE.width}px`), `${preset} 固定宽`);
    assert.ok(html.includes(`height: ${COVER_SIZE.height}px`), `${preset} 固定高`);
    assert.ok(html.includes('深圳信息职业技术大学'), `${preset} 中文机构名`);
    assert.ok(html.includes('山海电白青春突击队'), `${preset} 中文主标题`);
    assert.ok(html.includes('crossorigin="anonymous"'), `${preset} CORS 属性`);
    assert.ok(html.includes('https://example.com/photo.jpg'), `${preset} 图片 URL`);
  }
});

test('Section Card 三风格渲染：Part 序号/标题/尺寸断言', () => {
  for (const preset of ['journal', 'bold', 'soft']) {
    const html = renderSectionCard(cardData, 'greenPink', { stylePreset: preset });
    assert.ok(html.includes(`width: ${SECTION_CARD_SIZE.width}px`), `${preset} 固定宽`);
    assert.ok(html.includes(`height: ${SECTION_CARD_SIZE.height}px`), `${preset} 固定高`);
    assert.ok(html.includes('01'), `${preset} Part 序号补零`);
    assert.ok(html.includes('旧址参观学党史'), `${preset} 中文标题`);
  }
});

test('CSS 白名单：三风格 × 两模板不含禁用属性', () => {
  const outputs = [
    ...['journal', 'bold', 'soft'].map((p) => renderCoverPoster(coverData, 'greenPink', { stylePreset: p })),
    ...['journal', 'bold', 'soft'].map((p) => renderSectionCard(cardData, 'greenPink', { stylePreset: p })),
  ];
  for (const html of outputs) {
    for (const re of BANNED) assert.ok(!re.test(html), `发现禁用 CSS：${re}`);
  }
});

test('三风格输出互不相同（journal/bold/soft 结构确实有差异）', () => {
  const j = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'journal' });
  const b = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'bold' });
  const s = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'soft' });
  assert.notEqual(j, b); assert.notEqual(b, s); assert.notEqual(j, s);
});

test('空字段容错：缺 org/tags/imageUrl 不抛异常', () => {
  const html = renderCoverPoster({ title: '仅标题' }, 'greenPink', { stylePreset: 'journal' });
  assert.ok(html.includes('仅标题'));
  assert.ok(!html.includes('undefined'), '空字段不得泄漏 undefined');
  assert.ok(!html.includes('[object Object]'));
});

test('超长标题：截断或缩号，不溢出模板（含截断标记）', () => {
  const long = '超'.repeat(60);
  const html = renderCoverPoster({ ...coverData, title: long }, 'greenPink', { stylePreset: 'journal' });
  // 截断策略：超出长度上限时输出省略号结尾（具体上限在实现中定，测试只断言不溢出且带省略标记）
  assert.ok(html.includes('…') || html.includes('...'), '超长标题须有省略标记');
});

test('非法风格回退 journal（渲染入口容错）', () => {
  const ok = renderCoverPoster(coverData, 'greenPink', {});
  const bad = renderCoverPoster(coverData, 'greenPink', { stylePreset: '不存在的' });
  assert.equal(ok, bad, '非法 stylePreset 渲染结果 = journal 默认');
});

test('主题色注入：greenPink 的 accentA 出现在输出中', () => {
  const html = renderCoverPoster(coverData, 'greenPink', { stylePreset: 'journal' });
  assert.ok(html.includes('#FD98C9'), 'greenPink accentA #FD98C9');
});
