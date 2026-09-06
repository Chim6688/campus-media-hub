<script setup>
// 风格三选一选择器：journal/bold/soft（识图结果与手选共用此状态）
import { STYLE_PRESETS } from '../../utils/style-presets.js';
const model = defineModel({ type: String, default: 'journal' });
</script>
<template>
  <div class="preset-selector">
    <button v-for="p in STYLE_PRESETS" :key="p.id" :class="{ active: model === p.id }"
      :title="p.description" @click="model = p.id">{{ p.name }}</button>
  </div>
</template>
<style scoped>
.preset-selector { display: flex; gap: 8px; }
.preset-selector button { padding: 6px 14px; border: 1px solid #d9d9d9; border-radius: 16px; background: #fff; cursor: pointer; }
.preset-selector button.active { border-color: #1a1a1a; background: #1a1a1a; color: #fff; }
</style>
