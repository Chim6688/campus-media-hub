// 特征化测试：重构前先固化 greenPink 默认渲染的关键特征，重构后必须逐条保持
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToWechatHTML } from '../src/utils/wechat-format.js';

const SAMPLE = `# 眉标｜测试标题
> 开头引言
## 核心信息
- 时间：9月10日
## 活动介绍
正文第一段内容。

[配图：开场全景]
### 子小节
更多正文内容。
> 中段金句
责编 | 张三`;

const html = markdownToWechatHTML(SAMPLE, 'greenPink', { title: '测试标题', eyebrow: '活动报道' });

test('默认皮肤关键样式特征保持不变（圆角/字号/间距/描边）', () => {
  assert.ok(html.includes('border-radius:10px 0 10px 0'), '正文卡对角圆角 10px');
  assert.ok(html.includes('font-size:15px'), '正文字号 15px');
  assert.ok(html.includes('margin:0 8px 36px'), '小节间距 36px');
  assert.ok(html.includes('border:2px solid'), '标题卡描边 2px');
  assert.ok(html.includes('border-radius:4px'), '标题卡圆角 4px');
  assert.ok(html.includes('font-size:22px'), '标题字号 22px');
});

test('默认皮肤色值来自 greenPink 主题对象', () => {
  assert.ok(html.includes('#FD98C9'), 'accentA');
  assert.ok(html.includes('#53DE7B'), 'accentB');
  assert.ok(html.includes('#F7F5F0'), '页面底色');
});

test('组件结构特征（错位层/胶囊序号/配图占位/落款卡）', () => {
  assert.ok(html.includes('position:absolute;left:-8px;top:-8px'), '标题卡错位层');
  assert.ok(html.includes('border-radius:6px 20px 20px 6px'), '半圆序号胶囊');
  assert.ok(html.includes('📷 配图：开场全景'), '配图占位');
  assert.ok(html.includes('责编 | 张三'), '落款署名保留');
});

test('overrides 令牌覆盖生效（圆角/字号/间距/描边）', () => {
  const h = markdownToWechatHTML(SAMPLE, 'greenPink', {
    title: '测试标题', eyebrow: '活动报道',
    overrides: { radius: 20, bodyFontSize: 17, sectionGap: 24, borderWidth: 3 },
  });
  assert.ok(h.includes('border-radius:20px 0 20px 0'), '圆角覆盖');
  assert.ok(h.includes('font-size:17px'), '字号覆盖');
  assert.ok(h.includes('margin:0 8px 24px'), '间距覆盖');
  assert.ok(h.includes('border:3px solid'), '描边覆盖');
});

test('新预设皮肤可渲染且色值生效', () => {
  const h = markdownToWechatHTML(SAMPLE, 'guochao', {});
  assert.ok(h.includes('#E63946'), '国潮红');
  assert.ok(h.includes('#E9B44C'), '国潮金');
});

test('未知主题回退默认不报错', () => {
  const h = markdownToWechatHTML(SAMPLE, 'not-exist', {});
  assert.ok(h.includes('#FD98C9'), '回退 greenPink');
});
