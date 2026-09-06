<script setup>
// 视觉图片选择弹窗（Phase 3+4）：从任务图片库选真实图进视觉卡
// 与 ImageLibrary 的差异：这里所有图可选（视觉卡引用 URL 不改变绑定关系）
import { ref, watch } from 'vue';
import { listImages } from '../../api/client.js';

const props = defineProps({ taskId: String, show: Boolean });
const emit = defineEmits(['select', 'close']);

const images = ref([]);
const loading = ref(false);
const error = ref('');

// 每次打开重拉（上传/删除后保持同步）
watch(() => props.show, (v) => { if (v) refresh(); });

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listImages(props.taskId);
    images.value = data.images;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <div v-if="show" class="picker-mask" @click.self="emit('close')">
    <div class="picker-modal">
      <p class="picker-title">选择视觉卡图片</p>
      <p v-if="loading" class="picker-hint">加载中…</p>
      <p v-if="error" class="picker-error">{{ error }}</p>
      <p v-if="!loading && !images.length" class="picker-hint">图片库为空：先去「配图」步骤上传图片</p>
      <div class="picker-grid">
        <div v-for="img in images" :key="img.id" class="picker-item" @click="emit('select', img)">
          <img :src="img.url" :alt="img.caption || '图片'" />
        </div>
      </div>
      <div class="picker-footer">
        <button type="button" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.picker-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.picker-modal { background: #fff; border-radius: 8px; padding: 16px; width: min(640px, 92vw); max-height: 84vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.picker-title { margin: 0; font-size: 15px; font-weight: bold; }
.picker-hint, .picker-error { font-size: 13px; margin: 0; color: #999; }
.picker-error { color: #e74c3c; }
.picker-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.picker-item { border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; cursor: pointer; }
.picker-item:hover { border-color: #1a1a1a; }
.picker-item img { width: 100%; height: 90px; object-fit: cover; display: block; }
.picker-footer { display: flex; justify-content: flex-end; }
</style>
