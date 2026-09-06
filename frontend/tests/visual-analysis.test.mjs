// AI 视觉分析清洗与方案工厂（V2 Phase 2）：三白名单 + 方案 A/B/C 构图互异
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisualAnalysis, buildDesignPlans } from '../src/utils/visual-analysis.js';

const GOOD = JSON.stringify({
  visualType: 'section',
  composition: 'section-photo-stack',
  stylePreset: 'journal',
  // 8 色按序契约：0=pageBg（浅底）1=accentA 2=cardBg 3=ink（深卡上白墨，对比可读）
  palette: ['#EAF2F5', '#2F6288', '#163A5F', '#FFFFFF', '#8C8770', '#E2DACA', '#F3EFE6', '#3E3E3E'],
  elements: ['chapterNumber', 'chapterTitle', 'photoStack', 'divider'],
  layoutReason: '参考图采用杂志式照片叠放和大量留白，适合校园文化纪实内容',
  recommendations: ['使用两张现场照片叠放', '标题采用大字号'],
});

test('parseVisualAnalysis：合法分析全维度通过', () => {
  const r = parseVisualAnalysis(GOOD);
  assert.equal(r.ok, true);
  assert.equal(r.visualType, 'section');
  assert.equal(r.composition, 'section-photo-stack');
  assert.equal(r.stylePreset, 'journal');
  assert.equal(Object.keys(r.colors).length, 8);
  assert.equal(r.colors.pageBg, '#EAF2F5');
  assert.equal(r.elements.length, 4);
  assert.ok(r.layoutReason.includes('杂志式'));
  assert.equal(r.recommendations.length, 2);
});

test('parseVisualAnalysis：palette 字段映射 8 色契约（数组→pageBg/accentA/...键）', () => {
  const r = parseVisualAnalysis(GOOD);
  // 数组按序映射：0=pageBg 1=accentA 2=cardBg 3=ink 4=creamText 5=creamBorder 6=cream 7=accentB
  assert.equal(r.colors.accentA, '#2F6288');
  assert.equal(r.colors.ink, '#FFFFFF');
});

test('parseVisualAnalysis：非法 composition/visualType/stylePreset 白名单回退', () => {
  const r = parseVisualAnalysis(JSON.stringify({
    visualType: 'quote', composition: 'cover-circle', stylePreset: 'guochao',
    palette: ['#163A5F', '#2F6288', '#EAF2F5', '#FFFFFF', '#8C8770', '#E2DACA', '#F3EFE6', '#3E3E3E'],
    elements: [], recommendations: [],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.visualType, 'section', '非法类型回退 section');
  assert.equal(r.composition, 'section-editorial', '跨类型构图回退 section 默认');
  assert.equal(r.stylePreset, 'journal');
});

test('parseVisualAnalysis：palette 不足 8 色 → ok=false', () => {
  const r = parseVisualAnalysis(JSON.stringify({
    visualType: 'cover', composition: 'cover-hero', stylePreset: 'journal',
    palette: ['#fff', '#000'], elements: [], recommendations: [],
  }));
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('配色'));
});

test('parseVisualAnalysis：elements/recommendations 过滤与截断（非字符串丢弃/超长截断/上限 5 条）', () => {
  const r = parseVisualAnalysis(JSON.stringify({
    visualType: 'cover', composition: 'cover-hero', stylePreset: 'journal',
    palette: ['#163A5F', '#2F6288', '#EAF2F5', '#FFFFFF', '#8C8770', '#E2DACA', '#F3EFE6', '#3E3E3E'],
    elements: [1, '有效', null, 'x'.repeat(60), 'a', 'b', 'c', 'd'],
    recommendations: '不是数组',
    layoutReason: 123,
  }));
  assert.equal(r.ok, true);
  assert.ok(r.elements.includes('有效'));
  assert.ok(r.elements.every((e) => e.length <= 40 + 1), '单条 ≤40 字（+省略号）');
  assert.ok(r.elements.length <= 5);
  assert.deepEqual(r.recommendations, []);
  assert.equal(r.layoutReason, '', '非法 reason 兜底空串');
});

test('parseVisualAnalysis：非法 JSON/空/数组 → ok=false 不抛异常', () => {
  for (const bad of ['不是JSON', '', 'null', '[1]']) {
    const r = parseVisualAnalysis(bad);
    assert.equal(r.ok, false);
    assert.ok(r.error);
  }
});

test('buildDesignPlans：3 个方案 composition 互不相同且类型正确', () => {
  const r = parseVisualAnalysis(GOOD);
  const plans = buildDesignPlans(r, 'section');
  assert.equal(plans.length, 3);
  const comps = plans.map((p) => p.composition);
  assert.equal(new Set(comps).size, 3, '构图互异');
  assert.ok(comps.includes('section-photo-stack'), 'AI 主方案排第一');
  for (const p of plans) {
    assert.ok(p.name && p.compositionLabel && p.note !== undefined);
    assert.ok(p.composition.startsWith('section'));
  }
});

test('buildDesignPlans：AI 构图非法时从白名单确定性补齐（顺序稳定）', () => {
  const fake = { ok: true, visualType: 'cover', composition: '不存在', stylePreset: 'bold',
    colors: {}, elements: [], layoutReason: '理由', recommendations: [] };
  const plans = buildDesignPlans(fake, 'cover');
  assert.equal(plans.length, 3);
  assert.equal(new Set(plans.map((p) => p.composition)).size, 3);
  assert.ok(plans[0].composition.startsWith('cover'));
});

test('buildDesignPlans：cover 类型不含 section 构图（反之亦然）', () => {
  const fake = { ok: true, visualType: 'cover', composition: 'cover-circle', stylePreset: 'journal',
    colors: {}, elements: [], layoutReason: '', recommendations: [] };
  const plans = buildDesignPlans(fake, 'cover');
  assert.ok(plans.every((p) => p.composition.startsWith('cover')));
});
