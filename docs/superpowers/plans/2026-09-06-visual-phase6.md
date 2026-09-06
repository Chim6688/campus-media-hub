# V1.0 Phase 6 AI 视觉建议接入视觉卡 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 分析文章 → 推荐封面副标题/标签 + 章节卡文案（Part 标题/副标题/绑定槽位）→ 视觉面板一键预填，小编确认后生成。

**Architecture:** 新增后端 action `visual_suggestions`（纯文本分析，走既有 callLLM 链）；前端清洗纯函数 `normalizeVisualSuggestions` 加入 visual-data.js（建议即视觉卡数据，属同域）；UI 抽独立子组件 VisualSuggest.vue（VisualPanel 已 166 行，近 200 行红线，不内联）；建议应用 = 纯预填（coverData/cardData/cardSlot 局部编辑态），不自动生成——AI 只建议，小编决策（原方案 §24 原则）。

**Tech Stack:** 既有文本 AI 链（callLLM）、Vue 3、node --test。

**Spec:** 原方案 §24（AI 图片建议）+ §29 Phase 6（推荐封面 + 推荐章节卡 + 推荐配图位置——配图位置已在配图步实现，本批补前两者）

## 核心事实（代码核验结论）

- 配图位置的 AI 建议已存在（ImageWorkspace aiSuggest + image_suggestions prompt + normalizeSuggestions），本批不动
- VisualPanel props 现为 `{ taskId, title, summary, material, themeId, themeOverrides, boundImages }`——**缺 content**，AI 分析需文章正文，需 TaskDetail 补传
- VisualPanel 166 行（红线 200），建议 UI 必须抽子组件
- 后端 ai.mjs 无需改（PROMPTS 动态路由，新增 action 自动生效）
- AI 输出清洗模式参照 vision-skin.js / images.js normalizeSuggestions（容错、白名单、不抛异常）

## Global Constraints

- **零回归**：既有 75 测试全绿；ImageWorkspace 的 image_suggestions 链路不动
- AI 只建议：应用必须经小编点击（预填编辑态，不触发生成、不自动保存）
- normalizeVisualSuggestions 对任意脏输入返回安全空结构，绝不抛异常
- 建议数量上限：coverTags ≤3（各 ≤8 字）、sectionCards ≤3、subtitle ≤16 字（模板截断上限对齐）
- VisualPanel 加子组件后仍 <200 行；组件中文注释；同文件多编辑串行
- 测试 `npm test`（frontend/）；PowerShell（无 &&，git -m 直传）

---

### Task 1: normalizeVisualSuggestions 建议清洗纯函数（TDD）

**Files:**
- Modify: `frontend/src/utils/visual-data.js`（末尾追加）
- Test: `frontend/tests/visual-data.test.mjs`（末尾追加）

**Interfaces:**
- Produces: `normalizeVisualSuggestions(raw) : { coverSubtitle: string, coverTags: string[], sectionCards: [{ partNum: number, title: string, subtitle: string, slot: number }] }`——sectionCards 按 partNum 升序；脏输入返回全空结构

- [ ] **Step 1: 在 frontend/tests/visual-data.test.mjs 末尾追加失败测试**

