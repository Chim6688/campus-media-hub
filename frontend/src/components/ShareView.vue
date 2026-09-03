<script setup>
// 只读分享视图：审核人通过 /share/:token 查看（免口令、不可编辑）
import { ref, computed, onMounted } from 'vue';
import { request } from '../api/client.js';
import { markdownToWechatHTML } from '../utils/wechat-format.js';

const props = defineProps({ token: String });

const task = ref(null);
const loading = ref(true);
const error = ref('');

// 只读渲染：默认绿粉皮肤（审核人看到与作者一致的排版效果）
const html = computed(() =>
  markdownToWechatHTML(task.value?.content || '', 'greenPink', {
    title: task.value?.title,
    eyebrow: task.value?.type,
  }),
);

onMounted(async () => {
  try {
    const data = await request(`/api/share?token=${encodeURIComponent(props.token)}`);
    task.value = data.task;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="share-view">
    <p v-if="loading" class="hint">加载中…</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <template v-else>
      <!-- 渲染排版效果（与作者编辑页预览一致） -->
      <div class="article" v-html="html"></div>
      <!-- 整改清单进度（只读展示，老师可看到整改情况；插值渲染无 XSS 风险） -->
      <div v-if="task.review_checklist?.length" class="checklist">
        <h3>整改清单（{{ task.review_checklist.filter((i) => i.done).length }}/{{ task.review_checklist.length }} 已完成）</h3>
        <ul>
          <li v-for="item in task.review_checklist" :key="item.id" :class="{ done: item.done }">
            {{ item.done ? '☑' : '☐' }} {{ item.text }}
          </li>
        </ul>
      </div>
      <p class="meta">作者：{{ task.author }} · 审阅请通过微信联系作者</p>
    </template>
  </section>
</template>

<style scoped>
.share-view { display: flex; flex-direction: column; gap: 16px; }
.hint { color: #666; }
.hint.error { color: #c0392b; }
.article { border-radius: 8px; overflow: hidden; }
.meta { color: #999; font-size: 13px; text-align: center; }
/* 整改清单进度（只读）：与作者端清单区同风格 */
.checklist { border: 1px solid #e6d9c8; border-radius: 8px; padding: 10px 14px; background: #fdf9f2; }
.checklist h3 { margin: 0 0 8px; font-size: 14px; }
.checklist ul { list-style: none; padding: 0; margin: 0; }
.checklist li { padding: 4px 0; font-size: 14px; }
.checklist li.done { color: #999; text-decoration: line-through; }
</style>
