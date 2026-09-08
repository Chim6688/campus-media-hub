<script setup>
// 发布前检查步（原 TaskDetail ⑤ 检查区，拆分自 TaskDetail.vue）
// 纯展示 + 交互上抛：规范检查/勾销/提交都由父级执行（父保有 checklist PATCH 与状态流转）
import { computed } from 'vue';

const props = defineProps({
  task: { type: Object, required: true }, // 读 status（writing/reviewing/published 分支展示）
  precheckItems: { type: Array, default: () => [] },
  precheckReady: { type: Boolean, default: false },
  precheckAdvisoryCount: { type: Number, default: 0 },
  report: { type: Object, default: null },
  checklist: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false }, // 规范检查按钮禁用态
});
const emit = defineEmits(['run-check', 'toggle', 'submit']);

const checklistRemaining = computed(() => props.checklist.filter((i) => !i.done).length);
</script>

<template>
  <div>
    <div class="precheck">
      <div class="precheck-head">
        <h3>发布前检查</h3>
        <button :disabled="saving" @click="emit('run-check')">规范检查</button>
      </div>
      <!-- 九项清单：✓ 已过 / ✗ 未过（附去哪一步修的提示） -->
      <ul class="precheck-list">
        <li v-for="item in precheckItems" :key="item.name" :class="item.ok ? 'ok' : 'bad'">
          <span class="pc-mark">{{ item.ok ? '✓' : '✗' }}</span>
          <span class="pc-name">{{ item.name }}</span>
          <span v-if="!item.ok" class="pc-hint">{{ item.hint }}</span>
        </li>
      </ul>
      <!-- 总状态：核心项全绿可提交；建议项未做提示不阻断（总方案 §9 视觉图=Warning） -->
      <p class="precheck-state" :class="precheckReady ? 'ready' : 'blocked'">
        {{ !precheckReady
          ? '🔴 有未通过项，修复后再提交审核'
          : precheckAdvisoryCount
            ? `🟢 核心检查通过，可以提交（${precheckAdvisoryCount} 项建议未做，不阻塞）`
            : '🟢 全部通过，可以提交审核' }}
      </p>
      <!-- 提交审核：核心项全过 + 整改清单清零（体验层；后端 rules-engine 为真门禁） -->
      <button v-if="task.status === 'writing'" class="status-btn submit-btn"
        :disabled="!precheckReady || checklistRemaining > 0"
        :title="checklistRemaining > 0 ? `整改清单还剩 ${checklistRemaining} 条` : (!precheckReady ? '按上方清单逐项修复' : '')"
        @click="emit('submit')">
        提交审核 →
      </button>
    </div>
    <!-- 检查报告：规范检查的详细结果（可行动的整改清单） -->
    <div v-if="report" class="report" :class="report.passed ? 'ok' : 'fail'">
      <p>{{ report.passed ? '规范检查通过' : '存在 ' + report.errors.length + ' 个必须整改项' }}</p>
      <ul v-if="report.errors.length">
        <li v-for="(i, n) in report.errors" :key="'e' + n" class="err">【必须】{{ i.message }} —— {{ i.hint }}</li>
      </ul>
      <ul v-if="report.warnings.length">
        <li v-for="(i, n) in report.warnings" :key="'w' + n" class="warn">【建议】{{ i.message }} —— {{ i.hint }}</li>
      </ul>
    </div>
    <!-- 整改清单：打回时生成，逐条勾销，清零才能推回审核（仅写稿中且有清单时显示） -->
    <div v-if="checklist.length && task.status === 'writing'" class="checklist">
      <h3>整改清单（剩 {{ checklistRemaining }}/{{ checklist.length }}）</h3>
      <ul>
        <li v-for="item in checklist" :key="item.id" :class="{ done: item.done }">
          <label>
            <input type="checkbox" :checked="item.done" @change="emit('toggle', item)" />
            {{ item.text }}
          </label>
        </li>
      </ul>
      <p v-if="checklistRemaining === 0" class="checklist-ok">✓ 全部完成，可推进到审核</p>
    </div>
    <p v-if="task.status !== 'writing'" class="step-hint">
      {{ task.status === 'reviewing' ? '已提交审核，审核操作见第 ⑥ 步' : '已发布，检查记录仅供回看' }}
    </p>
  </div>
</template>

<style scoped>
/* 样式同原 TaskDetail ⑤ 检查区 */
.precheck { border: 1px solid #d8e4f8; border-radius: 8px; padding: 12px 14px; background: #fbfdff; }
.precheck-head { display: flex; align-items: center; justify-content: space-between; }
.precheck-head h3 { margin: 0; font-size: 15px; }
.precheck-list { list-style: none; padding: 0; margin: 10px 0; }
.precheck-list li { display: flex; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px dashed #eef2f8; }
.precheck-list li:last-child { border-bottom: none; }
.pc-mark { width: 18px; text-align: center; flex-shrink: 0; }
.precheck-list .ok .pc-mark { color: #27ae60; }
.precheck-list .bad .pc-mark { color: #c0392b; }
.pc-name { font-size: 14px; color: #333; flex-shrink: 0; }
.precheck-list .bad .pc-name { color: #c0392b; }
.pc-hint { font-size: 12px; color: #b7791f; }
.precheck-state { font-size: 14px; font-weight: bold; margin: 8px 0 12px; }
.precheck-state.ready { color: #27ae60; }
.precheck-state.blocked { color: #c0392b; }
.status-btn { padding: 6px 12px; background: #1e88e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.submit-btn { font-size: 15px; padding: 8px 24px; }
.submit-btn:disabled { background: #bbb; cursor: not-allowed; }
.report { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 14px; }
.report.ok { background: #eafaf1; }
.report.fail { background: #fdecea; }
.report ul { margin: 8px 0 0; padding-left: 18px; }
.report .err { color: #c0392b; }
.report .warn { color: #b7791f; }
.checklist { border: 1px solid #e6d9c8; border-radius: 8px; padding: 10px 14px; background: #fdf9f2; }
.checklist h3 { margin: 0 0 8px; font-size: 14px; }
.checklist ul { list-style: none; padding: 0; margin: 0; }
.checklist li { padding: 4px 0; font-size: 14px; }
.checklist li.done { color: #999; text-decoration: line-through; }
.checklist label { display: flex; align-items: baseline; gap: 8px; font-size: 14px; color: #333; margin: 0; }
.checklist-ok { color: #27ae60; font-size: 13px; margin: 6px 0 0; }
.step-hint { font-size: 12px; color: #999; margin: 8px 0 0; }
button { padding: 4px 10px; }
</style>
