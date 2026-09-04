<script setup>
import { ref, computed } from 'vue';
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

// ========== 筛选（P1-5：状态 Tab + 类型下拉 + 关键词，纯前端过滤） ==========
const statusFilter = ref('all');
const typeFilter = ref('all');
const keyword = ref('');
// 类型下拉选项：从现有任务里去重提取，避免硬编码
const allTypes = computed(() => [...new Set((props.tasks || []).map((t) => t.type).filter(Boolean))]);
// 三重过滤：状态 + 类型 + 关键词（匹配主题/标题/署名，不区分大小写）
const filteredTasks = computed(() =>
  (props.tasks || []).filter((t) =>
    (statusFilter.value === 'all' || t.status === statusFilter.value) &&
    (typeFilter.value === 'all' || t.type === typeFilter.value) &&
    (!keyword.value.trim() ||
      `${t.theme} ${t.title || ''} ${t.author}`.toLowerCase().includes(keyword.value.trim().toLowerCase())),
  ),
);

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
// P2-6：一键复用已发布任务（素材+排版主题继承，成稿清空），成功后直接进入新任务编辑
async function reuseTask(t) {
  error.value = '';
  try {
    const data = await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ copyFrom: t.id }),
    });
    emit('refresh');
    emit('open', data.task); // 直接跳进新任务详情页
  } catch (e) {
    error.value = e.message;
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
    <!-- 筛选区：状态 Tab + 类型下拉 + 关键词搜索（纯前端过滤，不改后端参数） -->
    <div class="filters">
      <div class="status-tabs">
        <button v-for="s in [['all','全部'],['writing','写稿中'],['reviewing','审核中'],['published','已发布']]"
          :key="s[0]" :class="{ on: statusFilter === s[0] }" @click="statusFilter = s[0]">{{ s[1] }}</button>
      </div>
      <select v-model="typeFilter">
        <option value="all">全部类型</option>
        <option v-for="t in allTypes" :key="t" :value="t">{{ t }}</option>
      </select>
      <input v-model="keyword" placeholder="🔍 搜索主题/标题/署名" />
    </div>
    <ul class="task-list">
      <li v-for="t in filteredTasks" :key="t.id" @click="emit('open', t)">
        <span class="title">【{{ t.type }}】{{ t.theme }}</span>
        <span class="meta">{{ t.author }} · {{ STATUS_TEXT[t.status] || t.status }}</span>
        <button v-if="t.status !== 'published'" class="advance" @click.stop="advance(t)">
          推进 →
        </button>
        <!-- 已发布任务：一键复用为新任务（同主题同类型快速再产出） -->
        <button v-if="t.status === 'published'" class="reuse" @click.stop="reuseTask(t)">
          ♻️ 复用为新任务
        </button>
      </li>
    </ul>
    <!-- 空态区分：列表本身为空 vs 筛选条件无命中 -->
    <p v-if="filteredTasks.length === 0" class="empty">
      {{ tasks.length ? '没有匹配的任务' : '暂无任务，新建一个吧' }}
    </p>
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
.reuse { padding: 4px 10px; font-size: 12px; }
.error { color: #c0392b; white-space: pre-wrap; }
.empty { color: #999; }
/* 筛选区：状态 Tab 胶囊 + 类型下拉 + 关键词搜索（P1-5） */
.filters { display: flex; gap: 8px; align-items: center; margin: 12px 0; flex-wrap: wrap; }
.status-tabs { display: flex; gap: 4px; }
.status-tabs button { padding: 4px 12px; border: 1px solid #e0e0e0; background: #fff; border-radius: 14px; font-size: 13px; cursor: pointer; }
.status-tabs button.on { background: #1a73e8; color: #fff; border-color: #1a73e8; }
.filters select, .filters input { padding: 5px 10px; font-size: 13px; }
/* 移动端（C 批）：新建表单与列表行换行，防 375px 横向溢出 */
@media (max-width: 768px) {
  .new-task { flex-wrap: wrap; }
  .new-task input, .new-task select { min-width: 140px; } /* 换行后控件不被压扁 */
  .new-task button { flex: 1; } /* 按钮独占行尾，方便点按 */
  .task-list li { flex-wrap: wrap; } /* 长标题占满首行，meta+按钮自然落到次行 */
}
</style>
