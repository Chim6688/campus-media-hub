// 构图注册表与白名单（V2 Phase 1）：Composition 层的第一块基石
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSITIONS, COVER_COMPOSITIONS, SECTION_COMPOSITIONS,
  DEFAULT_COMPOSITION, normalizeComposition,
} from '../src/utils/compositions.js';

test('COMPOSITIONS：10 种构图契约（5 cover + 5 section，label 齐全）', () => {
  assert.equal(Object.keys(COMPOSITIONS).length, 10);
  assert.equal(COVER_COMPOSITIONS.length, 5);
  assert.equal(SECTION_COMPOSITIONS.length, 5);
  for (const [id, c] of Object.entries(COMPOSITIONS)) {
    assert.ok(c.label, `${id} 缺 label`);
    assert.ok(c.type === 'cover' || c.type === 'section');
    // 键名前缀与 type 一致（防手滑注册错组）
    assert.ok(id.startsWith(c.type), `${id} 前缀与 type ${c.type} 不符`);
  }
  for (const k of COVER_COMPOSITIONS) assert.equal(COMPOSITIONS[k].type, 'cover');
  for (const k of SECTION_COMPOSITIONS) assert.equal(COMPOSITIONS[k].type, 'section');
});

test('DEFAULT_COMPOSITION：cover/section 各有默认且在白名单内', () => {
  assert.ok(COMPOSITIONS[DEFAULT_COMPOSITION.cover]);
  assert.ok(COMPOSITIONS[DEFAULT_COMPOSITION.section]);
});

test('normalizeComposition：合法且类型匹配原样返回', () => {
  assert.equal(normalizeComposition('cover-circle', 'cover'), 'cover-circle');
  assert.equal(normalizeComposition('section-split', 'section'), 'section-split');
});

test('normalizeComposition：跨类型/非法/空 回退该类型默认', () => {
  assert.equal(normalizeComposition('section-split', 'cover'), DEFAULT_COMPOSITION.cover, '跨类型回退');
  assert.equal(normalizeComposition('cover-circle', 'section'), DEFAULT_COMPOSITION.section, '跨类型回退');
  assert.equal(normalizeComposition('不存在', 'cover'), DEFAULT_COMPOSITION.cover);
  assert.equal(normalizeComposition('', 'section'), DEFAULT_COMPOSITION.section);
  assert.equal(normalizeComposition(undefined, 'cover'), DEFAULT_COMPOSITION.cover);
});
