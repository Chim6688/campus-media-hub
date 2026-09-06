// 视觉数据装配器（V1.0 Phase 3+4）：任务数据 → 视觉卡 data 契约
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverData, buildSectionData, firstContentImage } from '../src/utils/visual-data.js';

const TASK = {
  title: '山海电白青春突击队',
  summary: '深圳信息职业技术大学赴茂名电白开展文旅调研',
  material: {
    name: '三下乡文旅调研',
    time: '2026年8月1日-7日',
    location: '茂名电白',
  },
};
const IMG = { url: 'https://supabase.example/article-images/t1/content/a.jpg' };

test('buildCoverData：真实数据映射（title 主标题 / summary 副标题 / material.location+time 落款）', () => {
  const d = buildCoverData(TASK, IMG);
  assert.equal(d.title, '山海电白青春突击队');
  assert.equal(d.subtitle, '深圳信息职业技术大学赴茂名电白开展文旅调研');
  assert.equal(d.imageUrl, IMG.url);
  assert.ok(d.place.includes('茂名电白'), 'place 取 material.location');
  assert.ok(d.date.includes('2026年8月1日'), 'date 取 material.time');
  assert.ok(Array.isArray(d.tags) && d.tags.length >= 1, 'tags 至少一条');
});

test('buildCoverData：缺省兜底（无 summary/material 用占位文案，绝不出现 undefined）', () => {
  const d = buildCoverData({ title: '只有标题' }, null);
  assert.equal(d.title, '只有标题');
  assert.equal(d.imageUrl, '');
  assert.ok(d.subtitle, '副标题有兜底');
  assert.ok(d.org, '机构名有兜底');
  const s = JSON.stringify(d);
  assert.ok(!s.includes('undefined') && !s.includes('null'));
});

test('buildCoverData：title 缺省兜底「未命名推文」', () => {
  const d = buildCoverData({}, IMG);
  assert.equal(d.title, '未命名推文');
});

test('buildSectionData：章节卡映射与序号透传', () => {
  const d = buildSectionData(2, TASK, IMG);
  assert.equal(d.partNum, 2);
  assert.equal(d.title, TASK.title); // 章节卡主标题缺省用任务标题，用户可编辑
  assert.equal(d.imageUrl, IMG.url);
  const e = buildSectionData(1, {}, null);
  assert.equal(e.imageUrl, '');
  assert.ok(e.title, '标题兜底');
});

test('firstContentImage：取第一张 position=0 的正文图；无则 null（已绑定槽位的图不占用）', () => {
  const images = [
    { type: 'cover', url: 'c' },
    { type: 'content', position: 1, url: 'bound' },
    { type: 'content', position: 0, url: 'pool1' },
    { type: 'content', position: 0, url: 'pool2' },
  ];
  assert.equal(firstContentImage(images)?.url, 'pool1');
  assert.equal(firstContentImage([{ type: 'content', position: 3 }]), null);
  assert.equal(firstContentImage([]), null);
  assert.equal(firstContentImage(null), null);
});
