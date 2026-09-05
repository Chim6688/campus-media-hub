<script setup>
// 图片库弹窗（V1.0 Phase 3）：任务全部图片的缩略图网格
// 待选图（正文图未绑定槽位）可「选这张」；任意图可删除；删除后 emit changed 通知父级刷新槽位
import { ref, watch } from 'vue';
import { listImages, deleteImage } from '../api/client.js';

const props = defineProps({ taskId: String, show: Boolean });
const emit = defineEmits(['select', 'close', 'changed']);

const images = ref([]);
const loading = ref(false);
const error = ref('');

// 每次打开都重新拉取（槽位移除/工作台删除后保持同步）
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

async function del(img) {
  error.value = '';
  try {
    await deleteImage(img.id);
    await refresh();
    emit('changed'); // 通知工作台同步槽位（绑定的图被删，槽位应变空）
  } catch (e) {
    error.value = e.message;
  }
}

// 徽标文案：封面 / 第N图 / 待选
function badge(i) {
  if (i.type === 'cover') return '封面';
  return i.position > 0 ? `第${i.position}图` : '待选';
}
// 可选条件：正文图且未绑定（position=0，在池中）
const selectable = (i) => i.type === 'content' && !i.position;
</script>

<template>
  <!-- 自带遮罩样式：嵌套组件无法继承 TaskDetail 的 scoped .modal-mask -->
  <div v-if="show" class="lib-mask" @click.self="emit('close')">
    <div class="lib-modal">
      <p class="lib-title">🖼 图片库（{{ images.length }} 张）</p>
      <p v-if="loading" class="lib-hint">加载中…</p>
      <p v-if="error" class="lib-error">{{ error }}</p>
      <p v-if="!loading && !images.length" class="lib-hint">还没有图片，关闭后点「上传」按钮添加</p>
      <div class="lib-grid">
        <div v-for="img in images" :key="img.id" class="lib-item">
          <img :src="img.url" :alt="img.caption || '图片'" />
          <span class="lib-badge" :class="{ pool: selectable(img) }">{{ badge(img) }}</span>
          <div class="lib-btns">
            <button v-if="selectable(img)" class="primary" type="button" @click="emit('select', img)">选这张</button>
            <button type="button" class="del" @click="del(img)">删除</button>
          </div>
        </div>
      </div>
      <p class="lib-tip">「选这张」仅对未绑定的正文图可用；已绑定的先在配图槽「移除」</p>
      <div class="lib-footer">
        <button type="button" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lib-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.lib-modal { background: #fff; border-radius: 8px; padding: 16px; width: min(680px, 92vw); max-height: 84vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.lib-title { margin: 0; font-size: 15px; font-weight: bold; }
.lib-hint { color: #999; font-size: 13px; margin: 0; }
.lib-error { color: #c0392b; font-size: 13px; margin: 0; }
.lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.lib-item { border: 1px solid #eee; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; align-items: center; }
.lib-item img { width: 100%; height: 90px; object-fit: cover; border-radius: 6px; }
.lib-badge { font-size: 11px; padding: 1px 8px; border-radius: 8px; background: #eee; color: #666; }
.lib-badge.pool { background: #e8f0fe; color: #1a73e8; }
.lib-btns { display: flex; gap: 6px; }
.lib-btns button { padding: 3px 10px; font-size: 12px; }
.lib-btns .primary { background: #1e88e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.lib-btns .del { color: #c0392b; }
.lib-tip { font-size: 12px; color: #999; margin: 0; }
.lib-footer { display: flex; justify-content: flex-end; }
</style>
