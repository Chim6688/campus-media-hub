<script setup>
// 视觉卡字段编辑器（V2 Phase 1）：标题/副标题/组织/地点/日期/Part 直接 v-model 到父级 reactive 卡数据
// 数据流不新增：VisualPanel 的 coverData/cardData 仍是唯一数据源，本组件只提供编辑 UI
defineProps({
  coverData: { type: Object, required: true },
  cardData: { type: Object, required: true },
  activeType: { type: String, default: 'cover' }, // cover | section：切换显示哪组字段
});
</script>
<template>
  <div class="v-editor">
    <!-- 封面字段组 -->
    <template v-if="activeType === 'cover'">
      <label>标题<input v-model="coverData.title" maxlength="30" /></label>
      <label>副标题<input v-model="coverData.subtitle" maxlength="24" /></label>
      <label>学校/组织<input v-model="coverData.org" maxlength="24" /></label>
      <label>地点<input v-model="coverData.place" maxlength="20" /></label>
      <label>日期<input v-model="coverData.date" maxlength="20" /></label>
    </template>
    <!-- 章节卡字段组 -->
    <template v-else>
      <label>Part 编号<input v-model.number="cardData.partNum" type="number" min="1" max="99" /></label>
      <label>章节标题<input v-model="cardData.title" maxlength="20" /></label>
      <label>副标题<input v-model="cardData.subtitle" maxlength="18" /></label>
    </template>
  </div>
</template>
<style scoped>
.v-editor { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.v-editor label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #666; }
.v-editor input { padding: 5px 8px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 13px; }
</style>
