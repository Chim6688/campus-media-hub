<script setup>
// 写稿步（原 TaskDetail ② 写稿区 + 通用输入/标题候选/改写指令三个弹窗，拆分自 TaskDetail.vue）
// 正文/摘要/标题经 v-model 双向直写父级（自动保存链路由父统一触发）；
// AI 生成函数与弹窗交互全部自含；操作反馈用组件内提示行（原父顶部全局错误条）
import { ref, reactive } from 'vue';
import { ensureSignatureText } from '../../utils/signature.js'; // 文末署名（与父保存前共用同一纯函数）
import { useAskUser } from '../../composables/useAskUser.js'; // 通用输入弹窗（AI 初稿补充要点）
import { useAiTools } from '../../composables/useAiTools.js'; // AI 调用封装 + 等待进度

const props = defineProps({
  author: { type: String, default: '' },
  theme: { type: String, default: '' },
  type: { type: String, default: '活动报道' },
});
const title = defineModel('title', { type: String, default: '' });
const summary = defineModel('summary', { type: String, default: '' });
const content = defineModel('content', { type: String, default: '' });

const { modal, modalInput, askUser, confirmModal, cancelModal } = useAskUser();
const { aiLoading, aiElapsed, callAI } = useAiTools();
const hint = ref(''); // 操作反馈（成功/失败提示）
const contentRef = ref(null); // 正文 textarea 引用，用于取选中文字

// 解析初稿：按"标题：/摘要：/正文："结构拆开填入表单
async function generateDraft() {
  hint.value = '';
  const notes = await askUser('补充要点/素材（可留空）：');
  if (notes === null) return; // 取消 = 放弃生成
  try {
    const text = await callAI('draft', { theme: props.theme, type: props.type, notes });
    const titleMatch = text.match(/标题：(.+)/);
    const summaryMatch = text.match(/摘要：(.+)/);
    const bodyMatch = text.match(/正文：\n?([\s\S]+)/);
    if (titleMatch) title.value = titleMatch[1].trim();
    if (summaryMatch) summary.value = summaryMatch[1].trim();
    if (bodyMatch) content.value = bodyMatch[1].trim();
    content.value = ensureSignatureText(content.value, props.author); // AI 初稿自动追加责编署名
    hint.value = 'AI 初稿已生成，请检查后点"保存"';
  } catch (e) {
    hint.value = e.message;
  }
}

// 生成 3 个候选标题，按钮点选（不再手动输入序号）
const titlePicker = reactive({ show: false, options: [] });

async function generateTitles() {
  hint.value = '';
  try {
    const text = await callAI('title', { title: title.value, content: content.value });
    titlePicker.options = text
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.、]\s*/, '').trim())
      .filter(Boolean);
    if (!titlePicker.options.length) {
      hint.value = 'AI 未返回有效标题，请重试';
      return;
    }
    titlePicker.show = true;
  } catch (e) {
    hint.value = e.message;
  }
}

// 点选某个标题：填入标题框并关闭弹窗
function pickTitle(t) {
  title.value = t;
  titlePicker.show = false;
}

// AI 生成摘要
async function generateSummary() {
  hint.value = '';
  try {
    summary.value = await callAI('summary', { title: title.value, content: content.value });
  } catch (e) {
    hint.value = e.message;
  }
}

// 选中改写：快捷按钮 + 自定义指令（不再手动输入序号）
const rewritePicker = reactive({ show: false, custom: '' });
const rewritePresets = ['更口语化', '精简一点', '扩写细节', '更有数据感'];
// 捕获选中上下文：弹窗操作后 textarea 失焦，提前记录选中区间更稳妥
const rewriteCtx = { selection: '', start: 0, end: 0 };

function rewriteSelection() {
  const el = contentRef.value;
  rewriteCtx.selection = el.value.slice(el.selectionStart, el.selectionEnd);
  if (!rewriteCtx.selection) {
    hint.value = '请先在正文中选中要改写的文字';
    return;
  }
  rewriteCtx.start = el.selectionStart;
  rewriteCtx.end = el.selectionEnd;
  rewritePicker.custom = '';
  rewritePicker.show = true;
}

// 执行改写并替换选中段（Ctrl+Z 可撤销）
async function execRewrite(instruction) {
  if (!instruction || !rewriteCtx.selection) return;
  rewritePicker.show = false;
  hint.value = '';
  try {
    const newText = await callAI('rewrite', { selection: rewriteCtx.selection, instruction });
    const el = contentRef.value;
    content.value = el.value.slice(0, rewriteCtx.start) + newText + el.value.slice(rewriteCtx.end);
    hint.value = '已改写选中文字（Ctrl+Z 可撤销）';
  } catch (e) {
    hint.value = e.message;
  }
}
</script>

