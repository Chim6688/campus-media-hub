<script setup>
// 审核工作台（V1.0 Phase 7，§22）：审核人通过 /share/:token 免口令访问
// 左=完整公众号预览；右=检查结果（八项）+ 整改清单进度 + 审核意见 + [退回修改][审核通过]
// 审核写操作走 share_token 认证的 POST /api/share（approve 仅限审核中）
import { ref, reactive, computed, onMounted } from 'vue';
import { request } from '../api/client.js';
import { markdownToWechatHTML } from '../utils/wechat-format.js';
import { buildPrecheck } from '../utils/precheck.js';

const props = defineProps({ token: String });

const task = ref(null);
const images = ref([]); // 绑定图片（预览与编辑器/复制同源）
const report = ref(null); // 后端规范检查报告（share GET 附带）
const comments = ref([]); // 批注列表（本地态：提交后即时追加展示）
const loading = ref(true);
const error = ref('');
const acting = ref(''); // 进行中的审核操作（按钮禁用态）
const commentText = ref(''); // 批注输入
// 退回弹窗：多行录入整改清单（分享页无口令，AI 整理不可用，手动逐行）
const rejectModal = reactive({ show: false, input: '' });

const STATUS_TEXT = { writing: '写稿中', reviewing: '审核中', published: '已发布' };

// 只读渲染：默认绿粉皮肤（审核人看到与作者一致的排版效果；images 传绑定正文图）
const html = computed(() =>
  markdownToWechatHTML(task.value?.content || '', 'greenPink', {
    title: task.value?.title,
    eyebrow: task.value?.type,
    images: images.value,
  }),
);

// 八项检查清单：复用发布前检查纯函数（审核人与作者看到同一套标准）
const precheckItems = computed(() =>
  task.value
    ? buildPrecheck(task.value, {
        coverOk: images.value.some((i) => i.type === 'cover'),
        boundCount: images.value.filter((i) => i.type === 'content' && i.position > 0).length,
        report: report.value,
      })
    : [],
);
const precheckReady = computed(() => precheckItems.value.every((i) => i.ok));
const undoneChecklist = computed(() => (task.value?.review_checklist || []).filter((i) => !i.done).length);

