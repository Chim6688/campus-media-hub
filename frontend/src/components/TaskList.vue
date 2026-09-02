<script setup>
import { ref } from 'vue';
import { request } from '../api/client.js';

const props = defineProps({ tasks: Array });
const emit = defineEmits(['open', 'refresh']);

const theme = ref('');
const author = ref(localStorage.getItem('authorName') || '');
const type = ref('活动报道');
const error = ref('');

const STATUS_TEXT = {
  writing: '写稿中', reviewing: '审核中', published: '已发布',
};

// 新建任务：成功后记住署名，刷新列表并直接进入详情编辑
async function createTask() {
  error.value = '';
  if (!theme.value || !author.value) {
    error.value = '主题和署名必填';
    return;
  }
  try {
    const data = await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ theme: theme.value, type: type.value, author: author.value }),
    });
    localStorage.setItem('authorName', author.value);
    theme.value = '';
    emit('refresh');
    emit('open', data.task); // 创建成功直接跳转详情页
  } catch (e) {
    error.value = e.message;
  }
}

// 状态推进：相邻状态依次前进，由后端校验合法性（三态：writing→reviewing→published）
async function advance(t) {
  const flow = ['writing', 'reviewing', 'published'];
  const next = flow[flow.indexOf(t.status) + 1];
  error.value = '';
  try {
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: t.id, status: next }),
    });
    emit('refresh');
  } catch (e) {
    // 规范检查不通过时展示完整整改清单（必须项+建议项）
    if (e.detail?.report) {
      const errs = e.detail.report.errors.map((i) => `【必须】${i.message} —— ${i.hint}`);
      const warns = e.detail.report.warnings.map((i) => `【建议】${i.message} —— ${i.hint}`);
      error.value = [e.message, '', ...errs, ...warns].join('\n');
    } else {
      error.value = e.message;
    }
  }
}
</script>

<template>
  <section>
    <div class="new-task">
      <input v-model="theme" placeholder="推文主题，如：迎新晚会报道" />
      <select v-model="type">
        <option>活动报道</option>
        <option>通知公告</option>
        <option>人物专访</option>
      </select>
      <input v-model="author" placeholder="你的名字" />
      <button @click="createTask">新建任务</button>
    </div>
    <ul class="task-list">
      <li v-for="t in tasks" :key="t.id" @click="emit('open', t)">
        <span class="title">【{{ t.type }}】{{ t.theme }}</span>
        <span class="meta">{{ t.author }} · {{ STATUS_TEXT[t.status] || t.status }}</span>
        <button v-if="t.status !== 'published'" class="advance" @click.stop="advance(t)">
          推进 →
        </button>
      </li>
    </ul>
    <p v-if="tasks.length === 0" class="empty">暂无任务，新建一个吧</p>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.new-task { display: flex; gap: 8px; margin-bottom: 16px; }
.new-task input, .new-task select { padding: 6px 10px; flex: 1; }
.task-list { list-style: none; padding: 0; }
.task-list li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #eee; cursor: pointer; }
.task-list .title { flex: 1; }
.task-list .meta { color: #888; font-size: 13px; }
.advance { padding: 4px 10px; }
.error { color: #c0392b; white-space: pre-wrap; }
.empty { color: #999; }
</style>
