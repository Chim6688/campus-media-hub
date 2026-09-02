<script setup>
import { onMounted, ref } from 'vue';
import { request } from './api/client.js';
import TaskList from './components/TaskList.vue';
import TaskDetail from './components/TaskDetail.vue';

const tasks = ref([]);
const error = ref('');
const code = ref(localStorage.getItem('accessCode') || '');
const verified = ref(false);
const currentTask = ref(null); // null = 列表视图，非 null = 详情视图

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
    // 详情视图打开时同步最新数据（不覆盖正在编辑的表单，仅更新列表缓存）
    if (currentTask.value) {
      const fresh = data.tasks.find((t) => t.id === currentTask.value.id);
      if (fresh) currentTask.value = { ...currentTask.value, ...fresh };
    }
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

    <section v-if="!verified" class="gate">
      <p>请输入站点口令</p>
      <input v-model="code" placeholder="站点口令" @keyup.enter="verify" />
      <button @click="verify">进入</button>
    </section>

    <template v-else>
      <TaskList
        v-if="!currentTask"
        :tasks="tasks"
        @open="currentTask = $event"
        @refresh="loadTasks"
      />
      <TaskDetail
        v-else
        :task="currentTask"
        @back="currentTask = null"
        @refresh="loadTasks"
      />
    </template>

    <p v-if="error" class="error">{{ error }}</p>
  </main>
</template>

<style scoped>
.page { max-width: 720px; margin: 40px auto; font-family: system-ui, sans-serif; padding: 0 16px; }
.gate input { margin-right: 8px; padding: 6px 10px; }
.error { color: #c0392b; }
</style>
