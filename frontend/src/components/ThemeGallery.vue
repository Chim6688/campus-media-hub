<script setup>
// 模板画廊弹窗：网格展示每套皮肤的实际渲染效果，点卡片即应用
import { computed } from 'vue';
import { buildGallery } from '../utils/gallery.js';

const props = defineProps({ current: String });
const emit = defineEmits(['select', 'close']);
// 卡片静态生成一次（皮肤库是编译期常量，无需响应式重算）
const cards = computed(() => buildGallery());
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="gallery-modal">
      <p class="gallery-title">🖼 模板画廊 · 点击卡片应用皮肤</p>
      <div class="gallery-grid">
        <div v-for="c in cards" :key="c.id" class="gallery-card"
          :class="{ on: c.id === current }" @click="emit('select', c.id)">
          <p class="gallery-label">{{ c.label }}<span v-if="c.id === current">（当前）</span></p>
          <!-- pointer-events:none：预览区只看不滚，点击整卡即应用，避免滚动/点击歧义 -->
          <div class="gallery-view" v-html="c.html"></div>
        </div>
      </div>
      <button class="gallery-close" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<style scoped>
/* 复用全局 modal-mask 遮罩；画廊主体为宽弹窗 */
.gallery-modal { background: #fff; border-radius: 10px; padding: 16px; width: min(92vw, 1080px); max-height: 86vh; overflow: auto; }
.gallery-title { font-size: 15px; font-weight: bold; margin: 0 0 12px; }
.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.gallery-card { border: 2px solid #eee; border-radius: 8px; cursor: pointer; overflow: hidden; transition: border-color 0.15s; }
.gallery-card:hover { border-color: #1a73e8; }
.gallery-card.on { border-color: #27ae60; }
.gallery-label { font-size: 13px; font-weight: bold; margin: 0; padding: 8px 10px 6px; background: #fafafa; border-bottom: 1px solid #eee; }
.gallery-view { height: 320px; overflow: hidden; pointer-events: none; }
.gallery-view > section { transform: scale(0.62); transform-origin: top left; width: 160%; } /* 缩放预览：近似手机屏宽观感 */
.gallery-close { margin-top: 12px; padding: 6px 20px; }
</style>
