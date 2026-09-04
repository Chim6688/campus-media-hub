<script setup>
import { ref, reactive, computed, nextTick, watch, onBeforeUnmount } from 'vue';
import { request, uploadPDF } from '../api/client.js';
import { markdownToWechatHTML, markdownToPlainText } from '../utils/wechat-format.js';
import { THEMES } from '../utils/themes.js';
import { normalizeLines, makeItem } from '../utils/checklist.mjs'; // 整改清单纯函数（与后端双份同步）
import { computeSteps } from '../utils/steps.js'; // 流程步骤条纯函数（P1-3）
import ThemeGallery from './ThemeGallery.vue'; // 模板画廊弹窗（批1）

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

// ========== 素材面板（策划书解析 + 人工补充） ==========
const materialOpen = ref(false); // P1-4：默认收起降密度，有素材时头部显示摘要
const parsing = ref(false);
// 结构化素材：highlights/flow 面板中按行编辑，提交时拆数组
const material = reactive({ name: '', time: '', location: '', target: '', meaning: '' });
const materialHighlightsText = ref('');
const materialFlowText = ref('');
const liveNotes = ref(''); // 现场亮点（AI 拿不到的信息）
const photoNotes = ref(''); // 照片说明（用于配图占位）

// 从任务数据回填素材面板
function fillMaterial(m) {
  material.name = m?.name || '';
  material.time = m?.time || '';
  material.location = m?.location || '';
  material.target = m?.target || '';
  material.meaning = m?.meaning || '';
  materialHighlightsText.value = (m?.highlights || []).join('\n');
  materialFlowText.value = (m?.flow || []).join('\n');
  liveNotes.value = m?.liveNotes || '';
  photoNotes.value = m?.photoNotes || '';
}
fillMaterial(props.task.material); // 首次打开回填

// 素材 → 提交对象（数组化 + 补充字段）
function materialPayload() {
  return {
    ...material,
    highlights: materialHighlightsText.value.split('\n').map((s) => s.trim()).filter(Boolean),
    flow: materialFlowText.value.split('\n').map((s) => s.trim()).filter(Boolean),
    liveNotes: liveNotes.value,
    photoNotes: photoNotes.value,
  };
}

// 是否有任何素材内容（空素材不进 PATCH，避免覆盖）
function hasMaterial() {
  const p = materialPayload();
  return Object.values(p).some((v) => (Array.isArray(v) ? v.length : String(v || '').trim()));
}

// 上传策划书 PDF → AI 提取结构化素材 → 填充面板并持久化
async function onPDFUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  parsing.value = true;
  startElapse(); // PDF 解析同样计入等待进度（P2-7）
  error.value = '';
  try {
    const data = await uploadPDF('/api/parse-pdf', file);
    fillMaterial(data.material);
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: props.task.id, material: materialPayload() }),
    });
    emit('refresh');
  } catch (err) {
    error.value = err.message;
  } finally {
    parsing.value = false;
    stopElapse();
    e.target.value = ''; // 允许重复上传同一文件
  }
}

// 一键成稿：基于素材面板 + 现场补充生成完整初稿
async function generateFullDraft() {
  error.value = '';
  aiLoading.value = 'draft_from_material';
  try {
    // 先持久化素材，再生成（保证素材与初稿一致）
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: props.task.id, material: materialPayload() }),
    });
    const text = await callAI('draft_from_material', {
      type: props.task.type,
      theme: props.task.theme,
      material: materialPayload(),
      liveNotes: liveNotes.value,
      photoNotes: photoNotes.value,
    });
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let draft;
    try {
      draft = JSON.parse(clean);
    } catch {
      // 降级：正则逐字段提取（AI 偶发非严格 JSON 时兜底）
      const t = clean.match(/"title"\s*:\s*"([^"]+)"/);
      const s = clean.match(/"summary"\s*:\s*"([^"]+)"/);
      const c = clean.match(/"content"\s*:\s*"([\s\S]+)"\s*$/);
      if (!c) throw new Error('AI 返回格式异常，请重试');
      draft = {
        title: t?.[1] || title.value,
        summary: s?.[1] || summary.value,
        content: c[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
      };
    }
    if (draft.title) title.value = draft.title;
    if (draft.summary) summary.value = draft.summary;
    if (draft.content) content.value = draft.content;
    ensureSignature(); // 署名双保险
    await save(true); // 生成后立即自动保存
    error.value = '初稿已生成，请检查左侧正文与右侧排版预览';
  } catch (e) {
    error.value = e.message;
  } finally {
    aiLoading.value = '';
  }
}

