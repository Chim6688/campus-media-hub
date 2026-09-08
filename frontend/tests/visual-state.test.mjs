// 视觉设计编辑态清洗测试（v6，总方案 §7.1）：visual-state.js 纯函数
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVisualState, imageUrlById } from '../src/utils/visual-state.js';

const FULL = {
  cover: {
    composition: 'cover-circle',
    draft: {
      org: '校园媒体 · 迎新晚会', title: '这是一篇足够长的封面主标题', subtitle: '副标题',
      tags: ['青春', '迎新', '现场'], place: '大学生活动中心', date: '9月20日 19:00', imageId: 'img-1',
    },
  },
  section: {
    composition: 'section-split',
    cardSlot: 3,
    draft: { partNum: 2, title: '晚会现场', subtitle: '灯光与掌声', imageId: 'img-2', image2Id: 'img-3' },
  },
};

test('完整合法输入原样通过（幂等：清洗两次结果一致）', () => {
  const a = normalizeVisualState(FULL);
  const b = normalizeVisualState(a);
  assert.deepEqual(a, FULL);
  assert.deepEqual(b, FULL);
});

test('非法整体输入返回 null（数组/字符串/空）', () => {
  assert.equal(normalizeVisualState(null), null);
  assert.equal(normalizeVisualState(undefined), null);
  assert.equal(normalizeVisualState('x'), null);
  assert.equal(normalizeVisualState([]), null);
});

test('缺省结构：空对象也得到安全默认（不炸、字段齐全）', () => {
  const s = normalizeVisualState({});
  assert.equal(s.cover.composition, 'cover-hero'); // 默认构图承接 V1 零回归锚点
  assert.equal(s.section.composition, 'section-editorial');
  assert.equal(s.section.cardSlot, 1);
  assert.deepEqual(s.cover.draft, { org: '', title: '', subtitle: '', tags: [], place: '', date: '', imageId: null });
});

test('构图跨类型非法 → 回退该类型默认（防 AI/脏数据写错位置）', () => {
  const s = normalizeVisualState({ cover: { composition: 'section-split' }, section: { composition: 'cover-hero' } });
  assert.equal(s.cover.composition, 'cover-hero');
  assert.equal(s.section.composition, 'section-editorial');
});

test('字符串字段截断对齐渲染上限，tags 去脏限 3 条', () => {
  const s = normalizeVisualState({
    cover: {
      draft: { title: '超'.repeat(50), tags: ['ok', '', 42, '长'.repeat(20)], subtitle: '短' },
    },
    section: { draft: { title: '超'.repeat(30), subtitle: '超'.repeat(30) } },
  });
  assert.equal(s.cover.draft.title.length, 30);
  assert.equal(s.cover.draft.tags.length, 2);
  assert.ok(s.cover.draft.tags.every((t) => t.length <= 8), 'tag 截断 8 字');
  assert.equal(s.section.draft.title.length, 20);
  assert.equal(s.section.draft.subtitle.length, 18);
});

test('cardSlot 只收正整数，非法回 1；partNum 下限 1', () => {
  assert.equal(normalizeVisualState({ section: { cardSlot: 0 } }).section.cardSlot, 1);
  assert.equal(normalizeVisualState({ section: { cardSlot: '3' } }).section.cardSlot, 1); // 字符串不收
  assert.equal(normalizeVisualState({ section: { cardSlot: 7 } }).section.cardSlot, 7);
  assert.equal(normalizeVisualState({ section: { draft: { partNum: 0 } } }).section.draft.partNum, 1);
});

test('imageId 只收非空字符串，其余 null', () => {
  const s = normalizeVisualState({ cover: { draft: { imageId: 123 } }, section: { draft: { imageId: '', image2Id: 'x' } } });
  assert.equal(s.cover.draft.imageId, null);
  assert.equal(s.section.draft.imageId, null);
  assert.equal(s.section.draft.image2Id, 'x');
});

test('imageUrlById：按 id 反查图行 URL，查不到返回空串（防死链）', () => {
  const images = [{ id: 'a', url: 'https://x/a.png' }, { id: 'b', url: 'https://x/b.png' }];
  assert.equal(imageUrlById(images, 'b'), 'https://x/b.png');
  assert.equal(imageUrlById(images, 'a'), 'https://x/a.png');
  assert.equal(imageUrlById(images, 'gone'), '');
  assert.equal(imageUrlById(images, null), '');
  assert.equal(imageUrlById([], 'a'), '');
});
