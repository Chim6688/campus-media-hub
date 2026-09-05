<script setup>
// 配图槽位组件（V1.0 Phase 3）：一个正文图片位置
// 空槽：[选择图片]（开图片库）/ [上传]（直传并绑定到本槽）
// 绑定槽：缩略图 + [换图]（旧图回库+库选新图）/ [移除]（解绑回库）/ [删除]（连文件彻底删）
import ImageUploader from './ImageUploader.vue';

defineProps({
  slot: Object, // { position, image, suggestion } 由 buildSlots 产出
  taskId: String,
});
const emit = defineEmits(['pick', 'replace', 'unbind', 'remove', 'uploaded']);
</script>

<template>
  <div class="img-slot" :class="{ filled: !!slot.image }">
    <div class="slot-head">
      <span class="slot-no">{{ slot.position }}</span>
      <span class="slot-sug">{{ slot.suggestion || '未填写拍摄计划（可在上方配图计划中补充）' }}</span>
    </div>
    <!-- 绑定态：缩略图 + 操作按钮 -->
    <div v-if="slot.image" class="slot-body">
      <img class="slot-thumb" :src="slot.image.url" :alt="slot.image.caption || '配图'" />
      <div class="slot-btns">
        <button type="button" @click="emit('replace')" title="从图片库换一张，旧图回到图片库">换图</button>
        <button type="button" @click="emit('unbind')" title="取消绑定，图片回到图片库（文件保留）">移除</button>
        <button type="button" class="danger" @click="emit('remove')" title="彻底删除图片文件，不可恢复">删除</button>
      </div>
    </div>
    <!-- 空槽：选择或直传 -->
    <div v-else class="slot-body empty">
      <div class="slot-empty-box">未绑定图片</div>
      <div class="slot-btns">
        <button type="button" @click="emit('pick')">选择图片</button>
        <!-- 直传：上传入池后由父级立即 PATCH position 绑定到本槽 -->
        <ImageUploader :task-id="taskId" label="上传" @uploaded="emit('uploaded', $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.img-slot { border: 1px solid #e6e2d9; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: #fff; }
.img-slot.filled { border-color: #bcd9c6; background: #f7fbf8; }
.slot-head { display: flex; align-items: center; gap: 8px; }
.slot-no { width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 50%; background: #e8f0fe; color: #1a73e8; font-size: 12px; font-weight: bold; flex-shrink: 0; }
.slot-sug { font-size: 13px; color: #666; }
.slot-body { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.slot-thumb { width: 96px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #e0e0e0; }
.slot-empty-box { width: 96px; height: 72px; border: 1px dashed #ccc; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 12px; }
.slot-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.slot-btns button { padding: 4px 10px; font-size: 12px; }
.slot-btns .danger { color: #c0392b; }
</style>
