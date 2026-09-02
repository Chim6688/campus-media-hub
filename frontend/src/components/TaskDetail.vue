<script setup>
import { ref, watch } from 'vue';
import { request } from '../api/client.js';

const props = defineProps({ task: Object });
const emit = defineEmits(['back', 'refresh']);

const title = ref(props.task.title || '');
const summary = ref(props.task.summary || '');
const content = ref(props.task.content || '');
const saving = ref(false);
const savedAt = ref('');
const error = ref('');
const aiLoading = ref(''); // 当前进行中的 AI 动作名，用于按钮禁用态
const contentRef = ref(null); // 正文 textarea 引用，用于取选中文字

// 切换任务时重置本地编辑态
watch(() => props.task.id, () => {
  title.value = props.task.title || '';
  summary.value = props.task.summary || '';
  content.value = props.task.content || '';
});

// 保存文稿（防抖由手动触发，MVP 不做自动保存）
async function save() {
  saving.value = true;
  try {
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({
        id: props.task.id,
        title: title.value,
        summary: summary.value,
        content: content.value,
      }),
    });
    savedAt.value = new Date().toLocaleTimeString();
    emit('refresh'); // 同步列表数据
  } finally {
    saving.value = false;
  }
}

// ========== AI 工具条 ==========

// 统一 AI 调用封装
async function callAI(action, payload) {
  aiLoading.value = action;
  try {
    const data = await request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
    return data.text;
  } finally {
    aiLoading.value = '';
  }
}

// 解析初稿：按"标题：/摘要：/正文："结构拆开填入表单
async function generateDraft() {
  error.value = '';
  const notes = prompt('补充要点/素材（可留空）：') || '';
  try {
    const text = await callAI('draft', {
      theme: props.task.theme,
      type: props.task.type,
      notes,
    });
    const titleMatch = text.match(/标题：(.+)/);
    const summaryMatch = text.match(/摘要：(.+)/);
    const bodyMatch = text.match(/正文：\n?([\s\S]+)/);
    if (titleMatch) title.value = titleMatch[1].trim();
    if (summaryMatch) summary.value = summaryMatch[1].trim();
    if (bodyMatch) content.value = bodyMatch[1].trim();
    error.value = 'AI 初稿已生成，请检查后点"保存"';
  } catch (e) {
    error.value = e.message;
  }
}

// 生成 3 个候选标题，弹窗选择
async function generateTitles() {
  error.value = '';
  try {
    const text = await callAI('title', { title: title.value, content: content.value });
    const chosen = prompt(`选择一个标题（输入序号）\n${text}`);
    if (!chosen) return;
    const lines = text.split('\n').filter((l) => l.trim());
    const idx = parseInt(chosen, 10) - 1;
    if (lines[idx]) {
      // 去掉"1. "之类的编号前缀
      title.value = lines[idx].replace(/^\s*\d+[.、]\s*/, '').trim();
    }
  } catch (e) {
    error.value = e.message;
  }
}

// AI 生成摘要
async function generateSummary() {
  error.value = '';
  try {
    summary.value = await callAI('summary', { title: title.value, content: content.value });
  } catch (e) {
    error.value = e.message;
  }
}

// 选中改写：对正文 textarea 当前选中文字执行改写指令
async function rewriteSelection() {
  const el = contentRef.value;
  const selection = el.value.slice(el.selectionStart, el.selectionEnd);
  if (!selection) {
    error.value = '请先在正文中选中要改写的文字';
    return;
  }
  const presets = ['更口语化', '精简一点', '扩写细节', '更有数据感'];
  const input = prompt('改写指令（或输入序号用快捷方向）\n1. 更口语化\n2. 精简一点\n3. 扩写细节\n4. 更有数据感');
  if (!input) return;
  const n = parseInt(input, 10);
  const instruction = n >= 1 && n <= 4 ? presets[n - 1] : input;
  try {
    const newText = await callAI('rewrite', { selection, instruction });
    // 只替换选中段，其余不动；用户可用 Ctrl+Z 撤销（textarea 原生支持）
    const start = el.selectionStart;
    const end = el.selectionEnd;
    content.value = el.value.slice(0, start) + newText + el.value.slice(end);
    error.value = '已改写选中文字（Ctrl+Z 可撤销）';
  } catch (e) {
    error.value = e.message;
  }
}
</script>

<template>
  <section class="detail">
    <button class="back" @click="emit('back')">← 返回列表</button>
    <h2>{{ task.theme }}</h2>

    <label>标题</label>
    <input v-model="title" placeholder="推文标题（可点 AI 生成）" />

    <label>摘要</label>
    <textarea v-model="summary" rows="2" placeholder="公众号推送摘要（可点 AI 生成）"></textarea>

    <label>正文（Markdown）</label>
    <div class="ai-toolbar">
      <button :disabled="!!aiLoading" @click="generateDraft">
        {{ aiLoading === 'draft' ? '生成中…' : 'AI 初稿' }}
      </button>
      <button :disabled="!!aiLoading" @click="generateTitles">
        {{ aiLoading === 'title' ? '生成中…' : 'AI 改标题' }}
      </button>
      <button :disabled="!!aiLoading" @click="generateSummary">
        {{ aiLoading === 'summary' ? '生成中…' : 'AI 摘要' }}
      </button>
      <button :disabled="!!aiLoading" @click="rewriteSelection">
        {{ aiLoading === 'rewrite' ? '改写中…' : '选中改写' }}
      </button>
    </div>
    <textarea ref="contentRef" v-model="content" rows="18" placeholder="正文内容，先选中文字再点「选中改写」"></textarea>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="toolbar">
      <button :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      <span v-if="savedAt" class="saved">已保存 {{ savedAt }}</span>
    </div>
  </section>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: 8px; }
.back { align-self: flex-start; margin-bottom: 8px; }
label { font-size: 13px; color: #666; margin-top: 8px; }
input, textarea { padding: 8px 10px; font-family: inherit; }
textarea { resize: vertical; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.saved { color: #27ae60; font-size: 13px; }
.ai-toolbar { display: flex; gap: 8px; margin-top: 4px; }
.ai-toolbar button { padding: 6px 12px; }
.error { color: #c0392b; white-space: pre-wrap; margin: 0; }
</style>