onMounted(async () => {
  try {
    const data = await request(`/api/share?token=${encodeURIComponent(props.token)}`);
    task.value = data.task;
    images.value = data.images || [];
    report.value = data.report || null;
    comments.value = data.task.comments || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

// 审核操作统一入口：POST /api/share?token=（token 即凭证；成功后刷新视图状态）
async function act(action, text) {
  acting.value = action;
  error.value = '';
  try {
    const data = await request(`/api/share?token=${encodeURIComponent(props.token)}`, {
      method: 'POST',
      body: JSON.stringify({ action, text }),
    });
    if (action === 'comment') {
      comments.value.push({ by: '审核人', text, at: new Date().toISOString() });
      return;
    }
    task.value.status = data.status; // approve→published / reject→writing
    if (action === 'reject') {
      task.value.review_checklist = data.checklist || [];
      rejectModal.show = false;
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    acting.value = '';
  }
}
</script>

<template>
  <section class="share-view">
    <p v-if="loading" class="hint">加载中…</p>
    <p v-else-if="error && !task" class="hint error">{{ error }}</p>
    <template v-else>
      <!-- 头部：任务标题 + 状态 + 作者 -->
      <div class="desk-head">
        <h2>{{ task.title || task.theme }}</h2>
        <span class="status-tag" :class="task.status">{{ STATUS_TEXT[task.status] || task.status }}</span>
        <span class="author">作者：{{ task.author }}</span>
      </div>
      <p v-if="error" class="hint error">{{ error }}</p>

      <!-- 两栏：左完整预览 | 右审核面板 -->
      <div class="desk-split">
        <div class="article" v-html="html"></div>

        <aside class="review-pane">
          <h3>检查结果</h3>
          <ul class="pc-list">
            <li v-for="item in precheckItems" :key="item.name" :class="item.ok ? 'ok' : 'bad'">
              <span class="pc-mark">{{ item.ok ? '✓' : '✗' }}</span>{{ item.name }}
              <span v-if="!item.ok" class="pc-hint">{{ item.hint }}</span>
            </li>
          </ul>
          <p class="pc-state" :class="precheckReady ? 'ready' : 'blocked'">
            {{ precheckReady ? '🟢 检查全部通过' : '🔴 有未通过项（供参考，审核人可自行判断）' }}
          </p>

          <!-- 整改清单进度：打回后作者逐条勾销，审核人可见 -->
          <div v-if="task.review_checklist?.length" class="checklist">
            <h3>整改清单（{{ task.review_checklist.filter((i) => i.done).length }}/{{ task.review_checklist.length }} 已完成）</h3>
            <ul>
              <li v-for="item in task.review_checklist" :key="item.id" :class="{ done: item.done }">
                {{ item.done ? '☑' : '☐' }} {{ item.text }}
              </li>
            </ul>
          </div>

          <!-- 审核意见：任意状态可批注 -->
          <h3>审核意见</h3>
          <div class="comment-box">
            <textarea v-model="commentText" rows="3" placeholder="如：第二段数据请核实；结尾再加一句展望"></textarea>
            <button :disabled="!commentText.trim() || !!acting" @click="act('comment', commentText.trim()); commentText = ''">
              {{ acting === 'comment' ? '提交中…' : '提交批注' }}
            </button>
          </div>
          <ul v-if="comments.length" class="comments">
            <li v-for="(c, n) in comments" :key="n">
              <b>{{ c.by }}</b>：{{ c.text }}
            </li>
          </ul>

          <!-- 审核操作：仅审核中可见（approve/reject 后端二次校验状态） -->
          <div v-if="task.status === 'reviewing'" class="review-actions">
            <button class="pass" :disabled="!!acting" @click="act('approve')">
              {{ acting === 'approve' ? '处理中…' : '✓ 审核通过' }}
            </button>
            <button class="reject" :disabled="!!acting" @click="rejectModal.show = true; rejectModal.input = ''">
              ✗ 退回修改
            </button>
            <p v-if="undoneChecklist > 0" class="warn-hint">注：上一轮整改清单还有 {{ undoneChecklist }} 条未完成</p>
          </div>
          <p v-else-if="task.status === 'published'" class="done-hint">已通过审核并发布</p>
          <p v-else class="done-hint">作者修改中，完成后会重新提交审核</p>
        </aside>
      </div>

      <!-- 退回弹窗：多行录入整改清单（空清单也可直接打回） -->
      <div v-if="rejectModal.show" class="modal-mask" @click.self="rejectModal.show = false">
        <div class="modal">
          <p class="modal-title">退回修改 · 录入整改清单</p>
          <textarea v-model="rejectModal.input" rows="6" placeholder="每行一条整改项，作者将逐条勾销，全部完成后才能重新提交审核"></textarea>
          <div class="modal-btns">
            <button @click="rejectModal.show = false">取消</button>
            <button class="primary" :disabled="!!acting" @click="act('reject', rejectModal.input)">
              {{ acting === 'reject' ? '处理中…' : '退回并生成清单' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.share-view { display: flex; flex-direction: column; gap: 14px; }
.hint { color: #666; }
.hint.error { color: #c0392b; }
/* 头部 */
.desk-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.desk-head h2 { margin: 0; flex: 1; font-size: 18px; min-width: 200px; }
.status-tag { font-size: 12px; padding: 2px 10px; border-radius: 10px; background: #eee; color: #666; }
.status-tag.writing { background: #e8f0fe; color: #1a73e8; }
.status-tag.reviewing { background: #fef7e0; color: #b7791f; }
.status-tag.published { background: #eafaf1; color: #27ae60; }
.author { color: #999; font-size: 13px; }
/* 两栏：左预览右审核面板 */
.desk-split { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
.article { border-radius: 8px; overflow: hidden; }
.review-pane { border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #fff; }
.review-pane h3 { margin: 4px 0 0; font-size: 14px; color: #333; }
/* 八项检查（与作者端发布前检查同风格） */
.pc-list { list-style: none; padding: 0; margin: 0; }
.pc-list li { display: flex; align-items: baseline; gap: 6px; padding: 4px 0; font-size: 13px; border-bottom: 1px dashed #f0f0f0; }
.pc-list li:last-child { border-bottom: none; }
.pc-mark { width: 16px; text-align: center; }
.pc-list .ok .pc-mark { color: #27ae60; }
.pc-list .bad .pc-mark { color: #c0392b; }
.pc-list .bad { color: #c0392b; }
.pc-hint { font-size: 12px; color: #b7791f; }
.pc-state { font-size: 13px; font-weight: bold; margin: 0; }
.pc-state.ready { color: #27ae60; }
.pc-state.blocked { color: #c0392b; }
/* 整改清单进度（只读） */
.checklist { border: 1px solid #e6d9c8; border-radius: 8px; padding: 10px 12px; background: #fdf9f2; }
.checklist h3 { margin: 0 0 6px; font-size: 13px; }
.checklist ul { list-style: none; padding: 0; margin: 0; }
.checklist li { padding: 3px 0; font-size: 13px; }
.checklist li.done { color: #999; text-decoration: line-through; }
/* 批注 */
.comment-box { display: flex; gap: 8px; }
.comment-box textarea { flex: 1; resize: vertical; padding: 6px 8px; font-family: inherit; }
.comment-box button { align-self: flex-end; padding: 6px 12px; }
.comments { list-style: none; padding: 0; margin: 0; }
.comments li { padding: 4px 0; border-bottom: 1px dashed #f0f0f0; font-size: 13px; }
/* 审核操作 */
.review-actions { display: flex; flex-direction: column; gap: 8px; }
.review-actions button { padding: 10px; font-size: 14px; border: none; border-radius: 6px; cursor: pointer; color: #fff; }
.review-actions .pass { background: #27ae60; }
.review-actions .reject { background: #e67e22; }
.review-actions button:disabled { opacity: 0.6; cursor: wait; }
.warn-hint { font-size: 12px; color: #b7791f; margin: 0; }
.done-hint { font-size: 13px; color: #999; margin: 0; text-align: center; }
/* 退回弹窗（自带遮罩样式：无父级 scoped 可继承） */
.modal-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { background: #fff; border-radius: 8px; padding: 16px; width: min(420px, 90vw); display: flex; flex-direction: column; gap: 10px; }
.modal-title { margin: 0; font-size: 14px; font-weight: 600; }
.modal textarea { resize: vertical; padding: 8px 10px; font-family: inherit; }
.modal-btns { display: flex; justify-content: flex-end; gap: 8px; }
.modal-btns .primary { background: #e67e22; color: #fff; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
/* 窄屏：两栏改上下堆叠（审核面板在预览后） */
@media (max-width: 768px) {
  .desk-split { grid-template-columns: 1fr; }
}
</style>
