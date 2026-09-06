<script setup>
// AI 视觉设计（V2 Phase 2）：上传参考图 → 全维度分析 → 3 个构图互异方案 → 小编点选应用
// AI 只建议：应用事件抛给 VisualPanel 写入编辑态，生成仍由小编手动触发
import { reactive, ref } from 'vue';
import { request } from '../../api/client.js';
import { compressSpec } from '../../utils/vision-skin.js';
import { parseVisualAnalysis, buildDesignPlans } from '../../utils/visual-analysis.js';

const emit = defineEmits(['apply-plan']);

const state = reactive({
  loading: false, error: '',
  imagePreview: '', done: false,
  analysis: null, // { visualType, stylePreset, colors, elements, layoutReason, recommendations }
  plans: [],     // [{ name, composition, compositionLabel, stylePreset, note }]
});
let imageBase64 = '';

const fileInput = ref(null);
function pickImage() { fileInput.value?.click(); }

function onFileChange(e) {
  state.error = '';
  const file = e.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    state.error = '仅支持 JPG/PNG/WebP 图片';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => compressToDataUrl(reader.result);
  reader.readAsDataURL(file);
  e.target.value = '';
}

// Canvas 压缩：与 VisionSkinModal 同策略（compressSpec 纯函数共用）
function compressToDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    const { targetW, targetH, quality } = compressSpec(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    canvas.getContext('2d').drawImage(img, 0, 0, targetW, targetH);
    imageBase64 = canvas.toDataURL('image/jpeg', quality);
    state.imagePreview = imageBase64;
  };
  img.onerror = () => { state.error = '图片读取失败，请换一张'; };
  img.src = dataUrl;
}

// 分析参考图（真实视觉模型调用）
async function analyze() {
  if (!imageBase64) return;
  state.loading = true;
  state.error = '';
  state.done = false;
  try {
    const data = await request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ action: 'visual_analysis', payload: { imageBase64 } }),
    });
    const r = parseVisualAnalysis(data.text);
    if (!r.ok) { state.error = r.error; return; }
    state.analysis = r;
    state.plans = buildDesignPlans(r, r.visualType);
    state.done = true;
  } catch (e) {
    state.error = 'AI 分析失败，请重试：' + e.message;
  } finally {
    state.loading = false;
  }
}

// 应用方案：构图+风格+配色一起上抛（VisualPanel 写构图/风格，colors 再上抛 TaskDetail）
function applyPlan(plan) {
  emit('apply-plan', {
    visualType: state.analysis.visualType,
    composition: plan.composition,
    stylePreset: plan.stylePreset,
    colors: state.analysis.colors,
    elements: state.analysis.elements,
    recommendations: state.analysis.recommendations,
  });
}
</script>
<template>
  <div class="vd-ai">
    <div class="row">
      <button type="button" class="ai-btn" :disabled="state.loading" @click="pickImage">📷 上传参考图</button>
      <button type="button" class="ai-btn primary" :disabled="state.loading || !state.imagePreview" @click="analyze">
        {{ state.loading ? '分析中…' : '✨ AI 视觉设计' }}
      </button>
      <img v-if="state.imagePreview" :src="state.imagePreview" class="img-preview" alt="参考图" />
    </div>
    <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="onFileChange" />
    <p v-if="state.error" class="error">{{ state.error }}</p>

    <template v-if="state.done">
      <!-- 识别结果摘要（指令 §5 版式） -->
      <div class="result-box">
        <p>视觉类型：{{ state.analysis.visualType === 'cover' ? '封面' : '章节页' }} · 风格：{{ state.analysis.stylePreset }} · 配色：8 色</p>
        <p v-if="state.analysis.layoutReason" class="reason">{{ state.analysis.layoutReason }}</p>
        <p v-if="state.analysis.recommendations.length" class="rec">{{ state.analysis.recommendations.join('；') }}</p>
      </div>
      <!-- 方案 A/B/C：构图互异 -->
      <div class="plans">
        <div v-for="p in state.plans" :key="p.composition" class="plan-card">
          <p class="plan-name">{{ p.name }} · {{ p.compositionLabel }}</p>
          <p class="plan-note">{{ p.note }}</p>
          <button type="button" class="apply-btn" @click="applyPlan(p)">使用这个设计</button>
        </div>
      </div>
    </template>
  </div>
</template>
<style scoped>
.vd-ai { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 8px; }
.ai-btn { padding: 5px 14px; border: 1px solid #1a1a1a; border-radius: 14px; background: #fff; cursor: pointer; }
.ai-btn.primary { background: #1a1a1a; color: #fff; }
.ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.img-preview { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e5e5; }
.error { color: #e74c3c; font-size: 13px; margin: 0; }
.result-box { border: 1px dashed #bbb; border-radius: 8px; padding: 8px 12px; font-size: 13px; color: #333; }
.result-box p { margin: 0 0 2px; }
.reason, .rec { color: #999; font-size: 12px; }
.plans { display: flex; gap: 8px; flex-wrap: wrap; }
.plan-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px; width: 150px; display: flex; flex-direction: column; gap: 4px; }
.plan-name { margin: 0; font-size: 13px; font-weight: bold; }
.plan-note { margin: 0; font-size: 12px; color: #999; flex: 1; }
.apply-btn { padding: 3px 0; border: 1px solid #27ae60; color: #27ae60; border-radius: 12px; background: #fff; cursor: pointer; }
</style>
