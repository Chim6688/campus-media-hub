# V2 Phase 1 视觉架构升级（Composition 层）· 设计规格

> 依据：docs/改造指令-CampusMediaHub-视觉设计V2.md（用户拍板：方案 A 构图注册表+参数注入；方案 b 抽 VisualEditor）
> 范围：仅 Phase 1（视觉架构，不接 AI/不做 Storage 迁移/不做新导出/不动正文排版）
> 核心原则：AI 负责设计判断；Composition 负责构图；StylePreset 负责视觉语言；HTML/CSS 负责真实排版；html2canvas 负责导出

## 1. 四层架构（V2 核心改造）

```
VisualType（cover | section）          ← 决定渲染入口与固定尺寸
  ↓
Composition（构图，决定"怎么摆"）       ← 新增层：注册表 + 布局函数分派
  ↓
StylePreset（视觉语言，决定"什么味"）   ← 重构：从布局分支改为纯参数包注入
  ↓
Content（真实文字 + 真实图片）          ← 不变：data 平铺契约沿用
```

## 2. compositions.js（新建）：构图注册表

```js
// 构图注册表：5 Cover + 5 Section，每个构图是独立布局函数的注册项
export const COMPOSITIONS = {
  // —— Cover（900×383）——
  'cover-hero':      { type: 'cover', label: '主视觉横幅' },   // 现白卡横幅演化：上信息带+下大图
  'cover-circle':    { type: 'cover', label: '圆形照片' },     // 圆形/半圆照片 + 标签 + 地点日期 + 大标题 + 线条装饰
  'cover-editorial': { type: 'cover', label: '杂志错位' },     // 大留白 + 照片错位 + 编号 + 分割线 + 大标题
  'cover-photo':     { type: 'cover', label: '满版大图' },     // 图占上半主体 + 底部信息条
  'cover-minimal':   { type: 'cover', label: '极简文字' },     // 纯文字排版 + 细线装饰（无图也成立）
  // —— Section（900×1200）——
  'section-photo-stack': { type: 'section', label: '照片叠放' }, // 多图错位叠放 + Part + 编号
  'section-editorial':   { type: 'section', label: '杂志章节' }, // 杂志式：大编号 + 分割线 + 大标题 + 图
  'section-split':       { type: 'section', label: '左右分栏' }, // 左文右图（或对调）分栏
  'section-minimal':     { type: 'section', label: '极简章节' }, // 纯文字竖排层级
  'section-full-photo':  { type: 'section', label: '满版图+浮层' }, // 全图 + 底部信息浮层
};
export const DEFAULT_COMPOSITION = { cover: 'cover-hero', section: 'section-editorial' };
// 白名单校验：按 visualType 校验归属；非法回退该类型默认
export function normalizeComposition(raw, visualType) { ... }
```

- 构图间差异硬指标（验收"不能只是换颜色"）：**图片区形状/位置、文字块位置、装饰元素三者至少两项不同**
- 圆形照片实现：外层 div `border-radius:50%; overflow:hidden` 包 imgNode（纯 CSS 白名单内）
- 照片叠放实现：两张图用 margin 负值错位（文档流，非 absolute）
- CSS 红线沿用 V1：无 filter/absolute 主布局/transform 主布局/渐变

## 3. StylePreset 重构：布局分支 → 纯参数包

style-presets.js 的 STYLE_PRESETS 三项新增 `styleParams` 字段（纯视觉语言，不含任何布局信息）：

```js
journal: { id, name, description,
  styleParams: { radiusScale: 1, borderWidth: 1.5, decorations: true, fontWeight: 'normal', uppercase: false } },
bold:    { ..., styleParams: { radiusScale: 0, borderWidth: 0, decorations: false, fontWeight: 'bold', uppercase: true } },
soft:    { ..., styleParams: { radiusScale: 2, borderWidth: 1, decorations: true, fontWeight: 'normal', uppercase: false } },
```

- 布局函数签名统一 `(theme, d, sp)`——sp=styleParams；布局函数内**零 preset 分支**，只消费 sp
- 兼容：`DEFAULT_COMPOSITION.cover`（cover-hero）+ journal 参数的渲染输出 **逐字节等于** V1 journal 版（零回归锚点）

## 4. visual-templates.js 重构

