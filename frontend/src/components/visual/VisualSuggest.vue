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
