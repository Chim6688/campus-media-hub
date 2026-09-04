// AI 生成皮肤的配色契约与清洗（B 批）：AI 输出不可信，字段过滤+hex校验是唯一防线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSkin, SKIN_FIELDS } from '../src/utils/skin.js';

test('SKIN_FIELDS：8 个配色键契约（与 themes.js 皮肤色键一致）', () => {
  assert.equal(SKIN_FIELDS.length, 8);
  const keys = SKIN_FIELDS.map((f) => f.key);
  assert.deepEqual(keys.sort(), ['accentA', 'accentB', 'cardBg', 'cream', 'creamBorder', 'creamText', 'ink', 'pageBg']);
  for (const f of SKIN_FIELDS) assert.ok(f.label && f.hint, `${f.key} 缺 label/hint`);
});

test('normalizeSkin：合法 hex 保留（3位/6位/大小写），非法值丢弃', () => {
  const out = normalizeSkin({
    pageBg: '#F4FAFD', accentA: '#abc', accentB: '#53DE7B',
    ink: 'red', cardBg: 'ffffff', cream: '#EFE6D4',
    creamBorder: '#DBCBB0', creamText: '#9A8B72',
  });
  assert.equal(out.pageBg, '#F4FAFD', '6位hex保留');
  assert.equal(out.accentA, '#abc', '3位hex保留');
  assert.equal(out.ink, undefined, '颜色名丢弃');
  assert.equal(out.cardBg, undefined, '缺#号丢弃');
  assert.equal(out.cream, '#EFE6D4');
});

test('normalizeSkin：未知键过滤、null/非对象容错返回空对象', () => {
  assert.deepEqual(normalizeSkin({ pageBg: '#fff', radius: 99, foo: '#123' }), { pageBg: '#fff' });
  assert.deepEqual(normalizeSkin(null), {});
  assert.deepEqual(normalizeSkin('不是对象'), {});
  assert.deepEqual(normalizeSkin([]), {});
});