<template>
  <div class="writing-panel">
    <label>摘要</label>
    <textarea v-model="summary" rows="2" placeholder="公众号推送摘要（可点 AI 生成）"></textarea>
    <div class="ai-toolbar">
      <button :disabled="!!aiLoading" @click="generateDraft">
        {{ aiLoading === 'draft' ? '生成中…' : 'AI 初稿' }}
      </button>
      <button :disabled="!!aiLoading" @click="generateTitles">
        {{ aiLoading === 'title' ? '生成中…' : 'AI 改标题' }}
      </button>
      <button :disabled="!!aiLoading" @click="generateSummary">
        {{ aiLoading === 'summary' ? '生成中…' : 'AI 摘要' }}
      </button>
      <button :disabled="!!aiLoading" @click="rewriteSelection">
        {{ aiLoading === 'rewrite' ? '改写中…' : '选中改写' }}
      </button>
    </div>
    <!-- P2-7：长任务等待提示，超 8 秒才出现，避免误以为卡死 -->
    <p v-if="aiElapsed >= 8" class="ai-progress">
      ⏳ AI 正在处理（已等待 {{ aiElapsed }} 秒）… 长文生成约需 10-25 秒，请勿离开本页
    </p>
    <p v-if="hint" class="hint-line">{{ hint }}</p>
    <div class="editor-left">
      <textarea ref="contentRef" v-model="content" rows="24" placeholder="正文 Markdown：## 小节、> 金句、[配图：说明]、文末署名"></textarea>
      <p class="word-count">{{ content.length }} 字</p>
    </div>

    <!-- 通用输入弹窗：替代原生 prompt（嵌入式预览环境不支持） -->
    <div v-if="modal.show" class="modal-mask" @click.self="cancelModal">
      <div class="modal">
        <p class="modal-msg">{{ modal.message }}</p>
        <input ref="modalInput" v-model="modal.value" @keyup.enter="confirmModal" @keyup.esc="cancelModal" />
        <div class="modal-btns">
          <button @click="cancelModal">取消</button>
          <button @click="confirmModal">确定</button>
        </div>
      </div>
    </div>

    <!-- 标题候选点选弹窗 -->
    <div v-if="titlePicker.show" class="modal-mask" @click.self="titlePicker.show = false">
      <div class="modal">
        <p class="modal-title">选择一个标题</p>
        <button v-for="(t, i) in titlePicker.options" :key="i" class="option-btn" @click="pickTitle(t)">
          {{ t }}
        </button>
        <div class="modal-btns">
          <button @click="titlePicker.show = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 改写指令弹窗：快捷按钮 + 自定义输入 -->
    <div v-if="rewritePicker.show" class="modal-mask" @click.self="rewritePicker.show = false">
      <div class="modal">
        <p class="modal-title">改写选中的文字</p>
        <div class="preset-grid">
          <button v-for="p in rewritePresets" :key="p" class="option-btn" @click="execRewrite(p)">
            {{ p }}
          </button>
        </div>
        <input v-model="rewritePicker.custom" placeholder="或输入自定义改写要求" @keyup.enter="execRewrite(rewritePicker.custom)" />
        <div class="modal-btns">
          <button @click="rewritePicker.show = false">取消</button>
          <button @click="execRewrite(rewritePicker.custom)">执行</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 样式同原 TaskDetail ② 写稿区 + 弹窗 */
.writing-panel { display: flex; flex-direction: column; gap: 4px; }
label { font-size: 13px; color: #666; margin-top: 8px; }
textarea { resize: vertical; padding: 8px 10px; font-family: inherit; }
input { padding: 8px 10px; font-family: inherit; }
.ai-toolbar { display: flex; gap: 8px; margin-top: 4px; }
.ai-toolbar button { padding: 6px 12px; }
.ai-progress { color: #b7791f; font-size: 13px; margin: 4px 0; }
.hint-line { color: #c0392b; font-size: 13px; margin: 4px 0 0; }
.editor-left { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.editor-left textarea { flex: 1; }
.word-count { color: #999; font-size: 12px; margin: 0; }
.modal-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { background: #fff; border-radius: 8px; padding: 16px; width: min(420px, 90vw); display: flex; flex-direction: column; gap: 10px; }
.modal-msg { margin: 0; white-space: pre-wrap; font-size: 14px; }
.modal input { padding: 8px 10px; }
.modal-btns { display: flex; justify-content: flex-end; gap: 8px; }
.modal-title { margin: 0; font-size: 14px; font-weight: 600; }
.option-btn { text-align: left; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; cursor: pointer; }
.option-btn:hover { border-color: #1e88e5; background: #eef6fd; }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
