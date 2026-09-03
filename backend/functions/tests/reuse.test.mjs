// 一键复用（P2-6）：从源任务构造新任务 insert payload 的纯函数测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReuseInsert } from '../lib/reuse.mjs';

// 模拟 select * 取回的完整已发布源任务行
const SRC = {
  id: 'src-id',
  theme: '迎新晚会报道',
  type: '活动报道',
  author: '张三',
  status: 'published',
  title: '旧标题',
  summary: '旧摘要',
  content: '旧正文'.repeat(100),
  material: { name: '迎新晚会', highlights: ['节目单'] },
  layout_theme: { id: 'guochao', overrides: { radius: 18 } },
  review_checklist: [{ id: '1', text: 'x', done: true }],
  comments: [{ by: '老师', text: 'ok' }],
  share_token: 'abc123',
};

test('复用：继承类型/署名/素材/排版主题，主题加（复用）后缀，状态重置 writing', () => {
  const ins = buildReuseInsert(SRC);
  assert.equal(ins.theme, '迎新晚会报道（复用）');
  assert.equal(ins.type, '活动报道');
  assert.equal(ins.author, '张三');
  assert.deepEqual(ins.material, { name: '迎新晚会', highlights: ['节目单'] });
  assert.deepEqual(ins.layout_theme, { id: 'guochao', overrides: { radius: 18 } });
  assert.equal(ins.status, 'writing');
});

test('清空成稿与流程字段：标题/摘要/正文/清单/批注/分享token/原id 均不进 insert payload', () => {
  const ins = buildReuseInsert(SRC);
  for (const k of ['title', 'summary', 'content', 'review_checklist', 'comments', 'share_token', 'id']) {
    assert.equal(k in ins, false, `${k} 不应出现在 insert payload`);
  }
});

test('旧任务兼容：无 material/layout_theme 字段时回退空对象/null 不报错', () => {
  const ins = buildReuseInsert({ theme: '通知', type: '通知公告', author: '李四' });
  assert.deepEqual(ins.material, {});
  assert.equal(ins.layout_theme, null);
  assert.equal(ins.theme, '通知（复用）');
});

test('后缀幂等：已带（复用）后缀的主题不重复叠加', () => {
  const ins = buildReuseInsert({ theme: '晚会报道（复用）', author: 'x' });
  assert.equal(ins.theme, '晚会报道（复用）');
});
