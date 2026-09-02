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
</style>