// 切换任务时重置本地编辑态（switching 标记避免重置触发自动保存）
let switching = false;
watch(() => props.task.id, () => {
  switching = true;
  title.value = props.task.title || '';
  summary.value = props.task.summary || '';
  content.value = props.task.content || '';
  fillMaterial(props.task.material);
  // 排版主题回填：优先任务级 layout_theme，无则回退全局记忆（在 switching 保护内，避免触发自动保存覆盖）
  themeId.value = props.task.layout_theme?.id || localStorage.getItem('themeId') || 'greenPink';
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
  Object.assign(themeOverrides, props.task.layout_theme?.overrides || {});
  // 整改清单回填：旧任务无清单 → 空数组（不阻塞推进）
  checklist.value = Array.isArray(props.task.review_checklist) ? [...props.task.review_checklist] : [];
  if (saveTimer) clearTimeout(saveTimer);
  nextTick(() => (switching = false));
});

// ========== 自动保存（防抖 2 秒，含素材字段） ==========
let saveTimer = null;
const autoSaved = ref(false); // 区分"已自动保存"与手动"已保存"

// 素材序列化快照：任一素材字段变化都触发防抖保存
const materialSnapshot = computed(() => JSON.stringify(materialPayload()));

function scheduleAutoSave() {
  if (switching) return; // 任务切换时的回填不触发保存
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(true), 2000);
}

watch([title, summary, content, materialSnapshot], scheduleAutoSave);

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  stopElapse(); // P2-7：卸载时清掉计时器防泄漏
});