```js
// ===== AI 视觉建议清洗（V1.0 Phase 6）：AI 输出不可信，白名单+截断是防线 =====
import { normalizeVisualSuggestions } from '../src/utils/visual-data.js';

const GOOD_SUGGEST = {
  coverSubtitle: '山海青春 挺膺担当',
  coverTags: ['三下乡', '文旅调研', '青春担当'],
  sectionCards: [
    { partNum: 1, title: '旧址参观学党史', subtitle: '追溯红色足迹', slot: 1 },
    { partNum: 2, title: '田间调研话振兴', subtitle: '把论文写在大地', slot: 2 },
  ],
};

test('normalizeVisualSuggestions：合法建议原样通过（排序）', () => {
  const r = normalizeVisualSuggestions(GOOD_SUGGEST);
  assert.equal(r.coverSubtitle, '山海青春 挺膺担当');
  assert.deepEqual(r.coverTags, ['三下乡', '文旅调研', '青春担当']);
  assert.equal(r.sectionCards.length, 2);
  assert.equal(r.sectionCards[0].partNum, 1);
  assert.equal(r.sectionCards[1].slot, 2);
});

test('normalizeVisualSuggestions：超限截断（tags>3、tag>8字、subtitle>16字）', () => {
  const r = normalizeVisualSuggestions({
    coverSubtitle: 'a'.repeat(30),
    coverTags: ['一二三四五六七八九', 'ok', '第三个', '第四个'],
    sectionCards: [{ partNum: 1, title: '标题', subtitle: 'b'.repeat(20), slot: 1 }],
  });
  assert.equal(r.coverTags.length, 3, 'tags 最多 3 个');
  assert.equal(r.coverTags[0].length, 8, '单个 tag 最多 8 字');
  assert.equal(r.coverSubtitle.length, 30, 'coverSubtitle 上限 30 字');
  assert.ok(r.sectionCards[0].subtitle.length <= 16, '章节卡 subtitle ≤16 字');
});

test('normalizeVisualSuggestions：脏数据容错（不抛异常、字段兜底）', () => {
  // partNum 缺省按序号、slot 非法回 1、title 空的条目丢弃、cards 超 3 截断
  const r = normalizeVisualSuggestions({
    sectionCards: [
      { title: '有效卡' },
      { title: '', subtitle: '无标题卡应丢弃' },
      { partNum: 'x', title: '二', slot: -5 },
      { partNum: 9, title: '三' },
      { partNum: 10, title: '四' },
    ],
  });
  assert.equal(r.sectionCards.length, 3, '最多 3 张且丢弃无标题卡');
  assert.equal(r.sectionCards[0].partNum, 1, 'partNum 缺省补序号');
  assert.equal(r.sectionCards[0].slot, 1, 'slot 非法回 1');
  assert.ok(r.sectionCards[0].title === '有效卡');
});

test('normalizeVisualSuggestions：非对象/null/数组输入返回全空结构', () => {
  for (const bad of [null, undefined, 'x', [], 123]) {
    const r = normalizeVisualSuggestions(bad);
    assert.equal(r.coverSubtitle, '');
    assert.deepEqual(r.coverTags, []);
    assert.deepEqual(r.sectionCards, []);
  }
});

test('normalizeVisualSuggestions：coverTags 非数组/含非字符串容错', () => {
  const r = normalizeVisualSuggestions({ coverTags: '不是数组', sectionCards: [{ title: 't' }] });
  assert.deepEqual(r.coverTags, []);
  const r2 = normalizeVisualSuggestions({ coverTags: [1, '有效', null, ''] });
  assert.deepEqual(r2.coverTags, ['有效'], '只留非空字符串项');
});
```

注意：测试文件顶部已有 `import { buildCoverData, ... } from '../src/utils/visual-data.js';`——新增 import 行放追加块顶部（同模块二次 import 合法，node --test 无 lint 报错；更稳妥做法：把新函数并入既有 import 语句，执行者二选一，推荐后者）。

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL —— normalizeVisualSuggestions 不是 visual-data.js 的导出

- [ ] **Step 3: 实现（visual-data.js 末尾追加）**

```js
// ===== AI 视觉建议（V1.0 Phase 6）：文章分析 → 封面/章节卡文案建议清洗 =====

// 建议清洗：AI 输出 → 安全的视觉卡预填结构（白名单字段+数量/长度上限）
// 脏输入一律返回全空结构（调用方据空结构提示"未给出建议"），绝不抛异常
export function normalizeVisualSuggestions(raw) {
  const empty = { coverSubtitle: '', coverTags: [], sectionCards: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  // 封面副标题：字符串截断 30 字（模板 subtitle 上限 20 字渲染再截，此处防超长脏数据）
  const coverSubtitle = typeof raw.coverSubtitle === 'string' ? raw.coverSubtitle.trim().slice(0, 30) : '';
  // 封面标签：只留非空字符串项，各截 8 字，最多 3 个（模板 tagPills 上限对齐）
  const coverTags = (Array.isArray(raw.coverTags) ? raw.coverTags : [])
    .filter((t) => typeof t === 'string' && t.trim())
    .map((t) => t.trim().slice(0, 8))
    .slice(0, 3);
  // 章节卡：title 非空才保留；partNum 缺省按序号补、slot 非法回 1；最多 3 张、按 partNum 升序
  const cards = (Array.isArray(raw.sectionCards) ? raw.sectionCards : [])
    .filter((c) => c && typeof c === 'object' && typeof c.title === 'string' && c.title.trim())
    .slice(0, 3)
    .map((c, i) => ({
      partNum: Number.isInteger(c.partNum) && c.partNum >= 1 ? c.partNum : i + 1,
      title: c.title.trim().slice(0, 18), // 模板章节卡标题截断上限对齐
      subtitle: typeof c.subtitle === 'string' ? c.subtitle.trim().slice(0, 16) : '',
      slot: Number.isInteger(c.slot) && c.slot >= 1 ? c.slot : 1,
    }))
    .sort((a, b) => a.partNum - b.partNum);
  return { coverSubtitle, coverTags, sectionCards: cards };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（80 个全绿：75 既有 + 5 新增）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/utils/visual-data.js frontend/tests/visual-data.test.mjs
git commit -m "feat(visual): normalizeVisualSuggestions 建议清洗纯函数（Phase 6 Task 1）"
```

