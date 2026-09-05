// 规则引擎单测：node --test tests/
import { test } from 'node:test';
import assert from 'assert';
// 假 db：按表名返回不同链（rules 空、article_images 可配置图片数据）
import { runChecks } from '../lib/rules-engine.mjs';

// images：该任务已有图片（cover + 绑定正文图），传 [] 表示无任何图片
function makeDb(images = []) {
  return {
    from: (table) => ({
      select: () => ({
        eq: async (col, val) => {
          if (table === 'rules') return { data: [] };
          if (table === 'article_images') {
            // share/task 过滤后按调用语义返回（本测试只查本任务的图）
            return { data: images.filter((i) => (col === 'task_id' ? i.task_id === val : true)) };
          }
          return { data: [] };
        },
      }),
    }),
  };
}

const OK_CONTENT = '正文内容'.repeat(80) + '\n[配图：晚会现场]\n责编 | 张三';
const TASK_ID = 't1';

test('缺标题/摘要/责编署名 → 3 个 error，不通过', async () => {
  // 给足封面（Phase 6 起封面也是 error），隔离验证 builtin 三项
  const images = [{ task_id: TASK_ID, type: 'cover', position: 0 }];
  const r = await runChecks(makeDb(images), { id: TASK_ID, title: '', summary: '', content: '' });
  assert.equal(r.passed, false);
  assert.equal(r.errors.length, 3);
});

test('合规任务（占位已绑定+有封面+素材已核实）→ 通过且无 error', async () => {
  const images = [
    { task_id: TASK_ID, type: 'cover', position: 0 },
    { task_id: TASK_ID, type: 'content', position: 1 },
  ];
  const r = await runChecks(makeDb(images), {
    id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: OK_CONTENT,
    material: { name: '晚会', confirmed: true },
  });
  assert.equal(r.passed, true);
  assert.equal(r.errors.length, 0);
});

test('Phase6：缺封面 → error 阻断（§20 封面为必检项）', async () => {
  const images = [{ task_id: TASK_ID, type: 'content', position: 1 }];
  const r = await runChecks(makeDb(images), {
    id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: OK_CONTENT,
    material: { confirmed: true },
  });
  assert.equal(r.passed, false);
  assert.ok(r.errors.some((e) => e.rule === '封面'));
});

test('Phase6：有素材但未确认事实 → error（§15 事实确认）', async () => {
  const images = [
    { task_id: TASK_ID, type: 'cover', position: 0 },
    { task_id: TASK_ID, type: 'content', position: 1 },
  ];
  const r = await runChecks(makeDb(images), {
    id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: OK_CONTENT,
    material: { name: '晚会' }, // 有素材但没勾"已核实"
  });
  assert.equal(r.passed, false);
  assert.ok(r.errors.some((e) => e.rule === '事实确认'));
});

test('Phase6：无素材任务不要求事实确认（向后兼容）', async () => {
  const images = [
    { task_id: TASK_ID, type: 'cover', position: 0 },
    { task_id: TASK_ID, type: 'content', position: 1 },
  ];
  const r = await runChecks(makeDb(images), {
    id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: OK_CONTENT,
    material: {}, // 无任何素材内容
  });
  assert.equal(r.passed, true);
});

test('Phase4：占位未绑定图片 → error 阻断（V1.0 §13 缺图必须能被检查发现）', async () => {
  const r = await runChecks(makeDb([]), { id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: OK_CONTENT });
  assert.equal(r.passed, false);
  assert.ok(r.errors.some((e) => e.rule === '配图绑定' && /1 处配图占位未绑定/.test(e.message)));
});

test('Phase4：绑定数少于占位数 → error 报差值', async () => {
  const two = '正文内容'.repeat(80) + '\n[配图：a]\n[配图：b]\n[配图：c]\n责编 | 张三';
  const images = [{ task_id: TASK_ID, type: 'content', position: 1 }];
  const r = await runChecks(makeDb(images), { id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: two });
  assert.ok(r.errors.some((e) => /2 处配图占位未绑定/.test(e.message)));
});

test('Phase4→6：无封面 → error 阻断（Phase 6 起封面为必检 error 项）', async () => {
  const images = [{ task_id: TASK_ID, type: 'content', position: 1 }];
  const r = await runChecks(makeDb(images), { id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: OK_CONTENT });
  assert.equal(r.passed, false);
  assert.ok(r.errors.some((e) => e.rule === '封面'));
});

test('无占位的旧任务 → 不触发配图绑定检查（向后兼容；封面仍必检）', async () => {
  const noMark = '正文内容'.repeat(80) + '\n责编 | 张三';
  const images = [{ task_id: TASK_ID, type: 'cover', position: 0 }];
  const r = await runChecks(makeDb(images), { id: TASK_ID, title: '这是一个合适的标题长度', summary: '摘要', content: noMark });
  assert.equal(r.passed, true);
  assert.ok(!r.errors.some((e) => e.rule === '配图绑定'));
});

test('标题过短 → warning 但不阻断', async () => {
  const content = '正文内容'.repeat(80) + '\n[配图：现场]\n责编 | 张三';
  const images = [
    { task_id: TASK_ID, type: 'cover', position: 0 },
    { task_id: TASK_ID, type: 'content', position: 1 },
  ];
  const r = await runChecks(makeDb(images), { id: TASK_ID, title: '短标', summary: '摘要', content });
  assert.equal(r.passed, true);
  assert.ok(r.warnings.some((w) => w.rule === '标题长度'));
});
