<script setup>
// AI 配色弹窗（Phase 5 合并版）：文字描述生成（gen_skin）+ 参考图识别（gen_skin_vision）
// 识图：前端 Canvas 压缩 → base64 → 视觉模型 → parseVisionSkin 清洗 → emit apply
import { ref } from 'vue';
import { request } from '../api/client.js';
import { normalizeSkin } from '../utils/skin.js';
import { parseVisionSkin, compressSpec } from '../utils/vision-skin.js';

defineProps({ show: Boolean });
const emit = defineEmits(['close', 'apply']);

const input = ref(''); // 风格描述（两种模式共用：识图时作可选补充）
const loading = ref(false);
const error = ref('');
const imagePreview = ref(''); // 已选参考图预览（dataURL）
let imageBase64 = ''; // 压缩后的完整 dataURL（发后端）

// —— 参考图选择与压缩 ——
const fileInput = ref(null);
function pickImage() { fileInput.value?.click(); }
function onFileChange(e) {
  error.value = '';
  const file = e.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    error.value = '仅支持 JPG/PNG/WebP 图片';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => compressToDataUrl(reader.result);
  reader.readAsDataURL(file);
  e.target.value = ''; // 允许重复选同一文件
}

// Canvas 压缩：最长边 1024 + JPEG 0.85（compressSpec 纯函数可测，此处只做 IO）
function compressToDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    const { targetW, targetH, quality } = compressSpec(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);
    imageBase64 = canvas.toDataURL('image/jpeg', quality);
    imagePreview.value = imageBase64;
  };
  img.onerror = () => { error.value = '图片读取失败，请换一张'; };
  img.src = dataUrl;
}

// —— AI 调用（本组件自带 loading/error，不复用 TaskDetail 的 callAI）——
async function callAI(action, payload) {
  const data = await request('/api/ai', { method: 'POST', body: JSON.stringify({ action, payload }) });
  return data.text;
}

// 模式一：文字描述生成配色（原 skinModal 逻辑迁移，行为不变）
async function generateFromText() {
  if (!input.value.trim()) return;
  loading.value = true;
  error.value = '';
  try {
    const text = await callAI('gen_skin', { text: input.value.trim() });
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const colors = normalizeSkin(JSON.parse(clean));
    if (Object.keys(colors).length < 8) {
      error.value = 'AI 生成的配色不完整，请换个描述重试（或用「🎨 调参数」手动配色）';
      return;
    }
    emit('apply', { colors, stylePreset: null }); // 描述模式不改风格（既有行为）
  } catch (e) {
    error.value = 'AI 生成失败，请重试：' + e.message;
  } finally {
    loading.value = false;
  }
}

// 模式二：参考图识别（Phase 5 新增）→ 8 色 + 风格一起应用
async function generateFromImage() {
  if (!imageBase64) return;
  loading.value = true;
  error.value = '';
  try {
    const text = await callAI('gen_skin_vision', { imageBase64, text: input.value.trim() });
    const r = parseVisionSkin(text);
    if (!r.ok) { error.value = r.error; return; }
    emit('apply', { colors: r.colors, stylePreset: r.stylePreset });
  } catch (e) {
    error.value = '识图失败，请重试：' + e.message;
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <div v-if="show" class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <p class="modal-title">✨ AI 配色</p>
      <textarea v-model="input" rows="2" placeholder="描述想要的风格（识图时可留空作补充），如：蓝金科技感 / 温柔奶油风"></textarea>

      <!-- 参考图区（Phase 5）：选图 → 压缩预览 → 识图 -->
      <div class="img-row">
        <button type="button" :disabled="loading" @click="pickImage">📷 上传参考图</button>
        <img v-if="imagePreview" :src="imagePreview" class="img-preview" alt="参考图" />
      </div>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="onFileChange" />

      <div class="modal-btns">
        <button type="button" @click="emit('close')">取消</button>
        <button type="button" :disabled="loading || !input.trim()" @click="generateFromText">
          {{ loading ? '生成中…' : '按描述生成' }}
        </button>
        <button type="button" class="primary" :disabled="loading || !imageBase64" @click="generateFromImage">
          {{ loading ? '识别中…' : '识图生成配色+风格' }}
        </button>
      </div>
      <p v-if="error" class="modal-error">{{ error }}</p>
      <p class="skin-tip">识图输出整套配色（8 色）+ 结构风格（journal/bold/soft）一起应用；仅描述则只改配色</p>
    </div>
  </div>
</template>
<style scoped>
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { background: #fff; border-radius: 8px; padding: 18px; width: min(440px, 92vw); display: flex; flex-direction: column; gap: 10px; }
.modal-title { margin: 0; font-size: 15px; font-weight: bold; }
.modal textarea { padding: 8px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; resize: vertical; }
.img-row { display: flex; align-items: center; gap: 10px; }
.img-preview { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e5e5; }
.modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
.modal-btns .primary { background: #1a1a1a; color: #fff; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-error { color: #e74c3c; font-size: 13px; margin: 0; }
.skin-tip { color: #999; font-size: 12px; margin: 0; }
</style>
