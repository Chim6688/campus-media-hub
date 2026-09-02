<script setup>
import { ref, reactive, computed, nextTick, watch, onBeforeUnmount } from 'vue';
import { request } from '../api/client.js';

const props = defineProps({ task: Object });
const emit = defineEmits(['back', 'refresh']);

const title = ref(props.task.title || '');
const summary = ref(props.task.summary || '');
const content = ref(props.task.content || '');
const saving = ref(false);
const savedAt = ref('');
const error = ref('');
const aiLoading = ref(''); // 当前进行中的 AI 动作名，用于按钮禁用态
const contentRef = ref(null); // 正文 textarea 引用，用于取选中文字

// ========== 通用输入弹窗 ==========
// 嵌入式预览（iframe）不支持原生 prompt()，统一用页内弹窗替代
const modal = reactive({ show: false, message: '', value: '', resolve: null });
const modalInput = ref(null);

// 用法：const text = await askUser('提示语')；取消返回 null
function askUser(message, defaultValue = '') {
  return new Promise((resolve) => {
    modal.message = message;
    modal.value = defaultValue;
    modal.resolve = resolve;
    modal.show = true;
    nextTick(() => modalInput.value?.focus());
  });
}
function confirmModal() {
  modal.show = false;
  modal.resolve?.(modal.value);
}
function cancelModal() {
  modal.show = false;
  modal.resolve?.(null);
}

// 切换任务时重置本地编辑态（switching 标记避免重置触发自动保存）
let switching = false;
watch(() => props.task.id, () => {
  switching = true;
  title.value = props.task.title || '';
  summary.value = props.task.summary || '';
  content.value = props.task.content || '';
  if (saveTimer) clearTimeout(saveTimer);
  nextTick(() => (switching = false));
});

// ========== 自动保存（防抖 2 秒） ==========
let saveTimer = null;
const autoSaved = ref(false); // 区分"已自动保存"与手动"已保存"

function scheduleAutoSave() {
  if (switching) return; // 任务切换时的回填不触发保存
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(true), 2000);
}

watch([title, summary, content], scheduleAutoSave);

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
});

// 保存文稿（isAuto=true 表示由防抖自动触发）
async function save(isAuto = false) {
  saving.value = true;
  try {
    ensureSignature(); // 双保险：保存时无署名则自动追加
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({
        id: props.task.id,
        title: title.value,
        summary: summary.value,
        content: content.value,
      }),
    });
    savedAt.value = new Date().toLocaleTimeString();
    autoSaved.value = isAuto;
    emit('refresh'); // 同步列表数据
  } finally {
    saving.value = false;
  }
}

// 署名双保险：文末无"责编 | 姓名"格式时自动追加（规范检查硬性要求）
function ensureSignature() {
  if (content.value && !/责编\s*[|｜]\s*\S+/.test(content.value)) {
    content.value = content.value.trimEnd() + `\n\n责编 | ${props.task.author}`;
  }
}

// ========== AI 工具条 ==========

// 统一 AI 调用封装
async function callAI(action, payload) {
  aiLoading.value = action;
  try {
    const data = await request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
    return data.text;
  } finally {
    aiLoading.value = '';
  }
}

// 解析初稿：按"标题：/摘要：/正文："结构拆开填入表单
async function generateDraft() {
  error.value = '';
  const notes = await askUser('补充要点/素材（可留空）：');
  if (notes === null) return; // 取消 = 放弃生成
  try {
    const text = await callAI('draft', {
      theme: props.task.theme,
      type: props.task.type,
      notes,
    });
    const titleMatch = text.match(/标题：(.+)/);
    const summaryMatch = text.match(/摘要：(.+)/);
    const bodyMatch = text.match(/正文：\n?([\s\S]+)/);
    if (titleMatch) title.value = titleMatch[1].trim();
    if (summaryMatch) summary.value = summaryMatch[1].trim();
    if (bodyMatch) content.value = bodyMatch[1].trim();
    ensureSignature(); // AI 初稿自动追加责编署名，避免用户忘记
    error.value = 'AI 初稿已生成，请检查后点"保存"';
  } catch (e) {
    error.value = e.message;
  }
}

// 生成 3 个候选标题，按钮点选（不再手动输入序号）
const titlePicker = reactive({ show: false, options: [] });