// 保存文稿（isAuto=true 表示由防抖自动触发）
async function save(isAuto = false) {
  saving.value = true;
  try {
    ensureSignature(); // 双保险：保存时无署名则自动追加
    const body = {
      id: props.task.id,
      title: title.value,
      summary: summary.value,
      content: content.value,
      layout_theme: { id: themeId.value, overrides: { ...themeOverrides } }, // 排版主题随任务持久化（P2-6 起独立列，不撞推文主题）
    };
    if (hasMaterial()) body.material = materialPayload(); // 素材随文稿一起持久化
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify(body),
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

// ========== P2-7：AI 等待进度（超 8s 显示已等待秒数，避免像卡死） ==========
const aiElapsed = ref(0);
let aiTimer = null;
function startElapse() {
  stopElapse();
  aiElapsed.value = 0;
  aiTimer = setInterval(() => (aiElapsed.value += 1), 1000);
}
function stopElapse() {
  if (aiTimer) clearInterval(aiTimer);
  aiTimer = null;
  aiElapsed.value = 0;
}

// 统一 AI 调用封装
async function callAI(action, payload) {
  aiLoading.value = action;
  startElapse(); // 计时与加载态同生命周期：进度提示依赖 aiElapsed
  try {
    const data = await request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ action, payload }),
    });
    return data.text;
  } finally {
    aiLoading.value = '';
    stopElapse();
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

// ========== 流程步骤条（P1-3：数据完备度驱动，纯引导不设闸） ==========
// 五步完成度由纯函数按任务数据计算：选题=已建任务、素材/成稿看数据、排版/审核看状态
const steps = computed(() => computeSteps(props.task));
// 步骤 → 页面区块选择器映射（选题在头部无独立区块，点击不滚动）
const STEP_ANCHORS = { topic: null, material: '.material-panel', draft: '.ai-toolbar', layout: '.editor-split', review: '.toolbar' };
// 点击步骤：平滑滚动到对应区块（不拦截任何操作，不改变按钮可达性）
function scrollToStep(key) {
  const sel = STEP_ANCHORS[key];
  if (!sel) return;
  document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ========== 状态操作（详情页直接推进/打回，不必回列表） ==========

const STATUS_TEXT = { writing: '写稿中', reviewing: '审核中', published: '已发布' };
// 三态工作流：writing → reviewing → published（v2 淘汰"排版中"）
const FLOW = ['writing', 'reviewing', 'published'];
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

// ========== 整改清单（P0-2：打回绑定清单，清零才能推回审核） ==========
// 本地清单副本：勾销即时反映，整表 PATCH 持久化（模式同 material）
const checklist = ref(Array.isArray(props.task.review_checklist) ? [...props.task.review_checklist] : []);
// 打回弹窗状态：input 为多行录入框（手动逐行 / 粘贴老师留言后 AI 整理）
const rejectModal = reactive({ show: false, input: '', loading: false });

// 未完成条数：>0 时推进按钮置灰（体验层提示，后端 400 才是真门禁）
const checklistRemaining = computed(() => checklist.value.filter((i) => !i.done).length);

// 打回：弹窗录入清单（手动逐条 / 粘贴老师留言 AI 整理）
function openRejectModal() {
  rejectModal.show = true;
  rejectModal.input = '';
}

// AI 整理：粘贴的老师微信留言 → 逐条意见（整理后仍可手动增删改）
async function aiOrganizeNotes() {
  if (!rejectModal.input.trim()) return;
  rejectModal.loading = true;
  try {
    const text = await callAI('organize_review_notes', { text: rejectModal.input });
    // 剥离可能的代码块包裹后按 JSON 数组解析
    const arr = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    if (Array.isArray(arr) && arr.length) rejectModal.input = arr.join('\n');
    else error.value = 'AI 未识别出意见，请手动逐行录入';
  } catch (e) {
    error.value = 'AI 整理失败，请手动逐行录入：' + e.message;
  } finally {
    rejectModal.loading = false;
  }
}

// 确认打回：录入内容归一化 → 清单条目，清单与状态一起 PATCH（空录入沿用现有清单，同旧打回行为）
async function confirmReject() {
  const lines = normalizeLines(rejectModal.input);
  const items = lines.length ? lines.map(makeItem) : checklist.value; // 允许空清单直接打回（同现状）
  rejectModal.show = false;
  checklist.value = items;
  await request('/api/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ id: props.task.id, review_checklist: items, status: 'writing' }),
  });
  Object.assign(props.task, { review_checklist: items, status: 'writing' });
  emit('refresh');
}

// 勾销/恢复某条：翻转 done 后整表 PATCH 持久化
async function toggleChecklistItem(item) {
  item.done = !item.done;
  await request('/api/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ id: props.task.id, review_checklist: checklist.value }),
  });
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

// ========== 微信排版预览 + 复制到公众号 ==========

// 模板皮肤：任务级持久化（task.layout_theme），无则回退 localStorage
const themeId = ref(props.task.layout_theme?.id || localStorage.getItem('themeId') || 'greenPink');
// 令牌覆盖：色板 + 圆角/字号/间距滑杆（滑杆 min/max 即 clamp 范围，防破坏性布局）
const themeOverrides = reactive({ ...(props.task.layout_theme?.overrides || {}) });
// 参数面板字段定义：type=color 为色板，type=range 为滑杆（值范围即 clamp）
const OVERRIDES_SCHEMA = [
  { key: 'accentA', label: '强调色A', type: 'color' },
  { key: 'accentB', label: '强调色B', type: 'color' },
  { key: 'radius', label: '卡片圆角', type: 'range', min: 0, max: 24, step: 1, unit: 'px' },
  { key: 'titleFontSize', label: '标题字号', type: 'range', min: 18, max: 28, step: 1, unit: 'px' },
  { key: 'bodyFontSize', label: '正文字号', type: 'range', min: 13, max: 18, step: 1, unit: 'px' },
  { key: 'sectionGap', label: '段落间距', type: 'range', min: 16, max: 60, step: 2, unit: 'px' },
];
const panelOpen = ref(false); // 参数面板默认收起
const galleryOpen = ref(false); // 模板画廊弹窗开关（批1）

watch(themeId, (v) => localStorage.setItem('themeId', v));
// 用户切换预设时清空覆盖（预设即完整方案）；任务切换回填是程序化赋值，由 switching 标记跳过
watch(themeId, () => {
  if (switching) return; // 任务切换时不清空刚回填的覆盖
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
});

// 主题快照进自动保存：皮肤与覆盖变化都触发防抖保存（switching 时由 scheduleAutoSave 内部跳过）
const themeSnapshot = computed(() => JSON.stringify({ id: themeId.value, overrides: themeOverrides }));
watch(themeSnapshot, () => scheduleAutoSave());

// 右侧实时预览：Markdown → 手账卡片风 HTML（标题卡取标题字段，眉标用任务类型；overrides 传令牌覆盖）
const wechatHTML = computed(() =>
  markdownToWechatHTML(content.value, themeId.value, {
    title: title.value, eyebrow: props.task.type, overrides: { ...themeOverrides },
  }),
);
const copied = ref(false);

// 复制富文本到剪贴板：公众号后台 Ctrl+V 直接带格式
async function copyToWechat() {
  const html = wechatHTML.value;
  const text = markdownToPlainText(content.value);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    // 降级：临时节点 + 选区复制（剪贴板 API 不可用的环境）
    const div = document.createElement('div');
    div.innerHTML = html;
    div.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('copy');
    sel.removeAllRanges();
    div.remove();
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 3000);
}

