# V1.0 视觉图片生产工作台 · 设计规格

> 依据：docs/开发方案-CampusMediaHub-V1.0-视觉工作台.md（用户 2026-09-06 提供，原微信文件已存档）
> 范围：V1.0 视觉生产线的总体架构决策 + Phase 1/2 底座细节。每个 Phase 独立实施计划、独立验收。
> 核心理念（沿用原方案）：AI 负责理解与推荐，程序负责稳定渲染，小编负责最终确认。

## 1. 与原方案的代码核验修正（已对照现有代码确认）

原方案假设"从零建"，实际以下能力**已存在**，相应 Phase 缩水为"对接"：

| 原方案假设 | 代码现状 | 修正决策 |
|---|---|---|
| 新建 /api/images、article_images、Storage | 全部已上线（backend/functions/images.mjs，增删改查齐全） | Phase 3/4 直接对接，不新建 |
| 引入 `<!-- IMAGE:slot-N -->` 标记 | wechat-format.js 已实现 `[配图：desc]` 整段占位=槽位 N | 沿用现有语法，不引入新标记 |
| stylePreset 存 tasks.theme | tasks.theme 是推文主题；排版主题在 tasks.layout_theme（jsonb：{id, overrides}） | stylePreset 作为 layout_theme 第三个键，零数据库迁移 |
| source 需加 'generated' | 现约束 ('upload','ai') | 复用 'ai'，caption 注明"视觉模板生成"，零迁移 |
| 新建 VisualDesignWorkspace.vue 页面 | TaskDetail 已拆 MaterialPanel 等子组件 | 新增 frontend/src/components/visual/ 子组件目录，嵌入工作流第④步，不另起页面 |
| 六步工作流加视觉设计 | steps.js 六步纯函数 | 改七步：素材→写稿→配图→**视觉**→排版→检查→审核 |

## 2. 架构：单一渲染源

```
数据（文字/图片/stylePreset/8色配色）
  ↓
frontend/src/utils/visual-templates.js   ← 唯一模板渲染函数（返回 inline-style HTML 字符串）
  ↓
预览：同一函数渲染 → 缩放展示（CSS transform 仅用于显示）
导出：同一函数渲染 → 离屏自然尺寸克隆节点 → html2canvas 截图 → PNG
```

新文件清单（Phase 1）：
- `frontend/src/utils/style-presets.js` — 结构风格包注册表 + normalizeStylePreset 白名单校验
- `frontend/src/utils/visual-templates.js` — Cover Poster / Section Card 模板渲染函数（纯函数，可单测）
- `frontend/src/utils/visual-export.js` — 导出管线（懒加载 html2canvas + 前置检查 + 截图）
- `frontend/src/components/visual/` — VisualPanel.vue（第④步面板）、VisualCardPreview.vue、VisualTemplateSelector.vue
- `frontend/tests/style-presets.test.mjs`、`visual-templates.test.mjs`

## 3. 导出管线（用户 14 条规范逐条落实）

1. **同一渲染源**：预览与导出均由 visual-templates.js 同一函数产出，无第二套渲染逻辑
2. **不维护 Canvas 手绘逻辑**：唯一图片化途径是 html2canvas 截图
3. **懒加载**：仅在点击"导出 PNG"时 `import('html2canvas')`，vite 自动分包
4. **首屏零成本**：html2canvas 不进主 bundle（dynamic import 分包验证：build 后独立 chunk）
5. **字体就绪**：导出前 `await document.fonts.ready`
6. **图片就绪**：导出前 `Promise.all` 等待节点内全部 `<img>` complete（onload/onerror 决议）
7. **CORS**：模板渲染的 `<img>` 带 `crossorigin="anonymous"`（Supabase Storage 公开桶返回 `Access-Control-Allow-Origin: *`；预览阶段即校验，CORS 失败当场暴露）
8. **useCORS**：`html2canvas(el, { useCORS: true, scale: 2, width, height, backgroundColor: null })`
9. **失败即报错**：任一图片 onerror → 抛出"图片加载失败（第 N 张）"，终止导出，绝不生成缺图 PNG
10. **CSS 白名单**：模板只用 background-color / border / border-radius / padding / margin / font-size / line-height / flex / 文档流
11. **禁用清单**：filter、backdrop-filter、复杂渐变、复杂阴影、CSS animation、transform 核心布局、absolute 主布局（预览缩放的 transform 不进入导出节点）
12. **固定尺寸**：Cover Poster 900×383（公众号首图 2.35:1）；Section Card 900×1200（竖版）；scale=2 实际输出 1800×766 / 1800×2400
13. **长文本策略**：标题超长按模板定义截断（省略号）或自适应缩小字号，模板函数内置并单测
14. **真机验证**：见第 7 节测试清单

