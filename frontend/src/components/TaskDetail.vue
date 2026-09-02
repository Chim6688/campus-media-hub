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
    <textarea v-model="content" rows="18" placeholder="正文内容，支持选中文字后 AI 改写"></textarea>

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
</style>
