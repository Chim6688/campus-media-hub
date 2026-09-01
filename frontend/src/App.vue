<script setup>
import { onMounted, ref } from 'vue';
import { request } from './api/client.js';

const tasks = ref([]);
const error = ref('');
const code = ref(localStorage.getItem('accessCode') || '');
const verified = ref(false);
const theme = ref('');
const author = ref('');

// 校验口令：通过后加载任务列表
async function verify() {
  error.value = '';
  try {
    await request('/api/verify', { method: 'POST', body: JSON.stringify({ code: code.value }) });
    localStorage.setItem('accessCode', code.value);
    verified.value = true;
    await loadTasks();
  } catch (e) {
    error.value = e.message;
  }
}

async function loadTasks() {
  try {
    const data = await request('/api/tasks');
    tasks.value = data.tasks;
  } catch (e) {
    error.value = e.message;
  }
}

// 新建任务（脚手架演示用，后续移入独立表单页）
async function createTask() {
  error.value = '';
  try {
    await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ theme: theme.value, author: author.value }),
    });
    theme.value = '';
    await loadTasks();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(() => {
  if (code.value) verify();
});
</script>

<template>
  <main class="page">
    <h1>推文工作流</h1>

    <!-- 口令门 -->
    <section v-if="!verified" class="gate">
      <p>请输入站点口令</p>
      <input v-model="code" placeholder="站点口令" @keyup.enter="verify" />
      <button @click="verify">进入</button>
    </section>

    <!-- 任务区 -->
    <section v-else>
      <div class="new-task">
        <input v-model="theme" placeholder="推文主题，如：迎新晚会报道" />
        <input v-model="author" placeholder="你的名字" />
        <button @click="createTask">新建任务</button>
      </div>
      <ul class="task-list">
        <li v-for="t in tasks" :key="t.id">
          【{{ t.type }}】{{ t.theme }} — {{ t.author }}（{{ t.status }}）
        </li>
      </ul>
      <p v-if="tasks.length === 0">暂无任务，新建一个吧</p>
    </section>

    <p v-if="error" class="error">{{ error }}</p>
  </main>
</template>

<style scoped>
.page { max-width: 640px; margin: 40px auto; font-family: system-ui, sans-serif; }
.gate input, .new-task input { margin-right: 8px; padding: 6px 10px; }
.task-list li { padding: 8px 0; border-bottom: 1px solid #eee; }
.error { color: #c0392b; }
</style>
