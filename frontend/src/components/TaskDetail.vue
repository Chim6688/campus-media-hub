<script setup>
import { ref, reactive, computed, nextTick, watch } from 'vue';
import { request, uploadPDF, listImages } from '../api/client.js';
import { markdownToWechatHTML, markdownToPlainText } from '../utils/wechat-format.js';
import { THEMES } from '../utils/themes.js';
import { computeSteps } from '../utils/steps.js'; // 流程步骤条纯函数（P1-3）
import { buildPrecheck } from '../utils/precheck.js'; // 发布前检查纯函数（Phase 6，§20）
import { ensureSignatureText } from '../utils/signature.js'; // 文末署名纯函数（与 StepWriting 共用）
import { useAutoSave } from '../composables/useAutoSave.js'; // 自动保存统一通道（总方案 §8）
import { useAiTools } from '../composables/useAiTools.js'; // AI 调用封装 + 等待进度（素材一键成稿用）
import StepCheck from './steps/StepCheck.vue'; // ⑤ 检查步（拆分自本组件）
import StepReview from './steps/StepReview.vue'; // ⑥ 审核步 + 打回弹窗（拆分自本组件）
import StepWriting from './steps/StepWriting.vue'; // ② 写稿步 + AI 工具条与弹窗（拆分自本组件）
import ThemeGallery from './ThemeGallery.vue'; // 模板画廊弹窗（批1）
import ImageWorkspace from './ImageWorkspace.vue'; // 配图工作台（V1.0 Phase 3）
import VisualPanel from './visual/VisualPanel.vue'; // 视觉设计面板（V1.0 Phase 1）
import VisualTemplateSelector from './visual/VisualTemplateSelector.vue'; // 风格三选一（Phase 2）
import VisionSkinModal from './VisionSkinModal.vue'; // AI 配色弹窗（描述+识图双模式，Phase 5）

const props = defineProps({ task: Object });
const emit = defineEmits(['back', 'refresh']);

const title = ref(props.task.title || '');
const summary = ref(props.task.summary || '');
const content = ref(props.task.content || '');
// saving/savedAt/autoSaved 由 useAutoSave 提供；aiLoading/aiElapsed 由 useAiTools 提供
const error = ref('');

// ========== 通用输入弹窗已随 StepWriting 下沉（useAskUser 在写稿步组件内使用） ==========

// ========== 素材面板（策划书解析 + 人工补充） ==========
const parsing = ref(false);
// 结构化素材：highlights/flow 面板中按行编辑，提交时拆数组
const material = reactive({ name: '', time: '', location: '', target: '', meaning: '', confirmed: false }); // confirmed=素材已核实（§15）
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
  material.confirmed = m?.confirmed === true; // 已核实开关回填（§15 事实确认）
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

// switching：任务切换回填保护标记（resetEditor 使用；回填触发的编辑源 watch 在保护内跳过自动保存）
let switching = false;

// ========== 自动保存（总方案 §8 单通道，逻辑在 useAutoSave composable；宿主只供数据/落库/反馈） ==========
// 素材序列化快照：任一素材字段变化都触发防抖保存
const materialSnapshot = computed(() => JSON.stringify(materialPayload()));

// 保存 body 组装：doSave 时此刻读取最新全量编辑态（防抖合并后取最后一次）
function buildSaveBody() {
  ensureSignature(); // 双保险：保存时无署名则自动追加
  const body = {
    id: props.task.id,
    title: title.value,
    summary: summary.value,
    content: content.value,
    layout_theme: { id: themeId.value, overrides: { ...themeOverrides }, stylePreset: stylePreset.value }, // 排版主题+结构风格随任务持久化
  };
  if (hasMaterial()) body.material = materialPayload(); // 素材随文稿一起持久化
  if (visualState.value) body.visual_state = visualState.value; // v6：视觉编辑态（构图/槽位/卡文案/选图）
  return body;
}

async function persistTask(body) {
  await request('/api/tasks', { method: 'PATCH', body: JSON.stringify(body) });
}