// ========== 只读分享链接（发给审核人，免口令查看） ==========

const shareLink = ref('');

// 生成/重置分享 token，并展示完整链接
async function generateShareLink() {
  error.value = '';
  try {
    const data = await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: props.task.id, generateShare: true }),
    });
    Object.assign(props.task, data.task);
    shareLink.value = `${window.location.origin}/share/${data.task.share_token}`;
  } catch (e) {
    error.value = e.message;
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value);
  } catch {
    // 降级：临时 textarea 选区复制
    const el = document.createElement('textarea');
    el.value = shareLink.value;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
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
    <div class="detail-head">
      <button class="back" @click="emit('back')">← 返回列表</button>
      <h2>{{ task.theme }}</h2>
      <span class="status-tag" :class="task.status">{{ STATUS_TEXT[task.status] || task.status }}</span>
    </div>

    <!-- 流程步骤条：引导不是闸门，不改变任何操作可达性 -->
    <div class="steps-bar">
      <template v-for="(s, i) in steps" :key="s.key">
        <span class="step" :class="{ done: s.done, active: s.active }"
          @click="scrollToStep(s.key)" :title="s.done ? '点击回到该区' : s.label">
          <i>{{ s.done ? '✓' : i + 1 }}</i>{{ s.label }}
        </span>
        <span v-if="i < steps.length - 1" class="step-arrow">›</span>
      </template>
    </div>

    <!-- 素材面板：上传策划书 → AI 提取 → 人工补充 → 一键成稿 -->
    <div class="material-panel">
      <div class="panel-header" @click="materialOpen = !materialOpen">
        📋 素材面板 {{ materialOpen ? '▼' : '▶' }}
        <span v-if="!materialOpen && material.name" class="panel-summary">
          已提取：{{ material.name }} · {{ (materialHighlightsText.match(/[^\n]+/g) || []).length }} 条亮点
        </span>
      </div>
      <div v-if="materialOpen" class="panel-body">
        <div class="upload-area">
          <input type="file" accept=".pdf" :disabled="parsing" @change="onPDFUpload" />
          <span v-if="parsing" class="parsing-hint">AI 正在解析策划书…{{ aiElapsed >= 8 ? `（已等待 ${aiElapsed} 秒）` : '' }}</span>
          <span v-else-if="material.name" class="parsed-ok">已提取：{{ material.name }}</span>
        </div>
        <div v-if="material.name || materialHighlightsText" class="material-fields">
          <label>活动名称</label>
          <input v-model="material.name" />
          <label>时间</label>
          <input v-model="material.time" />
          <label>地点</label>
          <input v-model="material.location" />
          <label>参与对象</label>
          <input v-model="material.target" />
          <label>活动亮点<br />（每行一条）</label>
          <textarea v-model="materialHighlightsText" rows="3"></textarea>
          <label>活动流程<br />（每行一条）</label>
          <textarea v-model="materialFlowText" rows="3"></textarea>
          <label>活动意义</label>
          <textarea v-model="material.meaning" rows="2"></textarea>
        </div>
        <label>现场亮点/补充素材（AI 拿不到的信息）</label>
        <textarea v-model="liveNotes" rows="2" placeholder="活动现场的实际情况、精彩瞬间、数据等"></textarea>
        <label>照片说明（用于配图占位）</label>
        <textarea v-model="photoNotes" rows="2" placeholder="如：开场全景、互动特写、全场大合唱"></textarea>
        <button class="generate-full" :disabled="!material.name || !!aiLoading" @click="generateFullDraft">
          {{ aiLoading === 'draft_from_material' ? '生成中…' : '✨ 一键成稿（基于素材）' }}
        </button>
      </div>
    </div>

    <label>标题</label>
    <input v-model="title" placeholder="推文标题（可点 AI 生成）" />

    <label>摘要</label>
    <textarea v-model="summary" rows="2" placeholder="公众号推送摘要（可点 AI 生成）"></textarea>

    <!-- 分区标题：明确主区为成稿编辑区（P1-4 降密度，只加层级不重排） -->
    <h3 class="zone-title">✍️ 成稿编辑</h3>

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

    <!-- 左右分栏：左 Markdown 编辑，右微信排版实时预览 -->
    <div class="editor-split">
      <div class="editor-left">
        <textarea ref="contentRef" v-model="content" rows="24" placeholder="正文 Markdown：## 小节、> 金句、[配图：说明]、文末署名"></textarea>
        <p class="word-count">{{ content.length }} 字</p>
      </div>
      <div class="editor-right">
        <div class="preview-header">
          <select v-model="themeId" title="模板皮肤">
            <option v-for="(t, k) in THEMES" :key="k" :value="k">{{ t.label }}</option>
          </select>
          <button class="param-toggle" @click="galleryOpen = true" title="浏览全部模板效果">
            🖼 画廊
          </button>
          <button class="param-toggle" @click="panelOpen = !panelOpen" title="排版参数">
            {{ panelOpen ? '收起参数' : '🎨 调参数' }}
          </button>
          <button class="copy-wechat" :disabled="!content" @click="copyToWechat">
            {{ copied ? '✓ 已复制，去公众号粘贴' : '📋 复制到公众号' }}
          </button>
        </div>
        <!-- 参数面板：色板 + 滑杆，即时反映预览（只调令牌，不碰复制链路） -->
        <div v-if="panelOpen" class="param-panel">
          <div v-for="f in OVERRIDES_SCHEMA" :key="f.key" class="param-row">
            <label class="param-label">{{ f.label }}</label>
            <input v-if="f.type === 'color'" type="color" v-model="themeOverrides[f.key]" />
            <template v-else>
              <input type="range" :min="f.min" :max="f.max" :step="f.step" v-model.number="themeOverrides[f.key]" />
              <span class="param-val">{{ themeOverrides[f.key] ?? '默认' }}{{ f.unit }}</span>
            </template>
          </div>
          <button class="param-reset" @click="() => { for (const k of Object.keys(themeOverrides)) delete themeOverrides[k]; }">
            恢复默认
          </button>
        </div>
        <div class="preview-body" v-html="wechatHTML"></div>
      </div>
    </div>
    <p v-if="error" class="error">{{ error }}</p>

    <div class="toolbar">
      <button :disabled="saving" @click="save()">{{ saving ? '保存中…' : '保存' }}</button>
      <button :disabled="saving" @click="runCheck">规范检查</button>
      <!-- 状态操作：按当前状态显示推进/打回 -->
      <!-- 推回审核受整改清单门禁：有未完成条目时置灰（体验层，后端 400 为真门禁） -->
      <button v-if="nextStatus" class="status-btn" :disabled="nextStatus === 'reviewing' && checklistRemaining > 0"
        :title="nextStatus === 'reviewing' && checklistRemaining > 0 ? `整改清单还剩 ${checklistRemaining} 条` : ''"
        @click="changeStatus(nextStatus)">
        推进为{{ STATUS_TEXT[nextStatus] }} →
      </button>
      <button v-if="task.status === 'reviewing'" class="status-btn reject" @click="openRejectModal">
        打回修改
      </button>
      <button v-if="task.status !== 'published'" class="status-btn share" @click="generateShareLink">
        生成分享链接
      </button>
      <span v-if="savedAt" class="saved">{{ autoSaved ? '已自动保存' : '已保存' }} {{ savedAt }}</span>
    </div>
    <!-- 分享链接展示 + 复制（生成后显示） -->
    <div v-if="shareLink" class="share-link">
      <a :href="shareLink" target="_blank" rel="noopener">{{ shareLink }}</a>
      <button @click="copyShareLink">复制</button>
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

    <!-- 整改清单：打回时生成，逐条勾销，清零才能推回审核（仅写稿中且有清单时显示） -->
    <div v-if="checklist.length && task.status === 'writing'" class="checklist">
      <h3>整改清单（剩 {{ checklistRemaining }}/{{ checklist.length }}）</h3>
      <ul>
        <li v-for="item in checklist" :key="item.id" :class="{ done: item.done }">
          <label>
            <input type="checkbox" :checked="item.done" @change="toggleChecklistItem(item)" />
            {{ item.text }}
          </label>
        </li>
      </ul>
      <p v-if="checklistRemaining === 0" class="checklist-ok">✓ 全部完成，可推进到审核</p>
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

    <!-- 打回弹窗：手动逐行 / 粘贴老师留言 AI 整理（P0-2） -->
    <div v-if="rejectModal.show" class="modal-mask" @click.self="rejectModal.show = false">
      <div class="modal">
        <p class="modal-title">打回修改 · 录入整改清单</p>
        <textarea v-model="rejectModal.input" rows="6" placeholder="每行一条整改项；或粘贴老师微信留言后点「AI 整理」"></textarea>
        <div class="modal-btns">
          <button @click="rejectModal.show = false">取消</button>
          <button :disabled="rejectModal.loading" @click="aiOrganizeNotes">
            {{ rejectModal.loading ? '整理中…' : '✨ AI 整理' }}
          </button>
          <button class="primary" @click="confirmReject">打回并生成清单</button>
        </div>
      </div>
    </div>

    <!-- 模板画廊：点卡片应用皮肤；themeId 赋值后既有 watch 自动清覆盖+持久化 -->
    <ThemeGallery v-if="galleryOpen" :current="themeId"
      @select="(id) => { themeId = id; galleryOpen = false; }"
      @close="galleryOpen = false" />
  </section>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: 8px; }