```js
// 渲染入口：composition 分派布局，stylePreset 注入视觉语言
export function renderCoverPoster(data, themeId, opts = {}) {
  const theme = resolveTheme(themeId, opts.overrides);
  const sp = getStyleParams(normalizeStylePreset(opts.stylePreset)); // 参数包
  const comp = normalizeComposition(opts.composition, 'cover');
  const fn = COVER_LAYOUTS[comp]; // 构图 → 布局函数
  return fn(theme, d, sp);
}
// renderSectionCard 同构（SECTION_LAYOUTS）
export function getStyleParams(presetId) { ... } // 从 STYLE_PRESETS 取参数包，缺省 journal
```

- 导出新增：`COMPOSITIONS`、`normalizeComposition`、`getStyleParams`、`COVER_LAYOUTS`/`SECTION_LAYOUTS`（供测试遍历断言）
- COVER_SIZE/SECTION_CARD_SIZE、esc/clampText/imgNode/pad2 等工具全部保留复用
- **wechat-format.js 正文排版零改动**（指令红线）

## 5. VisualEditor.vue（新建）：字段编辑子组件

- props：`{ coverData: Object, cardData: Object, activeType: String }`；双向绑定字段（v-model 到 reactive 对象的键，沿用现有状态管理，**不重写数据流**）
- 字段：标题 / 副标题 / 学校·组织 / 地点 / 日期 / Part·编号（activeType 切换显示 Cover 组或 Section 组）
- VisualPanel 引入后模板加一行 `<VisualEditor ...>`；VisualPanel 预计 195±行（红线内）
- 预览实时性：v-model 直改 reactive → VisualCardPreview computed 重渲染（既有机制，零新代码）

## 6. VisualPanel/VisualCardPreview 透传

- VisualPanel：新增 `composition` ref（按 activeType 分别记忆 cover/section 构图）；模板加 Composition 选择器（下拉，COMPOSITIONS 按 type 过滤）；透传给 VisualCardPreview
- VisualCardPreview：props 加 `composition`，透传给渲染函数
- 现有生成上传/绑定/AI 建议链路零改动（composition 不入库——layout_theme 存储留 Phase 2 按指令范围外处理，本轮仅会话态）

## 7. 测试策略（TDD，双维断言）

- **白名单**：normalizeComposition 合法值/非法回退/type 归属校验（cover 构图传给 section 入口须回退 section 默认）
- **双维解耦断言**（V2 核心）：
  - 同构图换风格：`renderCoverPoster(d, 'greenPink', {composition:'cover-hero', stylePreset:'journal'})` ≠ `...stylePreset:'bold'`（视觉语言变）且**布局骨架相同**（抽公共特征断言，如同一 imgNode 尺寸）
  - 同风格换构图：journal 下 5 种 Cover 输出互不相同（布局变）
  - 全矩阵：5 构图 × 3 风格 × 2 类型 = 30 组合渲染不抛异常、含固定尺寸、过 CSS 禁用清单扫描
- **零回归锚点**：cover-hero + journal 参数 = V1 journal 输出逐字节一致（对拍断言，V1 期望串固化在测试里）
- 编辑链路：VisualEditor 字段变更 → 预览 HTML 含新值（组件测试以真机验收为主，纯函数全 TDD）

## 8. 交付物与验收（指令 Phase 1 验收 10 条映射）

| 指令验收项 | 落点 |
|---|---|
| 1 可选 Cover/Section | VisualPanel 现有两卡并存（保持），Composition 选择器按类型过滤 |
| 2/3/9 至少 3 构图明显不同 | 5+5 构图，差异硬指标（§2）+ 双维测试断言 |
| 4 StylePreset 变视觉语言变 | styleParams 参数包 + 测试断言 |
| 5 标题真实 HTML 文字 | imgNode/esc 既有，全部 text node |
| 6 图片真实 | imageUrl 契约沿用（图片库选图） |
| 7/8 标题/图片修改实时预览 | VisualEditor v-model + 既有 computed 链路 |
| 10 无布局错乱 | 30 组合渲染测试 + 真机 10 条验收 |

真机验收：dev-server 起服，切 5 构图 × 3 风格目检 + 截图对比；"白色 Card+一图+一标题"同质化即失败。

## 9. 明确不做（本轮）

AI 视觉分析接入（Phase 2）、html2canvas 新导出逻辑（沿用现有）、Storage 迁移、composition 入库持久化、wechat-format 改动、VisualType 扩展（quote/photo/timeline/ending 仅在注册表结构上留位）。