// 返回 saving/savedAt/autoSaved/save/markDirty/cancelPending（宿主调用点与模板引用同名）
const { saving, savedAt, autoSaved, markDirty, save, cancelPending } = useAutoSave({
  getBody: buildSaveBody,
  persist: persistTask,
  isSwitching: () => switching,
  onError: (msg) => { error.value = msg; },
  onSaved: () => emit('refresh'), // 同步列表数据
});

watch([title, summary, content, materialSnapshot], markDirty);

// 署名双保险：文末无"责编 | 姓名"格式时自动追加（规范检查硬性要求；纯函数见 utils/signature.js）
function ensureSignature() {
  content.value = ensureSignatureText(content.value, props.task.author);
}

// ========== AI 工具条（useAiTools composable：callAI 封装 + aiLoading 禁用态 + 等待进度 P2-7） ==========
const { aiLoading, aiElapsed, callAI, startElapse, stopElapse } = useAiTools();

// 写稿步的 AI 生成/改写/标题候选逻辑已随 StepWriting 组件下沉（含三个弹窗）；
// 父级保留 title/summary/content 数据源与自动保存链路，v-model 双向直连

// ========== 工作流步骤导航（V1.0 Phase 1：分步引导工作台） ==========
// 六步完成度由纯函数计算；activeStep 是本地 UI 态（当前展示哪一步的操作面板）
// boundImages：配图工作台上报的绑定正文图（Phase 4 同源数据：步骤条计数 + 预览/复制渲染）
// coverOk：是否有封面（Phase 6 发布前检查）
const boundImages = ref([]);
const coverOk = ref(false);
// 视觉图是否已生成（Phase 7：source='ai' 的图片存在，步骤条与发布检查共用）
const visualOk = ref(false);
const steps = computed(() => computeSteps(props.task, boundImages.value.length, visualOk.value));
const activeStep = ref(steps.value.find((s) => s.active)?.key || 'material');

// AI 视觉设计配色应用（V2 Phase 2）：8 色进 themeOverrides（复用 AI 配色的应用语义：清空覆盖写整套）
function onVisualColors(colors) {
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
  Object.assign(themeOverrides, colors); // 自动保存链路既有（themeSnapshot watch）
}

// 固定步序：上一步/下一步按此导航（纯 UI 引导，不做任何校验拦截）；Phase 2 起含视觉步
const STEP_ORDER = ['material', 'draft', 'images', 'visual', 'layout', 'check', 'review'];
const prevStep = computed(() => STEP_ORDER[STEP_ORDER.indexOf(activeStep.value) - 1] || null);
const nextStep = computed(() => STEP_ORDER[STEP_ORDER.indexOf(activeStep.value) + 1] || null);
const stepLabel = (key) => steps.value.find((s) => s.key === key)?.label || key;
function gotoStep(key) {
  activeStep.value = key;
}

// ========== 状态操作（详情页直接推进/打回，不必回列表） ==========

const STATUS_TEXT = { writing: '写稿中', reviewing: '审核中', published: '已发布' };
// 三态工作流：writing → reviewing → published（v2 淘汰"排版中"；推进按钮在检查/审核步骤内按状态显示）

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

// 未完成条数：>0 时推进按钮置灰（体验层提示，后端 400 才是真门禁）
const checklistRemaining = computed(() => checklist.value.filter((i) => !i.done).length);

// 打回执行（StepReview 打回弹窗上抛已归一化的条目；空数组=空录入，沿用现有清单同旧打回行为）
async function applyReject(items) {
  const final = items.length ? items : checklist.value;
  checklist.value = final;
  error.value = '';
  try {
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: props.task.id, review_checklist: final, status: 'writing' }),
    });
    Object.assign(props.task, { review_checklist: final, status: 'writing' });
    emit('refresh');
  } catch (e) {
    // P0：打回失败可见（此前静默 unhandled）；清单留在本地，下次勾销/打回全量 PATCH 会自然收敛
    error.value = `打回失败：${e.message}`;
  }
}

