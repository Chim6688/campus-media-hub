// 模板画廊纯函数：全部皮肤渲染同一篇示例文章（供画廊弹窗网格展示，一眼看全效果）
import { THEMES } from './themes.js';
import { markdownToWechatHTML } from './wechat-format.js';

// 示例文章：刻意覆盖全部组件类型（标题卡/引言卡/信息胶囊/正文卡/配图占位/子标题/金句/落款）
export const GALLERY_SAMPLE = `# 社团直击｜示例文章标题
> 示例开头引言：一句话概括活动亮点与氛围。
## 核心信息
- 时间：9月10日 19:00
- 地点：大学生活动中心
## 活动介绍
正文示例段落，用于展示当前皮肤下卡片的底色、描边、圆角与字号实际效果。
[配图：开场全景]
### 精彩瞬间
> 中段金句示例：青春在这里发光。
责编 | 示例署名`;

// 生成画廊卡片：每套皮肤一条 {id, label, html}，html 为完整渲染结果
export function buildGallery() {
  return Object.values(THEMES).map((t) => ({
    id: t.id,
    label: t.label,
    html: markdownToWechatHTML(GALLERY_SAMPLE, t.id, {}),
  }));
}