async function generateTitles() {
  error.value = '';
  try {
    const text = await callAI('title', { title: title.value, content: content.value });
    // 按行拆分、去掉"1. "编号前缀、过滤空行
    titlePicker.options = text
      .split('\n')
      .map((l) => l.replace(/^\s*\d+[.、]\s*/, '').trim())
      .filter(Boolean);
    if (!titlePicker.options.length) {
      error.value = 'AI 未返回有效标题，请重试';
      return;
    }
    titlePicker.show = true;
  } catch (e) {
    error.value = e.message;
  }
}

// 点选某个标题：填入标题框并关闭弹窗
function pickTitle(t) {
  title.value = t;
  titlePicker.show = false;
}

// AI 生成摘要
async function generateSummary() {
  error.value = '';
  try {
    summary.value = await callAI('summary', { title: title.value, content: content.value });
  } catch (e) {
    error.value = e.message;
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
    error.value = '请先在正文中选中要改写的文字';
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
  error.value = '';
  try {
    const newText = await callAI('rewrite', { selection: rewriteCtx.selection, instruction });
    const el = contentRef.value;
    content.value = el.value.slice(0, rewriteCtx.start) + newText + el.value.slice(rewriteCtx.end);
    error.value = '已改写选中文字（Ctrl+Z 可撤销）';
  } catch (e) {
    error.value = e.message;
  }
}

// ========== 状态操作（详情页直接推进/打回，不必回列表） ==========

const STATUS_TEXT = { writing: '写稿中', typesetting: '排版中', reviewing: '审核中', published: '已发布' };
const FLOW = ['writing', 'typesetting', 'reviewing', 'published'];
// 下一状态（published 无下一态，不显示推进按钮）
const nextStatus = computed(() => FLOW[FLOW.indexOf(props.task.status) + 1] || null);

// 状态变更：先保存最新内容（确保门禁检查当前编辑态），成功后刷新；失败展示完整整改清单
async function changeStatus(next) {
  error.value = '';
  try {
    await save();
    const data = await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: props.task.id, status: next }),
    });
    Object.assign(props.task, data.task);
    emit('refresh');
  } catch (e) {
    // 整改清单格式化：必须项+建议项逐条列出（P0-6 统一格式）
    error.value = formatAdvanceError(e);
  }
}

// 推进失败时把 report 整改清单拼进错误信息
function formatAdvanceError(e) {
  const detail = e.detail;
  if (!detail?.report) return e.message;
  const errs = detail.report.errors.map((i) => `【必须】${i.message} —— ${i.hint}`);
  const warns = detail.report.warnings.map((i) => `【建议】${i.message} —— ${i.hint}`);
  return [e.message, '', ...errs, ...warns].join('\n');
}

// ========== 规范检查 ==========

const report = ref(null);

// 先保存最新内容再检查，保证检查的是当前编辑态
async function runCheck() {
  error.value = '';
  try {
    await save();
    const data = await request('/api/check', {
      method: 'POST',
      body: JSON.stringify({ taskId: props.task.id }),
    });
    report.value = data.report;
  } catch (e) {
    error.value = e.message;
  }
}

// ========== 审核批注 ==========

const commentText = ref('');

// 提交批注：任何状态可加（写作者留言/审核人批注）
async function addComment() {
  if (!commentText.value.trim()) return;
  error.value = '';
  try {
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({
        id: props.task.id,
        comment: { by: localStorage.getItem('authorName') || '匿名', text: commentText.value.trim() },
      }),
    });
    commentText.value = '';
    await emitRefreshAndGet(); // 重新拉取任务展示最新批注
  } catch (e) {
    error.value = e.message;
  }
}

// ========== 秀米导出 ==========

// 一键复制：标题/摘要/正文拼接为纯文本，粘贴到秀米后按段排版
async function copyForXiumi() {
  error.value = '';
  const text = [title.value, summary.value, content.value].filter(Boolean).join('\n\n');
  if (!text.trim()) {
    error.value = '没有可导出的内容';
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    error.value = '已复制！去秀米 Ctrl+V 粘贴，按段套模板即可';
  } catch {
    // 剪贴板 API 不可用时降级：选中全文让用户 Ctrl+C
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
    error.value = '已复制！去秀米 Ctrl+V 粘贴，按段套模板即可';
  }
}

// 拉最新任务数据（含 comments），通过 refresh 事件链同步
async function emitRefreshAndGet() {
  emit('refresh');
  const data = await request('/api/tasks');
  const fresh = data.tasks.find((t) => t.id === props.task.id);
  if (fresh) Object.assign(props.task, fresh);
}
</script>