---

### Task 2: 后端 visual_suggestions prompt

**Files:**
- Modify: `backend/functions/lib/prompts.mjs`

**Interfaces:**
- Consumes: 既有 callLLM（ai.mjs 动态路由，无需改）
- Produces: `POST /api/ai {action:'visual_suggestions', payload:{title, summary, content, material}}` → `{text}`（JSON 字符串，契约同 normalizeVisualSuggestions 输入）

- [ ] **Step 1: prompts.mjs 的 image_suggestions 条目后新增**

```js
  // AI 视觉卡建议（V1.0 Phase 6，§24/Phase 6）：分析文章 → 封面副标题/标签 + 章节卡文案；前端 normalizeVisualSuggestions 清洗
  visual_suggestions: (p) => [
    { role: 'system', content: '你是公众号视觉设计顾问，擅长从文章内容提炼适合海报呈现的短文案。' },
    {
      role: 'user',
      content: `分析以下推文，为视觉模板（封面海报 + 章节卡）推荐文案。
标题：${p.title || '（无）'}
摘要：${p.summary || '（无）'}
正文：${(p.content || '').slice(0, 1500)}
素材亮点：${JSON.stringify(p.material?.highlights || []) || '（无）'}

输出一个 JSON 对象，包含三部分：
1. coverSubtitle：封面副标题建议，一句话（15 字内，比摘要更精炼有力，适合海报大字）
2. coverTags：封面标签建议，2-3 个短词数组（各 4-6 字，如"三下乡""青春担当"）
3. sectionCards：章节卡建议数组（1-3 张），每张含：
   - partNum：Part 序号（正整数，从 1 开始）
   - title：章节标题（3-10 字，概括文章一个篇章，如"旧址参观学党史"）
   - subtitle：章节副标题（10 字内，补充意境）
   - slot：建议绑定的正文图位（正整数，按文章段落顺序）

要求：文案从正文实际内容提炼，不编造；章节卡标题彼此不重复。
严格按 JSON 输出，不要任何其他文字，不要 markdown 代码块包裹，如：
{"coverSubtitle":"...","coverTags":["...","..."],"sectionCards":[{"partNum":1,"title":"...","subtitle":"...","slot":1}]}`,
    },
  ],
```

- [ ] **Step 2: 语法验证**

Run: `node --check backend/functions/lib/prompts.mjs`
Expected: 静默通过

- [ ] **Step 3: 提交**

```bash
git add backend/functions/lib/prompts.mjs
git commit -m "feat(visual): visual_suggestions 视觉卡文案建议 prompt（Phase 6 Task 2）"
```

---

### Task 3: VisualSuggest.vue 子组件 + VisualPanel/TaskDetail 接线

**Files:**
- Create: `frontend/src/components/visual/VisualSuggest.vue`
- Modify: `frontend/src/components/visual/VisualPanel.vue`（+content prop、引入建议区、应用处理器）
- Modify: `frontend/src/components/TaskDetail.vue`（视觉步传 content）

**Interfaces:**
- Consumes:
  - `normalizeVisualSuggestions(raw)`（Task 1）
  - `request('/api/ai')`（client.js 既有）
  - `POST /api/ai action='visual_suggestions'`（Task 2）
- Produces:
  - VisualSuggest props：`{ title: String, summary: String, content: String, material: Object }`；emits：`apply-cover({ subtitle, tags })`、`apply-card({ partNum, title, subtitle, slot })`
  - VisualPanel 新 prop：`content: String`（透传给 VisualSuggest）
  - TaskDetail：视觉步 `<VisualPanel ... :content="content" />`