.detail-head { display: flex; align-items: center; gap: 12px; }
.detail-head h2 { margin: 0; flex: 1; font-size: 18px; }
.back { align-self: flex-start; }
.status-tag { font-size: 12px; padding: 2px 10px; border-radius: 10px; background: #eee; color: #666; white-space: nowrap; }
.status-tag.writing { background: #e8f0fe; color: #1a73e8; }
.status-tag.reviewing { background: #fef7e0; color: #b7791f; }
.status-tag.published { background: #eafaf1; color: #27ae60; }
label { font-size: 13px; color: #666; margin-top: 8px; }
input, textarea, select { padding: 8px 10px; font-family: inherit; }
textarea { resize: vertical; }

/* 素材面板 */
.material-panel { border: 1px solid #e6e2d9; border-radius: 8px; overflow: hidden; }
.panel-header { padding: 10px 12px; background: #faf8f3; cursor: pointer; font-weight: 600; font-size: 14px; user-select: none; }
.panel-summary { font-size: 12px; color: #999; margin-left: 8px; font-weight: 400; } /* 收起态摘要：活动名+亮点条数 */
.panel-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #f0ede5; }
.upload-area { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.parsing-hint { color: #1a73e8; font-size: 13px; }
.parsed-ok { color: #27ae60; font-size: 13px; }
.material-fields { display: grid; grid-template-columns: 100px 1fr; gap: 8px 10px; align-items: start; background: #fcfbf8; padding: 10px; border-radius: 6px; }
.material-fields label { margin: 6px 0 0; }
.generate-full { padding: 10px; background: #27ae60; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.generate-full:disabled { background: #a8d5bd; cursor: not-allowed; }

/* 左右分栏编辑区 */
.editor-split { display: flex; gap: 12px; align-items: stretch; margin-top: 4px; }
.editor-left { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.editor-left textarea { flex: 1; }
.editor-right { flex: 1; display: flex; flex-direction: column; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; min-width: 0; }
.preview-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; background: #fafafa; border-bottom: 1px solid #eee; }
.preview-header select { padding: 4px 8px; font-size: 13px; }
.copy-wechat { padding: 6px 12px; background: #1e88e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap; }
.copy-wechat:disabled { background: #bbb; }
.preview-body { overflow-y: auto; max-height: 660px; background: #ebebeb; }
.word-count { color: #999; font-size: 12px; margin: 0; }

.toolbar { display: flex; align-items: center; gap: 12px; }
.saved { color: #27ae60; font-size: 13px; }
.zone-title { font-size: 14px; color: #555; margin: 12px 0 4px; border-left: 3px solid #53de7b; padding-left: 8px; } /* 分区标题（P1-4） */
.ai-toolbar { display: flex; gap: 8px; margin-top: 4px; }
.ai-toolbar button { padding: 6px 12px; }
/* P2-7：AI 等待进度提示 */
.ai-progress { color: #b7791f; font-size: 13px; margin: 4px 0; }
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
.status-btn.share { background: #8e44ad; }
.share-link { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.share-link a { color: #8e44ad; word-break: break-all; }
.share-link button { padding: 4px 10px; }

/* 窄屏：编辑与预览改为上下布局 */
@media (max-width: 768px) {
  .editor-split { flex-direction: column; }
  .preview-body { max-height: 480px; }
}

/* 排版参数面板（P0-1）：编辑器侧 UI，非微信预览内容 */
.param-toggle { padding: 4px 10px; font-size: 12px; }
.param-panel { border: 1px dashed #d8cfc0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
.param-row { display: flex; align-items: center; gap: 8px; }
.param-label { font-size: 12px; color: #666; width: 64px; margin: 0; }
.param-row input[type='range'] { flex: 1; }
.param-row input[type='color'] { width: 40px; height: 26px; padding: 0; border: 1px solid #ddd; border-radius: 4px; }
.param-val { font-size: 12px; color: #999; width: 48px; text-align: right; }
.param-reset { grid-column: 1 / -1; font-size: 12px; color: #999; }

/* 整改清单（P0-2）：打回生成的待勾销条目区 */
.checklist { border: 1px solid #e6d9c8; border-radius: 8px; padding: 10px 14px; background: #fdf9f2; }
.checklist h3 { margin: 0 0 8px; font-size: 14px; }
.checklist ul { list-style: none; padding: 0; margin: 0; }
.checklist li { padding: 4px 0; font-size: 14px; }
.checklist li.done { color: #999; text-decoration: line-through; }
.checklist-ok { color: #27ae60; font-size: 13px; margin: 6px 0 0; }
/* 打回弹窗主按钮：与打回按钮同色系（橙） */
.modal-btns .primary { background: #e67e22; color: #fff; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; }

/* 流程步骤条（P1-3）：编辑器侧引导 UI，点击平滑滚动到对应区块 */
.steps-bar { display: flex; align-items: center; gap: 6px; padding: 6px 0; flex-wrap: wrap; }
.step { font-size: 12px; color: #999; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.step i { font-style: normal; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; border: 1px solid #ccc; font-size: 11px; }
.step.done { color: #27ae60; }
.step.done i { background: #eafaf1; border-color: #27ae60; }
.step.active { color: #1a73e8; font-weight: bold; }
.step.active i { background: #e8f0fe; border-color: #1a73e8; }
.step-arrow { color: #ddd; }
</style>
