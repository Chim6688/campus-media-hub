// 模板画廊纯函数测试：每套皮肤都能渲染示例文章，且色值生效
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../src/utils/themes.js';
import { buildGallery, GALLERY_SAMPLE } from '../src/utils/gallery.js';

test('画廊卡片数 = 皮肤数，id/label 与 THEMES 一致', () => {
  const cards = buildGallery();
  assert.equal(cards.length, Object.keys(THEMES).length);
  for (const c of cards) {
    assert.ok(THEMES[c.id], `未知皮肤 id：${c.id}`);
    assert.equal(c.label, THEMES[c.id].label);
  }
});

test('每张卡片渲染了示例文章且该皮肤强调色生效', () => {
  const cards = buildGallery();
  for (const c of cards) {
    assert.ok(c.html.length > 500, `${c.id} 渲染内容过短`);
    assert.ok(c.html.includes(THEMES[c.id].accentA), `${c.id} 强调色A未出现`);
    assert.ok(c.html.includes('示例文章标题'), `${c.id} 标题卡未渲染`);
  }
});

test('示例文章覆盖全部组件类型（标题/引言/核心信息/正文/配图/金句/落款）', () => {
  assert.ok(GALLERY_SAMPLE.includes('# '));          // H1 标题卡
  assert.ok(GALLERY_SAMPLE.includes('> '));          // 引言卡
  assert.ok(GALLERY_SAMPLE.includes('## 核心信息')); // 信息胶囊+信息卡
  assert.ok(GALLERY_SAMPLE.includes('[配图：'));     // 配图占位
  assert.ok(GALLERY_SAMPLE.includes('### '));        // 子标题
  assert.ok(GALLERY_SAMPLE.includes('责编 |'));      // 落款卡
});