- [ ] **Step 1: 创建 VisualSuggest.vue**

```vue
<script setup>
// AI 视觉建议（V1.0 Phase 6）：分析文章 → 封面/章节卡文案建议 → 小编点「应用」预填
// AI 只建议不代决策：应用事件抛给 VisualPanel 写入编辑态，不触发生成/保存
import { reactive } from 'vue';
import { request } from '../../api/client.js';
import { normalizeVisualSuggestions } from '../../utils/visual-data.js';

const props = defineProps({ title: String, summary: String, content: String, material: Object });
const emit = defineEmits(['apply-cover', 'apply-card']);

const state = reactive({ loading: false, error: '', done: false, coverSubtitle: '', coverTags: [], sectionCards: [] });

// 分析文章 → 建议结构（normalizeVisualSuggestions 白名单清洗，空结果提示手改）
async function analyze() {
  state.loading = true;
  state.error = '';
  try {
    const data = await request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({
        action: 'visual_suggestions',
        payload: { title: props.title, summary: props.summary, content: props.content, material: props.material },
      }),
    });
    const clean = data.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const r = normalizeVisualSuggestions(JSON.parse(clean));
    if (!r.coverSubtitle && !r.coverTags.length && !r.sectionCards.length) {
      state.error = 'AI 未给出有效建议，可直接在预览卡旁手动编辑文案';
      return;
    }
    state.coverSubtitle = r.coverSubtitle;
    state.coverTags = r.coverTags;
    state.sectionCards = r.sectionCards;
    state.done = true;
  } catch (e) {
    state.error = 'AI 分析失败，请重试或手动编辑：' + e.message;
  } finally {
    state.loading = false;
  }
}

// 应用封面建议：副标题 + 标签一起预填
function applyCover() {
  emit('apply-cover', { subtitle: state.coverSubtitle, tags: [...state.coverTags] });
}
// 应用单张章节卡建议：文案 + 槽位一起预填
function applyCard(c) {
  emit('apply-card', { partNum: c.partNum, title: c.title, subtitle: c.subtitle, slot: c.slot });
}
</script>
<template>
  <div class="v-suggest">
    <div class="row">
      <button type="button" class="ai-btn" :disabled="state.loading || !content" @click="analyze">
        {{ state.loading ? '分析中…' : '✨ AI 视觉建议' }}
      </button>
      <span v-if="!content" class="hint">先在第②步写稿后再用 AI 建议</span>
    </div>
    <p v-if="state.error" class="error">{{ state.error }}</p>

    <template v-if="state.done">
      <!-- 封面建议：副标题 + 标签 -->
      <div v-if="state.coverSubtitle || state.coverTags.length" class="sug-card">
        <p class="sug-title">封面文案建议</p>
        <p v-if="state.coverSubtitle" class="sug-main">副标题：{{ state.coverSubtitle }}</p>
        <p v-if="state.coverTags.length" class="sug-main">标签：{{ state.coverTags.join(' / ') }}</p>
        <button type="button" class="apply-btn" @click="applyCover">应用到封面</button>
      </div>
      <!-- 章节卡建议：每张独立应用 -->
      <div v-for="c in state.sectionCards" :key="c.partNum" class="sug-card">
        <p class="sug-title">Part {{ c.partNum }} 章节卡建议</p>
        <p class="sug-main">标题：{{ c.title }}<template v-if="c.subtitle"> · {{ c.subtitle }}</template></p>
        <p class="sug-sub">建议绑定正文图 {{ c.slot }}</p>
        <button type="button" class="apply-btn" @click="applyCard(c)">应用到章节卡</button>
      </div>
    </template>
  </div>
</template>
<style scoped>
.v-suggest { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; }
.ai-btn { padding: 5px 14px; border: 1px solid #1a1a1a; border-radius: 14px; background: #fff; cursor: pointer; }
.ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.hint { font-size: 12px; color: #999; }
.error { color: #e74c3c; font-size: 13px; margin: 0; }
.sug-card { border: 1px dashed #bbb; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.sug-title { margin: 0; font-size: 12px; color: #999; }
.sug-main { margin: 0; font-size: 13px; color: #333; }
.sug-sub { margin: 0; font-size: 12px; color: #999; }
.apply-btn { align-self: flex-start; padding: 3px 12px; border: 1px solid #27ae60; color: #27ae60; border-radius: 12px; background: #fff; cursor: pointer; }
</style>
```

