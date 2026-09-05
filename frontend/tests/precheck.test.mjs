// 发布前检查纯函数测试（V1.0 Phase 6，§20）：八项检查清单汇总
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrecheck } from '../src/utils/precheck.js';

// 基线任务：八项全过
const OK_TASK = {
  title: '这是一个合适的标题长度',
  summary: '摘要内容',
  content: 'x'.repeat(400) + '\n[配图：a]',
  material: { name: '晚会', confirmed: true },
};
const OK_STATE = { coverOk: true, boundCount: 1, report: { passed: true, errors: [], warnings: [] } };

test('基线：八项检查全部通过，ready=true', () => {
  const items = buildPrecheck(OK_TASK, OK_STATE);
  assert.equal(items.length, 8);
  assert.ok(items.every((i) => i.ok));
});

test('检查项固定顺序与命名（标题/摘要/正文/事实确认/封面/正文配图/排版/规范检查）', () => {
  const items = buildPrecheck(OK_TASK, OK_STATE);
  assert.deepEqual(items.map((i) => i.name), ['标题', '摘要', '正文', '事实确认', '封面', '正文配图', '排版', '规范检查']);
});

test('单项失败：各自 ok=false 且带 hint（去哪一步修）', () => {
  const items = buildPrecheck(
    { title: '', summary: '', content: '短\n[配图：a]', material: { name: 'x' } }, // 标题/摘要/正文/事实确认/配图占位 全挂
    { coverOk: false, boundCount: 0, report: null },                                // 封面/绑定/规范检查 全挂
  );
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.equal(by['标题'].ok, false);
  assert.equal(by['摘要'].ok, false);
  assert.equal(by['正文'].ok, false);
  assert.equal(by['事实确认'].ok, false);
  assert.equal(by['封面'].ok, false);
  assert.equal(by['正文配图'].ok, false);
  assert.ok(by['规范检查'].ok === false && by['规范检查'].hint.includes('规范检查'));
  // 排版项：默认通过（模板系统常驻，预览即所见）
  assert.equal(by['排版'].ok, true);
  for (const i of items) assert.ok(typeof i.hint === 'string' && i.hint.length > 0, `${i.name} 需要 hint`);
});

test('正文配图判定：无占位无计划=通过（老任务）；占位数>绑定数=不通过', () => {
  // 无占位无计划
  const a = buildPrecheck({ ...OK_TASK, content: 'x'.repeat(400) }, { ...OK_STATE, boundCount: 0 });
  assert.equal(a.find((i) => i.name === '正文配图').ok, true);
  // 有占位未绑定
  const b = buildPrecheck(OK_TASK, { ...OK_STATE, boundCount: 0 });
  assert.equal(b.find((i) => i.name === '正文配图').ok, false);
});

test('规范检查判定：未跑过（report=null）不通过；跑过且 passed 才通过', () => {
  const a = buildPrecheck(OK_TASK, { ...OK_STATE, report: null });
  assert.equal(a.find((i) => i.name === '规范检查').ok, false);
  const b = buildPrecheck(OK_TASK, { ...OK_STATE, report: { passed: false, errors: [1], warnings: [] } });
  assert.equal(b.find((i) => i.name === '规范检查').ok, false);
});

test('事实确认：无素材任务不要求（向后兼容）', () => {
  const items = buildPrecheck({ ...OK_TASK, material: {} }, OK_STATE);
  assert.equal(items.find((i) => i.name === '事实确认').ok, true);
});
