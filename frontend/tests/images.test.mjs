// 配图工作台纯函数测试（V1.0 Phase 3）：计划解析、槽位构建、图片库筛选
// Phase 5 新增：AI 建议 JSON 清洗、缺失占位补插
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoNotes, buildSlots, poolImages, normalizeSuggestions, insertMissingPlaceholders } from '../src/utils/images.js';

test('parsePhotoNotes：按行拆分、去首尾空白、过滤空行', () => {
  assert.deepEqual(parsePhotoNotes(' 开场全景 \n\n互动特写\n 全场大合唱 '), ['开场全景', '互动特写', '全场大合唱']);
  assert.deepEqual(parsePhotoNotes(''), []);
  assert.deepEqual(parsePhotoNotes(null), []);
});

test('buildSlots：空图片+空计划 → 仅一个空槽', () => {
  const slots = buildSlots([], '');
  assert.equal(slots.length, 1);
  assert.equal(slots[0].position, 1);
  assert.equal(slots[0].image, null);
  assert.equal(slots[0].suggestion, '');
});

test('buildSlots：绑定图与计划建议按位对齐，末尾追加空槽', () => {
  const images = [
    { id: 'a', type: 'cover', position: 0 },
    { id: 'b', type: 'content', position: 2 },
    { id: 'c', type: 'content', position: 0 }, // 库中待选，不占槽
  ];
  const slots = buildSlots(images, '开场全景\n互动特写');
  // 槽数 = max(计划2, 最大绑定2) + 1 末尾空槽 = 3
  assert.equal(slots.length, 3);
  assert.equal(slots[0].image, null);
  assert.equal(slots[0].suggestion, '开场全景');
  assert.equal(slots[1].image.id, 'b');
  assert.equal(slots[1].suggestion, '互动特写');
  assert.equal(slots[2].image, null);
});

test('buildSlots：绑定数超过计划数 → 槽位扩展', () => {
  const slots = buildSlots([{ id: 'x', type: 'content', position: 4 }], '');
  // 槽数 = max(0, 4) + 1 = 5，第 4 槽有图
  assert.equal(slots.length, 5);
  assert.equal(slots[3].image.id, 'x');
  assert.equal(slots[4].image, null);
});

test('poolImages：只留未绑定的正文图', () => {
  const images = [
    { id: 'a', type: 'cover', position: 0 },
    { id: 'b', type: 'content', position: 2 },
    { id: 'c', type: 'content', position: 0 },
  ];
  assert.deepEqual(poolImages(images).map((i) => i.id), ['c']);
});

// ========== V1.0 Phase 5 ==========

test('normalizeSuggestions：合法项按 position 升序保留，非法项丢弃', () => {
  const out = normalizeSuggestions([
    { position: 2, description: '互动特写', reason: '体现过程' },
    { position: 1, description: '开场全景', reason: '现场感' },
    { position: 'x', description: '', reason: 'r' },   // 非法 position + 空 description
    { position: 3, description: '大合唱' },            // reason 缺省容错
    'garbage',
  ]);
  assert.deepEqual(out.map((i) => i.position), [1, 2, 3]);
  assert.equal(out[0].description, '开场全景');
  assert.equal(out[2].reason, '');
  assert.deepEqual(normalizeSuggestions('not array'), []);
  assert.deepEqual(normalizeSuggestions(null), []);
});

test('insertMissingPlaceholders：无缺失返回原内容（引用相等）', () => {
  const content = '段一。\n\n[配图：a]\n\n段二。\n\n[配图：b]';
  assert.equal(insertMissingPlaceholders(content, ['a', 'b']), content);
});

test('insertMissingPlaceholders：缺失占位均匀插入段落间', () => {
  const content = '第一段内容。\n\n第二段内容。\n\n第三段内容。\n\n第四段内容。';
  const out = insertMissingPlaceholders(content, ['开场全景', '互动特写', '大合唱']);
  // 3 缺失 → 正文应出现 3 个新占位
  const marks = (out.match(/^\[配图[：:]/gm) || []).length;
  assert.equal(marks, 3);
  assert.ok(out.includes('[配图：开场全景]'));
  assert.ok(out.includes('[配图：互动特写]'));
  assert.ok(out.includes('[配图：大合唱]'));
  // 原段落全保留
  for (const p of ['第一段内容。', '第二段内容。', '第三段内容。', '第四段内容。']) {
    assert.ok(out.includes(p));
  }
});

test('insertMissingPlaceholders：空正文/空计划容错返回原内容', () => {
  assert.equal(insertMissingPlaceholders('', ['a']), '');
  assert.equal(insertMissingPlaceholders('只有一段。', []), '只有一段。');
  // 单段落 + 需补 1 个：占位追加其后（不破坏内容）
  const out = insertMissingPlaceholders('只有一段。', ['结尾图']);
  assert.ok(out.includes('只有一段。'));
  assert.ok(out.includes('[配图：结尾图]'));
});