- [ ] **Step 2: VisualPanel.vue 四处修改（串行）**

**2a. props 加 content：**

```js
const props = defineProps({
  taskId: String, title: String, summary: String, content: String, material: Object,
  themeId: String, themeOverrides: Object, boundImages: { type: Array, default: () => [] },
});
```

**2b. import 区加：**

```js
import VisualSuggest from './VisualSuggest.vue'; // AI 视觉建议（Phase 6）
```

**2c. 建议应用处理器（onPick 函数后加）：**

```js
// —— AI 建议应用（Phase 6）：预填编辑态（小编确认后手动点生成，AI 不代决策）——
function onApplyCover({ subtitle, tags }) {
  if (subtitle) coverData.subtitle = subtitle;
  if (tags.length) coverData.tags = tags;
}
function onApplyCard(c) {
  cardData.partNum = c.partNum;
  cardData.title = c.title;
  if (c.subtitle) cardData.subtitle = c.subtitle;
  cardSlot.value = c.slot;
}
```

**2d. 模板：`<VisualTemplateSelector>` 之后插入建议区：**

```vue
    <!-- AI 视觉建议（Phase 6）：分析文章 → 一键预填封面/章节卡文案 -->
    <VisualSuggest :title="title" :summary="summary" :content="content" :material="material"
      @apply-cover="onApplyCover" @apply-card="onApplyCard" />
```

- [ ] **Step 3: TaskDetail.vue 视觉步传 content（一处）**

视觉步 `<VisualPanel :task-id="task.id" :title="title" :summary="summary" ...` 标签加 `:content="content"`。

- [ ] **Step 4: 验证**

1. frontend/ `npm test`：80 全绿
2. frontend/ `npm run build`：成功
3. 行数复核：VisualPanel.vue 加完后仍 <200 行（约 195）；VisualSuggest <150 行

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/visual/VisualSuggest.vue frontend/src/components/visual/VisualPanel.vue frontend/src/components/TaskDetail.vue
git commit -m "feat(visual): VisualSuggest AI 视觉建议子组件 + 一键预填封面/章节卡（Phase 6 Task 3）"
```

---

### Task 4: 真机验证 + 收尾汇报

**Files:** 无新文件

- [ ] **Step 1: 联调环境**：根目录后台 `node dev-server.mjs` + frontend/ 后台 `npm run dev`

- [ ] **Step 2: Playwright 真机验证**

1. 任务视觉步：「✨ AI 视觉建议」按钮出现；无正文任务按钮禁用（hint 提示先写稿）
2. 点击分析（真实 AI 调用）：建议卡渲染（封面文案 + 1-3 张章节卡，各带应用按钮）
3. 「应用到封面」：封面预览副标题/标签变化
4. 「应用到章节卡」：章节卡预览标题/副标题变化、槽位输入框变建议值
5. 应用后手动点「生成并设为封面」仍走 Phase 3+4 链路（建议只是预填）
6. AI 失败路径：断网/坏 JSON → 错误提示，页面不崩
7. 控制台零错误

- [ ] **Step 3: 全量回归**：`npm test` 80 全绿 + `npm run build` 成功

- [ ] **Step 4: 停服务、清理临时产物、汇报（§35 格式，暂停等验收）**

---

## Self-Review 记录

- **Spec 覆盖**：原方案 §24 输入契约（title/summary/content/material）→ Task 2 prompt；"AI 只推荐哪里需要图/什么类型，最终由小编选择"→ 应用=预填+手动生成；§29 Phase 6"推荐封面+推荐章节卡"→ Task 1/3（推荐配图位置已存在于配图步，不重复实现）。
- **占位符扫描**：无 TBD；后端无单测已注明（动态路由无分支逻辑，真机验证）。
- **类型一致性**：`normalizeVisualSuggestions` 产出的 sectionCards 元素 `{partNum,title,subtitle,slot}` = VisualSuggest applyCard 事件负载 = VisualPanel onApplyCard 参数；`apply-cover({subtitle,tags})` 两端一致；VisualPanel content prop = TaskDetail content ref 透传 = VisualSuggest props。
