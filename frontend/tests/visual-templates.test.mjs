// 视觉模板渲染测试（V2 Phase 1）：构图×风格双维解耦 + 零回归锚点 + 全矩阵安全
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_SIZE, SECTION_CARD_SIZE,
  renderCoverPoster, renderSectionCard,
  getStyleParams, COVER_LAYOUTS, SECTION_LAYOUTS,
} from '../src/utils/visual-templates.js';
import { COVER_COMPOSITIONS, SECTION_COMPOSITIONS } from '../src/utils/compositions.js';

const coverData = {
  org: '深圳信息职业技术大学', title: '山海电白青春突击队', subtitle: '文旅调研实践纪实',
  tags: ['社会实践', '文旅调研'], place: '深圳龙岗 · 茂名电白', date: '2026年8月',
  imageUrl: 'https://example.com/photo.jpg',
};
const cardData = { partNum: 1, title: '旧址参观学党史', subtitle: '追溯红色足迹', imageUrl: 'https://example.com/p.jpg' };

// CSS 禁用清单扫描（沿用 V1 红线）
const BANNED = [/filter\s*:/, /backdrop-filter\s*:/, /linear-gradient\s*\(/, /radial-gradient\s*\(/, /animation\s*:/, /box-shadow\s*:/, /position\s*:\s*absolute/, /transform\s*:/];

const PRESETS = ['journal', 'bold', 'soft'];

test('固定尺寸契约不变：Cover 900×383 / Section 900×1200', () => {
  assert.deepEqual(COVER_SIZE, { width: 900, height: 383 });
  assert.deepEqual(SECTION_CARD_SIZE, { width: 900, height: 1200 });
});

// ===== 零回归锚点（V2 重构红线）=====
test('零回归锚点：缺省参数输出 = V1 journal 白卡横幅特征（逐特征对拍）', () => {
  const html = renderCoverPoster(coverData, 'greenPink', {});
  assert.ok(html.includes('width: 900px') && html.includes('height: 383px'), '外壳尺寸');
  assert.ok(html.includes('background:#F7F5F0'), 'pageBg 页底');
  assert.ok(html.includes('border:1px solid #3E3E3E'), '白卡 ink 细描边');
  assert.ok(html.includes('border-radius:10px'), 'radius=10 圆角');
  assert.ok(html.includes('font-size:32px'), '主标题 32px');
  assert.ok(html.includes('height:158px'), '图片区 158px');
  assert.ok(html.includes('crossorigin="anonymous"'), 'CORS 属性');
  assert.ok(html.includes('深圳信息职业技术大学') && html.includes('山海电白青春突击队'), '中文文字');
});

// ===== 双维解耦断言（V2 核心）=====
test('同构图换风格 → 视觉语言变（cover-hero 下 journal/bold/soft 互不相同）', () => {
  const j = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'journal' });
  const b = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'bold' });
  const s = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'soft' });
  assert.notEqual(j, b);
  assert.notEqual(b, s);
  assert.notEqual(j, s);
  assert.ok(b.includes('border-radius:0px'), 'bold radiusScale=0');
  assert.ok(b.includes('color:#ffffff'), 'bold 反白');
  assert.ok(s.includes('border-radius:20px'), 'soft radiusScale=2');
});

test('同风格换构图 → 布局变（journal 下 5 种 Cover 互不相同）', () => {
  const outs = COVER_COMPOSITIONS.map((c) => renderCoverPoster(coverData, 'greenPink', { composition: c, stylePreset: 'journal' }));
  for (let i = 0; i < outs.length; i++) {
    for (let k = i + 1; k < outs.length; k++) {
      assert.notEqual(outs[i], outs[k], `${COVER_COMPOSITIONS[i]} 与 ${COVER_COMPOSITIONS[k]} 输出相同`);
    }
  }
});

test('同风格换构图 → 布局变（journal 下 5 种 Section 互不相同）', () => {
  const outs = SECTION_COMPOSITIONS.map((c) => renderSectionCard(cardData, 'greenPink', { composition: c, stylePreset: 'journal' }));
  for (let i = 0; i < outs.length; i++) {
    for (let k = i + 1; k < outs.length; k++) {
      assert.notEqual(outs[i], outs[k], `${SECTION_COMPOSITIONS[i]} 与 ${SECTION_COMPOSITIONS[k]} 输出相同`);
    }
  }
});