// 勾销/恢复某条：翻转 done 后整表 PATCH 持久化
async function toggleChecklistItem(item) {
  const prev = item.done;
  item.done = !prev;
  error.value = '';
  try {
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: props.task.id, review_checklist: checklist.value }),
    });
  } catch (e) {
    item.done = prev; // P0：失败回滚勾选态，避免本地与服务端不一致
    error.value = `清单保存失败：${e.message}`;
  }
}

// ========== 规范检查 ==========

const report = ref(null);

// 发布前检查清单（Phase 6，§20）：本地可算项实时刷新；规范检查项需点按钮跑一次
// 用当前编辑态（title/summary/content/material）+ 配图工作台上报状态计算
const precheckItems = computed(() =>
  buildPrecheck(
    { title: title.value, summary: summary.value, content: content.value, material: materialPayload() },
    { coverOk: coverOk.value, boundCount: boundImages.value.length, visualOk: visualOk.value, report: report.value },
  ),
);
// 提交门禁只看阻断项（block）；建议项（视觉图=Warning，总方案 §9）不拦提交——作者端/审核端同一判定
const precheckReady = computed(() => precheckItems.value.filter((i) => i.block !== false).every((i) => i.ok));
// 未满足的建议项数：核心通过但建议未做时，状态行提示"可提交"
const precheckAdvisoryCount = computed(() => precheckItems.value.filter((i) => i.block === false && !i.ok).length);

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

// ========== 微信排版预览 + 复制到公众号 ==========

// 模板皮肤：任务级持久化（task.layout_theme），无则回退 localStorage
const themeId = ref(props.task.layout_theme?.id || localStorage.getItem('themeId') || 'greenPink');
// 令牌覆盖：色板 + 圆角/字号/间距滑杆（滑杆 min/max 即 clamp 范围，防破坏性布局）
const themeOverrides = reactive({ ...(props.task.layout_theme?.overrides || {}) });
// 结构风格（Phase 2）：任务级持久化于 layout_theme.stylePreset，缺省 journal（历史数据零迁移兼容）
const stylePreset = ref(props.task.layout_theme?.stylePreset || 'journal');
// 视觉设计编辑态（v6，总方案 §7.1）：VisualPanel v-model 维护 → save() 并入 tasks.visual_state
// 只在编辑上抛时更新；切换任务重置见 watch(task.id) 块
const visualState = ref(props.task.visual_state || null);
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

// AI 配色弹窗（Phase 5 抽组件）：apply 回调统一处理两种模式的结果
const skinModal = ref(false);
function openSkinModal() { skinModal.value = true; }
// 应用：colors 覆盖 8 色令牌；stylePreset 非空时同步结构风格（识图模式才有）
// 参数重命名为 preset，避免解构变量遮蔽外部 stylePreset ref 导致 .value 赋值失效
function onSkinApply({ colors, stylePreset: preset }) {
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
  Object.assign(themeOverrides, colors);
  if (preset) stylePreset.value = preset;
  skinModal.value = false; // 关弹窗，预览即时刷新+防抖自动保存（既有链路）
}

watch(themeId, (v) => localStorage.setItem('themeId', v));
// 用户切换预设时清空覆盖（预设即完整方案）；任务切换回填是程序化赋值，由 switching 标记跳过
watch(themeId, () => {
  if (switching) return; // 任务切换时不清空刚回填的覆盖
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
});

// 主题快照进自动保存：皮肤与覆盖变化都触发防抖保存（switching 时由 markDirty 内部跳过）
const themeSnapshot = computed(() => JSON.stringify({ id: themeId.value, overrides: themeOverrides, stylePreset: stylePreset.value }));
watch(themeSnapshot, () => markDirty());
// 视觉编辑态进自动保存（v6）：VisualPanel 每次编辑上抛新对象 → markDirty 防抖统一通道（§8 单通道）
watch(visualState, () => markDirty());

