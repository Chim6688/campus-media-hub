// 视觉数据装配器（V1.0 Phase 3+4）：任务数据 → 视觉卡 data 契约
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoverData, buildSectionData, firstContentImage, normalizeVisualSuggestions } from '../src/utils/visual-data.js';

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

// ===== AI 视觉建议清洗（V1.0 Phase 6）：AI 输出不可信，白名单+截断是防线 =====
const GOOD_SUGGEST = {
  coverSubtitle: '山海青春 挺膺担当',
  coverTags: ['三下乡', '文旅调研', '青春担当'],
  sectionCards: [
    { partNum: 1, title: '旧址参观学党史', subtitle: '追溯红色足迹', slot: 1 },
    { partNum: 2, title: '田间调研话振兴', subtitle: '把论文写在大地', slot: 2 },
  ],
};

test('normalizeVisualSuggestions：合法建议原样通过（排序）', () => {
  const r = normalizeVisualSuggestions(GOOD_SUGGEST);
  assert.equal(r.coverSubtitle, '山海青春 挺膺担当');
  assert.deepEqual(r.coverTags, ['三下乡', '文旅调研', '青春担当']);
  assert.equal(r.sectionCards.length, 2);
  assert.equal(r.sectionCards[0].partNum, 1);
  assert.equal(r.sectionCards[1].slot, 2);
});

test('normalizeVisualSuggestions：超限截断（tags>3、tag>8字、subtitle>16字）', () => {
  const r = normalizeVisualSuggestions({
    coverSubtitle: 'a'.repeat(30),
    coverTags: ['一二三四五六七八九', 'ok', '第三个', '第四个'],
    sectionCards: [{ partNum: 1, title: '标题', subtitle: 'b'.repeat(20), slot: 1 }],
  });
  assert.equal(r.coverTags.length, 3, 'tags 最多 3 个');
  assert.equal(r.coverTags[0].length, 8, '单个 tag 最多 8 字');
  assert.equal(r.coverSubtitle.length, 30, 'coverSubtitle 上限 30 字');
  assert.ok(r.sectionCards[0].subtitle.length <= 16, '章节卡 subtitle ≤16 字');
});

test('normalizeVisualSuggestions：脏数据容错（不抛异常、字段兜底）', () => {
  const r = normalizeVisualSuggestions({
    sectionCards: [
      { title: '有效卡' },
      { title: '', subtitle: '无标题卡应丢弃' },
      { partNum: 'x', title: '二', slot: -5 },
      { partNum: 9, title: '三' },
      { partNum: 10, title: '四' },
    ],
  });
  assert.equal(r.sectionCards.length, 3, '最多 3 张且丢弃无标题卡');
  assert.equal(r.sectionCards[0].partNum, 1, 'partNum 缺省补序号');
  assert.equal(r.sectionCards[0].slot, 1, 'slot 非法回 1');
  assert.ok(r.sectionCards[0].title === '有效卡');
});

test('normalizeVisualSuggestions：非对象/null/数组输入返回全空结构', () => {
  for (const bad of [null, undefined, 'x', [], 123]) {
    const r = normalizeVisualSuggestions(bad);
    assert.equal(r.coverSubtitle, '');
    assert.deepEqual(r.coverTags, []);
    assert.deepEqual(r.sectionCards, []);
  }
});

test('normalizeVisualSuggestions：coverTags 非数组/含非字符串容错', () => {
  const r = normalizeVisualSuggestions({ coverTags: '不是数组', sectionCards: [{ title: 't' }] });
  assert.deepEqual(r.coverTags, []);
  const r2 = normalizeVisualSuggestions({ coverTags: [1, '有效', null, ''] });
  assert.deepEqual(r2.coverTags, ['有效'], '只留非空字符串项');
});