test('构图差异硬指标：布局骨架确实不同（图片区/文字区结构差异抽检）', () => {
  const circle = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-circle', stylePreset: 'journal' });
  assert.ok(circle.includes('border-radius:50%') && circle.includes('overflow:hidden'), '圆形照片容器');
  const photo = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-photo', stylePreset: 'journal' });
  assert.ok(/height:[2-9]\d\dpx/.test(photo), '满版大图高图区');
  const minimal = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-minimal', stylePreset: 'journal' });
  assert.ok(!minimal.includes('<img'), '极简构图无图');
  const split = renderSectionCard(cardData, 'greenPink', { composition: 'section-split', stylePreset: 'journal' });
  assert.ok(split.includes('flex-direction:row'), '分栏 row 方向');
  const stack = renderSectionCard({ ...cardData, imageUrl: 'https://example.com/p.jpg', image2Url: 'https://example.com/p2.jpg' }, 'greenPink', { composition: 'section-photo-stack', stylePreset: 'journal' });
  assert.ok((stack.match(/<img/g) || []).length >= 2, '叠放至少两图');
});

// ===== 全矩阵安全 =====
test('全矩阵：10 构图 × 3 风格 = 30 组合渲染安全 + 尺寸 + CSS 白名单', () => {
  let count = 0;
  for (const c of COVER_COMPOSITIONS) {
    for (const p of PRESETS) {
      const html = renderCoverPoster(coverData, 'greenPink', { composition: c, stylePreset: p });
      assert.ok(html.includes('width: 900px') && html.includes('height: 383px'), `${c}×${p} 尺寸`);
      for (const re of BANNED) assert.ok(!re.test(html), `${c}×${p} 禁用 CSS：${re}`);
      count++;
    }
  }
  for (const c of SECTION_COMPOSITIONS) {
    for (const p of PRESETS) {
      const html = renderSectionCard(cardData, 'greenPink', { composition: c, stylePreset: p });
      assert.ok(html.includes('width: 900px') && html.includes('height: 1200px'), `${c}×${p} 尺寸`);
      for (const re of BANNED) assert.ok(!re.test(html), `${c}×${p} 禁用 CSS：${re}`);
      count++;
    }
  }
  assert.equal(count, 30);
});

// ===== 容错（沿用 V1 契约）=====
test('空字段容错：缺 org/tags/imageUrl 不抛异常不泄漏 undefined', () => {
  const html = renderCoverPoster({ title: '仅标题' }, 'greenPink', { composition: 'cover-circle', stylePreset: 'journal' });
  assert.ok(html.includes('仅标题'));
  assert.ok(!html.includes('undefined') && !html.includes('[object Object]'));
});

test('超长标题截断（省略标记）', () => {
  const html = renderCoverPoster({ ...coverData, title: '超'.repeat(60) }, 'greenPink', { composition: 'cover-editorial', stylePreset: 'journal' });
  assert.ok(html.includes('…'));
});

test('非法构图/风格回退默认（渲染入口容错）', () => {
  const ok = renderCoverPoster(coverData, 'greenPink', {});
  const bad = renderCoverPoster(coverData, 'greenPink', { composition: '不存在', stylePreset: '不存在' });
  assert.equal(ok, bad, '非法值回退 cover-hero + journal = 缺省输出');
});

test('getStyleParams：参数包契约与非法回退', () => {
  const j = getStyleParams('journal');
  assert.equal(j.radiusScale, 1);
  assert.equal(j.decorations, true);
  const b = getStyleParams('bold');
  assert.equal(b.radiusScale, 0);
  assert.equal(b.fontWeight, 'bold');
  const bad = getStyleParams('不存在');
  assert.deepEqual(bad, j, '非法风格回退 journal 参数包');
});

test('布局注册表：10 构图各有布局函数（typeof function）', () => {
  for (const k of COVER_COMPOSITIONS) assert.equal(typeof COVER_LAYOUTS[k], 'function', `${k} 缺布局函数`);
  for (const k of SECTION_COMPOSITIONS) assert.equal(typeof SECTION_LAYOUTS[k], 'function', `${k} 缺布局函数`);
});

test('主题色注入：greenPink accentA 出现在输出中', () => {
  const html = renderCoverPoster(coverData, 'greenPink', { composition: 'cover-hero', stylePreset: 'journal' });
  assert.ok(html.includes('#FD98C9'), 'accentA #FD98C9');
});
