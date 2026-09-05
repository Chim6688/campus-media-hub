<script setup>
// 图片上传组件（V1.0 Phase 3）：单/多选上传，客户端 MIME+大小预检（与后端规则一致）
// 所有上传统一 position=0 入图片库；槽位绑定由父级（工作台）PATCH position 完成
import { ref } from 'vue';
import { uploadImage } from '../api/client.js';

const props = defineProps({
  taskId: String,
  type: { type: String, default: 'content' }, // cover=封面 content=正文图
  multiple: { type: Boolean, default: false },
  label: { type: String, default: '📷 上传图片' },
});
const emit = defineEmits(['uploaded']);

const fileRef = ref(null);
const status = ref(''); // 上传中状态文案（也用作禁用态）
const error = ref('');
const done = ref(''); // 完成提示（短暂展示）

// 与后端 image-rules.mjs 同步的白名单与上限（svg 有脚本注入风险，排除）
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024;

// 逐张上传：一张失败不影响其余，全部结束后汇总提示
async function onChange(e) {
  const files = [...(e.target.files || [])];
  e.target.value = ''; // 允许重复选择同一文件
  if (!files.length) return;
  error.value = '';
  done.value = '';
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    status.value = files.length > 1 ? `上传中 ${i + 1}/${files.length}…` : '上传中…';
    if (!ALLOWED.includes(f.type)) {
      error.value = `${f.name}：不支持的类型（仅 JPG/PNG/WebP/GIF）`;
      continue;
    }
    if (f.size > MAX_SIZE) {
      error.value = `${f.name}：超过 5MB 上限`;
      continue;
    }
    try {
      const { image } = await uploadImage(f, { taskId: props.taskId, type: props.type });
      ok++;
      emit('uploaded', image);
    } catch (err) {
      error.value = `${f.name}：${err.message}`;
    }
  }
  status.value = '';
  if (ok) done.value = `已上传 ${ok} 张`;
  setTimeout(() => (done.value = ''), 3000);
}
</script>

<template>
  <span class="img-uploader">
    <button type="button" :disabled="!!status" @click="fileRef.click()">{{ status || label }}</button>
    <input ref="fileRef" type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif"
      :multiple="multiple" @change="onChange" />
    <span v-if="error" class="up-error">{{ error }}</span>
    <span v-else-if="done" class="up-done">{{ done }}</span>
  </span>
</template>

<style scoped>
.img-uploader { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.img-uploader button { padding: 4px 10px; font-size: 13px; }
.img-uploader button:disabled { opacity: 0.6; cursor: wait; }
.up-error { color: #c0392b; font-size: 12px; }
.up-done { color: #27ae60; font-size: 12px; }
</style>