// 右侧实时预览：Markdown → 手账卡片风 HTML（标题卡取标题字段，眉标用任务类型；overrides 传令牌覆盖）
// images：配图工作台上报的绑定图（Phase 4 与复制/分享同源，占位→真实 <img>）
const wechatHTML = computed(() =>
  markdownToWechatHTML(content.value, themeId.value, {
    title: title.value, eyebrow: props.task.type, overrides: { ...themeOverrides }, images: boundImages.value,
    stylePreset: stylePreset.value, // Phase 2：结构风格进预览与复制（同源）
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

// 拉最新任务数据（含 comments），StepReview 批注提交后 refresh-task 事件绑定此
async function emitRefreshAndGet() {
  emit('refresh');
  const data = await request('/api/tasks');
  const fresh = data.tasks.find((t) => t.id === props.task.id);
  if (fresh) Object.assign(props.task, fresh);
}

// ========== 任务切换统一收口（总方案 §10 第三层 resetEditor） ==========
// 编辑态重置/信号回填只经此一处，任何子组件不得自己监听 task.id；
// 置于 script 末尾：所有编辑态 ref（themeId/checklist/visualState 等）已声明完毕，
// immediate watch 首次同步执行时无前向引用风险。
// switching 保护整段回填：编辑源 watch 触发的 markDirty 在保护内跳过（不触发自动保存覆盖）
function resetEditor(task) {
  switching = true;
  title.value = task.title || '';
  summary.value = task.summary || '';
  content.value = task.content || '';
  fillMaterial(task.material);
  // 排版主题回填：优先任务级 layout_theme，无则回退全局记忆
  themeId.value = task.layout_theme?.id || localStorage.getItem('themeId') || 'greenPink';
  for (const k of Object.keys(themeOverrides)) delete themeOverrides[k];
  Object.assign(themeOverrides, task.layout_theme?.overrides || {});
  stylePreset.value = task.layout_theme?.stylePreset || 'journal';
  // 视觉设计编辑态回填（v6）：VisualPanel 重进视觉步时按此恢复
  visualState.value = task.visual_state || null;
  // 整改清单回填：旧任务无清单 → 空数组（不阻塞推进）
  checklist.value = Array.isArray(task.review_checklist) ? [...task.review_checklist] : [];
  cancelPending(); // 放弃旧任务未触发的 pending 编辑（脏标记与计时器一起清）
  // 图片/视觉信号清零后落到计算出的当前步（纯展示切换，不触发保存链路）
  boundImages.value = [];
  coverOk.value = false;
  visualOk.value = false;
  activeStep.value = steps.value.find((s) => s.active)?.key || 'material';
  // 回填触发的编辑源 watch（flush pre）在微任务队列先于 nextTick 执行，此时 switching 仍为 true → 安全
  nextTick(async () => {
    switching = false;
    await refreshSignals(task.id); // 拉图回填 bound/cover/visualOk（首挂与切换共用）
  });
}

// 拉取任务图片并回填信号（封面/绑定数/视觉图 OK）：切换重置与视觉面板变更共用
async function refreshSignals(taskId) {
  try {
    const data = await listImages(taskId);
    const imgs = data.images || [];
    boundImages.value = imgs.filter((i) => i.type === 'content' && i.position > 0)
      .sort((a, b) => a.position - b.position);
    coverOk.value = imgs.some((i) => i.type === 'cover');
    visualOk.value = imgs.some((i) => i.source === 'ai');
  } catch { /* 静默失败：视觉面板打开时会自行刷新，下次进入步骤自然同步 */ }
}

// 视觉面板图片变更（Phase 3+4）：封面生成/章节卡绑定后，重拉图片同步步骤条与封面状态
function onVisualImagesChange() {
  refreshSignals(props.task.id);
}

// 任务切换：编辑态整体重置（immediate 覆盖首次挂载；此后 props.task.id 变化即重置）
watch(() => props.task.id, (newId) => {
  if (newId) resetEditor(props.task);
}, { immediate: true });
</script>

<template>
  <section class="detail">
    <!-- 头部：返回 + 标题行内编辑 + 状态 + 保存（标题随时可改，自动保存兜底） -->
    <div class="detail-head">
      <button class="back" @click="emit('back')">← 返回列表</button>
      <input v-model="title" class="head-title" placeholder="推文标题（可点 AI 生成）" />
      <span class="status-tag" :class="task.status">{{ STATUS_TEXT[task.status] || task.status }}</span>
      <button :disabled="saving" @click="save()">{{ saving ? '保存中…' : '保存' }}</button>
      <span v-if="savedAt" class="saved">{{ autoSaved ? '已自动保存 ✓' : '已保存 ✓' }} {{ savedAt }}</span>
    </div>

    <!-- 六步工作流步骤条：点击切换左侧操作面板（引导不是闸门，不改变任何操作可达性） -->
    <div class="steps-bar">
      <template v-for="(s, i) in steps" :key="s.key">
        <span class="step" :class="{ done: s.done, active: s.key === activeStep }" @click="gotoStep(s.key)"
          :title="s.done ? '已完成，点击返回查看' : '点击切换到该步'">
          <i>{{ s.done ? '✓' : i + 1 }}</i>{{ s.label }}
        </span>
        <span v-if="i < steps.length - 1" class="step-arrow">›</span>
      </template>
    </div>

    <!-- 全局错误/提示：所有步骤共用的操作反馈 -->
    <p v-if="error" class="error">{{ error }}</p>

    <!-- 工作台两栏：左=当前步骤操作区（随 activeStep 切换），右=公众号预览（常驻） -->
    <div class="workbench">
      <div class="step-panel">

        <!-- ① 素材：上传策划书 → AI 提取 → 人工补充 → 一键成稿 -->
        <div v-if="activeStep === 'material'" class="material-panel">
          <div class="panel-body">
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
        <!-- 事实确认开关（§15）：勾选后随素材持久化；发布前检查必检项 -->
        <label class="confirm-facts">
          <input type="checkbox" v-model="material.confirmed" />
          素材已核实（关键事实与策划方/现场确认无误，未确认信息已修正或删除）
        </label>
        <button class="generate-full" :disabled="!material.name || !!aiLoading" @click="generateFullDraft">
              {{ aiLoading === 'draft_from_material' ? '生成中…' : '✨ 一键成稿（基于素材）' }}
            </button>
          </div>
        </div>

        <!-- ② 写稿：摘要 + AI 工具条 + 正文 Markdown 编辑（UI 与 AI 交互在 StepWriting，v-model 双向直连） -->
        <template v-else-if="activeStep === 'draft'">
          <StepWriting v-model:title="title" v-model:summary="summary" v-model:content="content"
            :author="task.author" :theme="task.theme" :type="task.type" />
        </template>

        <!-- ③ 配图：封面/槽位/图片库工作台；photoNotes/content 双向绑定走既有自动保存链路 -->
        <template v-else-if="activeStep === 'images'">
          <ImageWorkspace :task-id="task.id" v-model:photo-notes="photoNotes" v-model:content="content"
            :title="title" :summary="summary" :material="materialPayload()"
            @bound-change="boundImages = $event" @cover-change="coverOk = $event" />
        </template>

        <!-- ④ 视觉设计（Phase 2 起独立成步）：真实数据装配 → 模板渲染 → PNG 导出上传落库；封面直生效、章节卡绑槽位 -->
        <template v-else-if="activeStep === 'visual'">
          <VisualPanel :task-id="task.id" :title="title" :summary="summary" v-model:content="content" :material="materialPayload()"
            :theme-id="themeId" :theme-overrides="{ ...themeOverrides }" v-model:style-preset="stylePreset"
            v-model:visual-state="visualState" :bound-images="boundImages"
            @images-change="onVisualImagesChange" @apply-colors="onVisualColors" />
          <p class="step-hint">生成视觉图自动进入文章：封面直接生效，章节卡绑定正文图位</p>
        </template>

        <!-- ④ 排版：模板/画廊/AI配色/调参数，右侧预览实时刷新 -->
        <template v-else-if="activeStep === 'layout'">
          <div class="layout-controls">
            <select v-model="themeId" title="模板皮肤">
              <option v-for="(t, k) in THEMES" :key="k" :value="k">{{ t.label }}</option>
            </select>
            <VisualTemplateSelector v-model="stylePreset" />
            <button class="param-toggle" @click="galleryOpen = true" title="浏览全部模板效果">
              🖼 画廊
            </button>
            <button class="param-toggle" @click="openSkinModal" title="AI 按描述生成配色">
              ✨ AI 配色
            </button>
            <button class="param-toggle" @click="panelOpen = !panelOpen" title="排版参数">
              {{ panelOpen ? '收起参数' : '🎨 调参数' }}
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
          <p class="step-hint">右侧预览实时反映排版效果，满意后进入下一步</p>
        </template>

        <!-- ⑤ 发布前检查（Phase 6，§20）：九项清单 + 🟢/🔴 状态 + 提交审核（UI 在 StepCheck，状态/门禁仍在本父级） -->
        <template v-else-if="activeStep === 'check'">
          <StepCheck :task="task" :precheck-items="precheckItems" :precheck-ready="precheckReady"
            :precheck-advisory-count="precheckAdvisoryCount" :report="report" :checklist="checklist" :saving="saving"
            @run-check="runCheck" @toggle="toggleChecklistItem" @submit="changeStatus('reviewing')" />
        </template>

        <!-- ⑥ 审核：状态推进/打回 + 分享链接 + 批注；published 态 = 发布准备（Phase 8，§23） -->
        <template v-else>
          <StepReview :task="task" :share-link="shareLink"
            @pass="changeStatus('published')" @reject="applyReject"
            @generate-share="generateShareLink" @refresh-task="emitRefreshAndGet"
            @copy-wechat="copyToWechat" />
        </template>
      </div>

      <!-- 常驻公众号预览：排版/写稿改动实时反映；复制按钮随时可用 -->
      <div class="preview-pane">
        <div class="preview-header">
          <span class="preview-tag">📱 公众号预览</span>
          <button class="copy-wechat" :disabled="!content" @click="copyToWechat">
            {{ copied ? '✓ 已复制，去公众号粘贴' : '📋 复制到公众号' }}
          </button>
        </div>
        <div class="preview-body" v-html="wechatHTML"></div>
      </div>
    </div>

    <!-- 底部步骤导航：纯 UI 引导，不做校验拦截 -->
    <div class="step-nav">
      <button :disabled="!prevStep" @click="gotoStep(prevStep)">← 上一步{{ prevStep ? '：' + stepLabel(prevStep) : '' }}</button>
      <button class="next" :disabled="!nextStep" @click="gotoStep(nextStep)">下一步{{ nextStep ? '：' + stepLabel(nextStep) : '' }} →</button>
    </div>

    <!-- 模板画廊：点卡片应用皮肤；themeId 赋值后既有 watch 自动清覆盖+持久化 -->
    <ThemeGallery v-if="galleryOpen" :current="themeId"
      @select="(id) => { themeId = id; galleryOpen = false; }"
      @close="galleryOpen = false" />

    <!-- AI 配色弹窗（Phase 5）：描述生成 + 参考图识别双模式 -->
    <VisionSkinModal :show="skinModal" @close="skinModal = false" @apply="onSkinApply" />
  </section>
</template>

<style scoped>
.detail { display: flex; flex-direction: column; gap: 8px; }
.detail-head { display: flex; align-items: center; gap: 12px; }
.back { align-self: flex-start; }
.status-tag { font-size: 12px; padding: 2px 10px; border-radius: 10px; background: #eee; color: #666; white-space: nowrap; }
.status-tag.writing { background: #e8f0fe; color: #1a73e8; }
.status-tag.reviewing { background: #fef7e0; color: #b7791f; }
.status-tag.published { background: #eafaf1; color: #27ae60; }
label { font-size: 13px; color: #666; margin-top: 8px; }
input, textarea, select { padding: 8px 10px; font-family: inherit; }
textarea { resize: vertical; }

/* 素材面板（工作台①：面板常展开，无折叠头） */
.material-panel { border: 1px solid #e6e2d9; border-radius: 8px; overflow: hidden; }
.panel-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.upload-area { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.parsing-hint { color: #1a73e8; font-size: 13px; }
.parsed-ok { color: #27ae60; font-size: 13px; }
.material-fields { display: grid; grid-template-columns: 100px 1fr; gap: 8px 10px; align-items: start; background: #fcfbf8; padding: 10px; border-radius: 6px; }
.material-fields label { margin: 6px 0 0; }
.generate-full { padding: 10px; background: #27ae60; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.generate-full:disabled { background: #a8d5bd; cursor: not-allowed; }

/* 工作台两栏：左=步骤操作区（随 activeStep 切换），右=预览常驻 */
.workbench { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.step-panel { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
/* 常驻预览面板：随窗口滚动吸附视口 */
.preview-pane { border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; position: sticky; top: 12px; min-width: 0; }
.preview-tag { font-size: 13px; font-weight: 600; color: #555; }
.preview-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; background: #fafafa; border-bottom: 1px solid #eee; }
.copy-wechat { padding: 6px 12px; background: #1e88e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap; }
.copy-wechat:disabled { background: #bbb; }
.preview-body { overflow-y: auto; max-height: 620px; background: #ebebeb; }
/* 排版步控制条 */
.layout-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.layout-controls select { padding: 6px 8px; font-size: 13px; }
/* 头部标题行内编辑 */
.head-title { flex: 1; font-size: 16px; font-weight: 600; min-width: 120px; }
/* 步骤提示行 */
.step-hint { font-size: 12px; color: #999; margin: 0; }
/* 底部步骤导航：上一步灰置，下一步主按钮 */
.step-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; }
.step-nav .next { background: #1e88e5; color: #fff; border: none; border-radius: 4px; padding: 8px 20px; cursor: pointer; }
.step-nav button:disabled { opacity: 0.4; cursor: not-allowed; }

.saved { color: #27ae60; font-size: 13px; white-space: nowrap; }
.error { color: #c0392b; white-space: pre-wrap; margin: 0; }

/* 窄屏：工作台两栏改上下堆叠，预览不再吸附（延续 C 批响应式结论） */
@media (max-width: 768px) {
  .workbench { grid-template-columns: 1fr; }
  .preview-pane { position: static; }
  .preview-body { max-height: 480px; }
  /* C 批：工具条/预览头/详情头换行，多按钮不再溢出 */
  .detail-head { flex-wrap: wrap; }
  .preview-header { flex-wrap: wrap; }
  .step-nav { flex-wrap: wrap; }
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

/* 素材已核实开关（§15） */
.confirm-facts { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #555; }
.confirm-facts input { margin: 0; }

/* 流程步骤条（P1-3）：编辑器侧引导 UI，点击平滑滚动到对应区块 */
.steps-bar { display: flex; align-items: center; gap: 6px; padding: 6px 0; flex-wrap: wrap; }
.step { font-size: 12px; color: #999; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.step i { font-style: normal; width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; border: 1px solid #ccc; font-size: 11px; }
.step.done { color: #27ae60; }
.step.done i { background: #eafaf1; border-color: #27ae60; }
.step.active { color: #1a73e8; font-weight: bold; }
.step.active i { background: #e8f0fe; border-color: #1a73e8; }
.step-arrow { color: #ddd; }

/* AI 配色弹窗提示行（B 批） */
.skin-tip { font-size: 12px; color: #999; margin: 8px 0 0; }

/* 窄屏（C 批）：参数面板与素材字段单列化，标签+滑杆不再同行挤压。
   注：置于 .param-panel 基础规则之后，确保窄屏覆盖在层叠中生效 */
@media (max-width: 768px) {
  .param-panel { grid-template-columns: 1fr; }
  .material-fields { grid-template-columns: 1fr; }
}
</style>
