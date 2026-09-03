// 一键复用纯函数（P2-6）：从源任务构造新任务的 insert payload
// 继承：类型/署名/素材/排版主题；清空：成稿（标题/摘要/正文）与流程字段（清单/批注/分享 token）
const REUSE_SUFFIX = '（复用）';

export function buildReuseInsert(src) {
  // 剥掉已有后缀再追加，防止"复用的复用"无限叠加
  const baseTheme = String(src.theme || '').replace(/（复用）+$/, '');
  return {
    theme: baseTheme + REUSE_SUFFIX,   // 推文主题：加后缀便于列表区分
    type: src.type || '活动报道',
    author: src.author,                 // 必填（POST 门禁由调用方保证源任务必有）
    material: src.material || {},       // 素材继承：AI 提取 + 人工补充全量带过去
    layout_theme: src.layout_theme || null, // 排版主题继承：皮肤 id + 令牌覆盖
    status: 'writing',                  // 状态重置；正文/标题/摘要/清单等走列默认值
  };
}
