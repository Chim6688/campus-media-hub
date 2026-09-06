# Campus Media Hub —— 视觉设计 V2 Agent 改造指令

## 1. 目标

将当前“AI配色 + 简单卡片”的视觉模块升级为真正可以在工作台生产公众号视觉图片的“AI视觉设计系统”。

目标链路：

文章内容 + 真实图片 + 可选参考图
→ AI视觉分析
→ VisualType + Composition + StylePreset + Palette + Elements
→ 推荐2~3种设计方案
→ 小编选择
→ 模板化编辑
→ DOM预览
→ PNG/JPG导出
→ article_images
→ 绑定封面/正文Slot
→ 微信预览

这是**局部结构升级**，不要重写整个项目。

---

## 2. 核心架构：四层必须分离

```text
VisualType
↓
Composition
↓
StylePreset
↓
Content
```

### VisualType

第一版：

```js
cover
section
```

预留：

```js
quote
photo
timeline
ending
```

### Composition

Composition负责“怎么摆”。

Cover至少：

```js
cover-hero
cover-circle
cover-editorial
cover-photo
cover-minimal
```

Section至少：

```js
section-photo-stack
section-editorial
section-split
section-minimal
section-full-photo
```

至少3种构图必须有**明显不同的结构**，不能只是换颜色。

例如：

- cover-circle：圆形/半圆照片、标签、地点、日期、大标题、线条装饰
- cover-editorial：大量留白、照片错位/叠放、Part、编号、分割线、大标题
- section-photo-stack：多照片错位叠放
- section-editorial：杂志式章节页
- section-split：左右分栏

### StylePreset

StylePreset只负责“视觉语言”，至少保留：

```js
journal
bold
soft
```

不要让StylePreset决定具体布局。

---

## 3. 视觉状态数据结构

统一为类似：

```js
{
  visualType: "cover",
  composition: "cover-editorial",
  stylePreset: "journal",
  palette: ["#163A5F", "#2F6288", "#EAF2F5", "#FFFFFF"],
  elements: ["chapterNumber", "chapterTitle", "photoStack", "divider"],
  content: {
    title: "走进岭南文化",
    subtitle: "一次校园文化调研",
    school: "XX大学",
    location: "广州",
    date: "2026.08",
    part: "01"
  },
  images: []
}
```

优先兼容现有theme/layout_theme结构，不要无意义改数据库。

---

## 4. AI视觉分析

不要只返回颜色和stylePreset。

必须返回：

```json
{
  "visualType": "section",
  "composition": "section-photo-stack",
  "stylePreset": "journal",
  "palette": ["#163A5F", "#2F6288", "#EAF2F5", "#FFFFFF"],
  "imageCount": 2,
  "elements": ["chapterNumber", "chapterTitle", "photoStack", "divider"],
  "layoutReason": "参考图采用杂志式照片叠放和大量留白，适合校园文化纪实内容",
  "recommendations": [
    "使用两张现场照片叠放",
    "标题采用大字号",
    "保留较多留白"
  ]
}
```

分析参考图时至少考虑：

1. 主色/辅色
2. 明度
3. 对比度
4. 视觉情绪
5. 构图方式
6. 图片数量
7. 图片位置关系
8. 字体层级
9. 装饰元素

AI输出必须经过前端normalize和白名单校验：

```js
VALID_VISUAL_TYPES
VALID_COMPOSITIONS
VALID_STYLE_PRESETS
```

非法值自动fallback，不能让页面崩溃。

---

## 5. AI推荐方案

视觉设计页面要出现：

```text
AI视觉设计

[上传参考图]
[可选描述]
[AI分析]

识别结果
视觉类型：章节页
风格：手账杂志
构图：照片叠图
配色：8色

AI推荐设计

[方案A：杂志叠图]
[方案B：大图留白]
[方案C：分栏构图]

[使用这个设计]
```

A/B/C必须是真正不同的Composition，不能只是换颜色。

---

## 6. Visual Design Workspace

优先检查现有代码，必要时新增：

```text
frontend/src/components/VisualDesignWorkspace.vue
frontend/src/components/visual/VisualTemplateSelector.vue
frontend/src/components/visual/VisualPreview.vue
frontend/src/components/visual/CoverPosterEditor.vue
frontend/src/components/visual/SectionCardEditor.vue
frontend/src/components/visual/VisualElementEditor.vue
frontend/src/components/visual/ReferenceImageUploader.vue
```

如果已有相同能力，复用而不是重复创建。

---

## 7. 编辑能力

至少支持修改：

- 标题
- 副标题
- 学校/组织
- 地点
- 日期
- Part/编号
- 主图/辅助图
- 图片替换/删除
- 颜色
- StylePreset
- Composition

按钮至少有：

```text
[换一个构图]
[换一个风格]
[替换图片]
[重新生成]
[保存]
[导出PNG]
```

---

## 8. 图片系统

复用现有article_images。

建议字段：

```text
id
task_id
url
type
position
caption
source
created_at
updated_at
```

type：

```text
cover
content
```

source：

```text
upload
ai
generated
```

如果项目现有结构不同，优先兼容现有结构。

真实上传照片必须参与设计，禁止长期使用假图片。

---

## 9. 禁止AI直接生成中文海报文字

不要让AI直接生成最终中文海报。

正确架构：

```text
AI
→ 判断设计结构

程序
→ HTML真实文字
→ 真实图片
→ CSS排版
```

这样标题可编辑，也避免中文生成错误。