<template>
  <section class="detail">
    <button class="back" @click="emit('back')">← 返回列表</button>
    <h2>{{ task.theme }}</h2>

    <label>标题</label>
    <input v-model="title" placeholder="推文标题（可点 AI 生成）" />

    <label>摘要</label>
    <textarea v-model="summary" rows="2" placeholder="公众号推送摘要（可点 AI 生成）"></textarea>

    <label>正文（Markdown）</label>
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
    <textarea ref="contentRef" v-model="content" rows="18" placeholder="正文内容，先选中文字再点「选中改写」"></textarea>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="toolbar">
      <button :disabled="saving" @click="save()">{{ saving ? '保存中…' : '保存' }}</button>
      <button :disabled="saving" @click="runCheck">规范检查</button>
      <button @click="copyForXiumi">复制到秀米</button>
      <!-- 状态操作：按当前状态显示推进/打回 -->
      <button v-if="nextStatus" class="status-btn" @click="changeStatus(nextStatus)">
        推进为{{ STATUS_TEXT[nextStatus] }} →
      </button>
      <button v-if="task.status === 'reviewing'" class="status-btn reject" @click="changeStatus('writing')">
        打回修改
      </button>
      <span v-if="savedAt" class="saved">{{ autoSaved ? '已自动保存' : '已保存' }} {{ savedAt }}</span>
    </div>

    <!-- 检查报告：可行动的整改清单 -->
    <div v-if="report" class="report" :class="report.passed ? 'ok' : 'fail'">
      <p>{{ report.passed ? '检查通过，可推进到审核' : '存在 ' + report.errors.length + ' 个必须整改项' }}</p>
      <ul v-if="report.errors.length">
        <li v-for="(i, n) in report.errors" :key="'e' + n" class="err">【必须】{{ i.message }} —— {{ i.hint }}</li>
      </ul>
      <ul v-if="report.warnings.length">
        <li v-for="(i, n) in report.warnings" :key="'w' + n" class="warn">【建议】{{ i.message }} —— {{ i.hint }}</li>
      </ul>
    </div>

    <!-- 批注区：写作者留言/审核人批注 -->
    <div class="comments">
      <h3>批注（{{ (task.comments || []).length }}）</h3>
      <ul>
        <li v-for="(c, n) in task.comments" :key="n">
          <b>{{ c.by }}</b>：{{ c.text }}<span class="at">{{ (c.at || '').slice(5, 16).replace('T', ' ') }}</span>
        </li>
      </ul>
      <div class="add-comment">
        <input v-model="commentText" placeholder="留言/批注，如：第二段数据请核实" @keyup.enter="addComment" />
        <button @click="addComment">提交</button>
      </div>
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
  </section>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: 8px; }
.back { align-self: flex-start; margin-bottom: 8px; }
label { font-size: 13px; color: #666; margin-top: 8px; }
input, textarea { padding: 8px 10px; font-family: inherit; }
textarea { resize: vertical; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.saved { color: #27ae60; font-size: 13px; }
.ai-toolbar { display: flex; gap: 8px; margin-top: 4px; }
.ai-toolbar button { padding: 6px 12px; }
.error { color: #c0392b; white-space: pre-wrap; margin: 0; }
.report { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 14px; }
.report.ok { background: #eafaf1; }
.report.fail { background: #fdecea; }
.report ul { margin: 8px 0 0; padding-left: 18px; }
.report .err { color: #c0392b; }
.report .warn { color: #b7791f; }
.comments { margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px; }
.comments ul { list-style: none; padding: 0; }
.comments li { padding: 6px 0; border-bottom: 1px dashed #f0f0f0; }
.comments .at { color: #aaa; font-size: 12px; margin-left: 8px; }
.add-comment { display: flex; gap: 8px; margin-top: 8px; }
.add-comment input { flex: 1; padding: 6px 10px; }
.modal-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { background: #fff; border-radius: 8px; padding: 16px; width: min(420px, 90vw); display: flex; flex-direction: column; gap: 10px; }
.modal-msg { margin: 0; white-space: pre-wrap; font-size: 14px; }
.modal input { padding: 8px 10px; }
.modal-btns { display: flex; justify-content: flex-end; gap: 8px; }
.modal-title { margin: 0; font-size: 14px; font-weight: 600; }
.option-btn { text-align: left; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; cursor: pointer; }
.option-btn:hover { border-color: #1e88e5; background: #eef6fd; }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.status-btn { padding: 6px 12px; background: #1e88e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.status-btn.reject { background: #e67e22; }
</style>