## 4. StylePreset（结构风格包 = 整篇推文视觉 DNA）

```js
// frontend/src/utils/style-presets.js
export const STYLE_PRESETS = {
  journal: { id: 'journal', name: '手账杂志', description: '轻文艺、留白、细线、轻装饰' },
  bold:    { id: 'bold',    name: '大色块',   description: '高对比、强标题、几何结构、活动感' },
  soft:    { id: 'soft',    name: '柔和',     description: '低对比、圆角、清新、轻装饰' },
};
export const DEFAULT_STYLE_PRESET = 'journal';
// 白名单校验：非法/空/大小写不符 → 回退 journal（AI 输出异常不崩页面）
export function normalizeStylePreset(raw) { ... }
```

- **默认 journal = 现有渲染零回归**：wechat-format.js 组件函数增加 stylePreset 分支，journal 分支输出与现版逐字节一致（测试断言）
- 同一 stylePreset 同时驱动：正文排版（wechat-format 分支）+ Cover Poster + Section Card（visual-templates 分支），保证整篇视觉统一
- 存储：`tasks.layout_theme = { id, overrides, stylePreset }`；缺省键 = journal（历史数据兼容）
- UI：参数面板加"结构风格"三选一选择器（journal/bold/soft）

## 5. 识图数据流（Phase 5，接口契约先定）

```
上传参考图（前端压缩→base64）+ 可选一句话描述
  → 后端视觉 provider（glm-4v-flash，仅识图用，不替换文本 provider）
  → 输出 JSON：{ 8色配色, stylePreset, description, recommendedVisuals }
  → 前端 normalizeSkin 清洗 8 色 + normalizeStylePreset 白名单校验（非法回退 journal）
  → 应用到 layout_theme → 预览 → 小编确认
```

- 后端：ai-providers.mjs 新增视觉 provider；prompts.mjs 新增 gen_skin_vision（输出严格 JSON，风格描述用第 4 节三套 description）
- 前端：现有"AI 生成配色"弹窗扩展"上传参考图"入口；TaskDetail 超行数则抽 VisionSkinModal.vue（沿用子组件拆分惯例）

## 6. 错误处理与降级

| 场景 | 处理 |
|---|---|
| 视觉模型限流（1305） | 沿用现有错误文案 + 稍后重试提示；不阻塞手动选风格与文章生产 |
| AI 返回非法 JSON | 提示识图失败，保留当前主题，页面不崩 |
| AI 选错风格 | 手动切换三选一，不阻塞主流程 |
| 导出图片加载失败 | 明确提示第几张图失败，终止导出（不生成缺图 PNG） |
| 导出超时/异常 | 提示重试，可下载重试入口保留 |

## 7. 测试策略（TDD，node --test）

纯函数单测：
- normalizeStylePreset：合法三值 / 非法值 / 空串 / undefined / 大小写 → journal 回退
- visual-templates：三套 preset × Cover/SectionCard；中文渲染、颜色注入、图片 URL/crossorigin、空字段、超长标题、固定尺寸 width/height 断言、CSS 禁用清单扫描（断言输出不含 filter/absolute 等）
- steps.js 七步：各状态（writing/reviewing/published）× 数据完备度
- 零回归：journal 默认下 wechat-format 现有测试全绿，输出与现版一致

真机验证（dev-server + 独立浏览器）：
1. 上传参考图 → AI 分析 → 风格应用 → 预览
2. Cover/Section Card 生成 → 编辑文字/换图/换风格 → 预览即时更新
3. 导出 PNG：中文字体正常、图片完整、尺寸精确（1800×766 / 1800×2400）、清晰度合格
4. 手机宽度预览（响应式）+ 复制公众号后台最终视觉检查

## 8. 交付批次（对齐原方案 9 Phase，按核验修正）

| 批次 | 内容 | 验收物 |
|---|---|---|
| Phase 1 | style-presets + visual-templates + 导出管线 + Mock 数据 | 真机导出三风格 PNG |
| Phase 2 | StylePreset 融合 wechat-format + layout_theme 存储 + 选择器 | 现有文章零回归 + 新风格生效 |
| Phase 3+4（合并） | 对接现有 article_images / Storage / 槽位绑定 | 生成图自动入库、绑定封面/槽位 |
| Phase 5 | GLM-4V-Flash 识图（gen_skin_vision） | 上传参考图一键得到 8色+风格 |
| Phase 6-9 | 视觉建议 / 工作流整合 / 发布检查 / 端到端 | 按原方案 |

每 Phase 完成后按原方案第 35 节格式汇报，**暂停等待验收，不自动进入下一 Phase**。

## 9. 明确不做

沿用原方案第 33 节清单（微信 API 自动发布、Photoshop 级编辑器、智能抠图、视频、多人协作等），V1.0 全部不做。
