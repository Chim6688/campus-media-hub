// StylePreset 白名单校验（V1.0 Phase 1）：AI 输出不可信，白名单是唯一防线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLE_PRESETS, DEFAULT_STYLE_PRESET, normalizeStylePreset } from '../src/utils/style-presets.js';

test('STYLE_PRESETS：三套风格包契约（id/name/description 齐全）', () => {
  assert.deepEqual(Object.keys(STYLE_PRESETS).sort(), ['bold', 'journal', 'soft']);
  for (const p of Object.values(STYLE_PRESETS)) {
    assert.ok(p.id && p.name && p.description, `${p.id} 缺字段`);
  }
});

test('DEFAULT_STYLE_PRESET 为 journal（零回归要求）', () => {
  assert.equal(DEFAULT_STYLE_PRESET, 'journal');
  assert.ok(STYLE_PRESETS[DEFAULT_STYLE_PRESET]);
});

test('normalizeStylePreset：合法值原样返回', () => {
  assert.equal(normalizeStylePreset('journal'), 'journal');
  assert.equal(normalizeStylePreset('bold'), 'bold');
  assert.equal(normalizeStylePreset('soft'), 'soft');
});

test('normalizeStylePreset：非法/空/非字符串回退 journal', () => {
  assert.equal(normalizeStylePreset(''), 'journal', '空串回退');
  assert.equal(normalizeStylePreset(undefined), 'journal', 'undefined 回退');
  assert.equal(normalizeStylePreset(null), 'journal', 'null 回退');
  assert.equal(normalizeStylePreset('guochao'), 'journal', '非白名单值回退');
  assert.equal(normalizeStylePreset('JOURNAL'), 'journal', '大小写不符回退');
  assert.equal(normalizeStylePreset(123), 'journal', '非字符串回退');
  assert.equal(normalizeStylePreset({ id: 'bold' }), 'journal', '对象回退');
});