---

## 10. 导出方案

采用：

```text
DOM + HTML/CSS
↓
html2canvas
↓
PNG/JPG
```

不要维护第二套Canvas绘制逻辑。

安装：

```bash
npm install html2canvas
```

点击导出时懒加载：

```js
const html2canvas = (await import("html2canvas")).default
```

要求：

1. 预览DOM和导出DOM使用同一模板；
2. 导出前等待`document.fonts.ready`；
3. 等待图片加载完成；
4. `useCORS: true`；
5. 图片跨域失败要提示；
6. 固定导出尺寸；
7. 避免filter/backdrop-filter/mix-blend-mode等兼容性风险较高的效果；
8. 不用动画作为导出内容；
9. 不依赖transform作为主要布局。

建议第一版：

```text
封面：900 × 383
正文视觉图：900 × 1200
```

若项目已有明确尺寸规范，以项目现有规范为准。

---

## 11. 导出后闭环

```text
点击导出
↓
html2canvas
↓
Blob
↓
Supabase Storage
↓
article_images
↓
返回URL
```

建议路径：

```text
article-images/{task_id}/cover/
article-images/{task_id}/content/
```

兼容项目已有Storage路径。

生成封面后：

```text
[设置为封面]
```

生成正文视觉图后：

```text
[插入正文]
```

插入正文必须绑定当前文章的Image Slot，不要求小编复制URL。

---

## 12. 微信预览连接

最终必须形成：

```text
视觉图片
↓
article_images
↓
Image Slot
↓
wechat-format.js
↓
微信预览
```

微信预览必须显示真实图片，而不是：

```text
[配图：说明]
```

这种假占位。

---

# Phase 1：先做视觉架构，不接AI

现在只完成：

```text
VisualType
Composition
StylePreset
```

实现：

### Cover

```text
cover-hero
cover-circle
cover-editorial
cover-photo
cover-minimal
```

### Section

```text
section-photo-stack
section-editorial
section-split
section-minimal
section-full-photo
```

实现/重构：

```text
VisualDesignWorkspace
VisualTemplateSelector
VisualPreview
CoverPosterEditor
SectionCardEditor
```

先使用现有文章数据和现有图片。

**暂时不要接新的AI视觉模型。**
**暂时不要做Storage迁移。**
**暂时不要做自动发布。**

---

# Phase 1 验收

浏览器真实检查：

1. 可以选择Cover/Section；
2. 至少3种构图明显不同；
3. Composition变化会导致布局明显变化；
4. StylePreset变化会导致视觉语言变化；
5. 标题是真实HTML文字；
6. 图片是真实图片；
7. 标题修改实时预览；
8. 图片替换实时预览；
9. 不同模板不能只是换颜色；
10. 无明显布局错乱。

使用“校园旅行/岭南文化”示例时，至少应能做出类似：

- 蓝色校园海报：圆形/半圆构图、地点、日期、大标题、装饰
- 杂志叠图章节页：留白、照片叠放、Part、编号、分割线、大标题

如果最终还是：

```text
白色Card + 一张图 + 一个标题
```

则视为失败。

---

# Phase 2：AI视觉分析

Phase 1通过后再做：

```text
参考图上传
↓
视觉模型
↓
visualType
composition
stylePreset
palette
elements
layoutReason
recommendations
↓
方案A/B/C
```

---

# Phase 3：图片生产

Phase 2通过后：

```text
真实图片
+
文章文字
+
模板
↓
DOM
↓
html2canvas
↓
PNG
↓
article_images
```

实现：

- 导出
- 上传
- 保存article_images
- 设置封面
- 插入正文

---

# Phase 4：文章闭环

完成：

```text
文章
↓
视觉设计
↓
生成封面
↓
生成章节图
↓
绑定Image Slot
↓
微信预览
↓
检查
↓
审核
↓
发布
```

---

# Agent执行规则

严格执行：

```text
Step 1
检查当前视觉模块、主题、TaskDetail、图片和微信预览代码。

Step 2
先告诉我：
- 当前实现
- 需要修改的文件
- 可以复用的文件
- 潜在架构冲突

Step 3
只实现Phase 1。

Step 4
运行项目已有build/lint/test。

Step 5
报告：
- 修改文件
- 新增功能
- build结果
- test结果
- 已知问题

Step 6
停止，不要自动进入Phase 2。
```

禁止：

```text
❌ 继续把视觉设计做成颜色选择器
❌ 只增加几个CSS颜色
❌ 只增加简单Card
❌ AI直接生成带中文文字的最终海报
❌ 重写整个前端
❌ 删除现有文章/审核/微信预览
❌ 一次性重构数据库
❌ Phase 1没完成就进入AI接入
```

---

# 最终产品标准

小编的操作应该接近：

```text
上传文章/素材
↓
AI生成文章
↓
上传照片
↓
上传参考设计图
↓
点击「AI视觉设计」
↓
AI分析视觉风格
↓
出现3个真实设计方案
↓
小编选择
↓
修改标题/照片
↓
生成图片
↓
设置为封面 / 插入正文
↓
微信预览
↓
提交审核
```

核心原则：

> AI负责设计判断；Composition负责构图；StylePreset负责视觉语言；HTML/CSS负责真实排版；html2canvas负责导出。

不要把这个任务理解为“优化视觉页面”，而要理解为：

> **建立一个能够根据文章内容和真实图片生产公众号视觉图片的模板化视觉设计系统。**
