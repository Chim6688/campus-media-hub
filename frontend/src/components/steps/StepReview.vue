<script setup>
// 审核步（原 TaskDetail ⑥ 审核区 + 打回弹窗，拆分自 TaskDetail.vue）
// 交互边界：状态流转（pass/reject）、分享 token 生成、复制文章、任务刷新都由父级执行；
// 本组件自含：发布准备下载、打回弹窗录入与 AI 整理、分享链接复制、批注提交
import { ref, reactive } from 'vue';
import { request, listImages } from '../../api/client.js';
import { normalizeLines, makeItem } from '../../utils/checklist.mjs'; // 整改清单纯函数（与后端双份同步）
import { useAiTools } from '../../composables/useAiTools.js'; // AI 整理用（弹窗内独立实例）

const props = defineProps({
  task: { type: Object, required: true }, // 读 status/comments；写操作走 emit 由父完成
  shareLink: { type: String, default: '' },
});
const emit = defineEmits(['pass', 'reject', 'generate-share', 'refresh-task', 'copy-wechat']);

const { callAI } = useAiTools();
const errMsg = ref(''); // 本步内操作（批注/打回/AI 整理）失败提示

// ========== 发布准备（V1.0 Phase 8，§23）：published 态人工发布四步 ==========
const publishBox = reactive({ loading: false, error: '' });

// 获取全部图片：封面 + 绑定正文图逐张下载（fetch blob → a[download]，文件名带位置与说明）
async function downloadAllImages() {
  publishBox.loading = true;
  publishBox.error = '';
  try {
    const { images } = await listImages(props.task.id);
    const need = images.filter((i) => i.type === 'cover' || (i.type === 'content' && i.position > 0))
      .sort((a, b) => (a.type === 'cover' ? -1 : b.type === 'cover' ? 1 : a.position - b.position));
    if (!need.length) {
      publishBox.error = '本任务没有封面或正文图片';
      return;
    }
    for (const img of need) {
      // 公共 URL 直读（v5 bucket public）；Supabase 跨域已放行 CORS
      const blob = await (await fetch(img.url)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const label = (img.caption || img.type).replace(/[\\/:*?"<>|\s]+/g, ''); // 文件名安全化
      a.download = `${img.type === 'cover' ? '封面' : '第' + img.position + '图'}-${label}.${img.url.split('.').pop()}`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  } catch (e) {
    publishBox.error = '图片下载失败：' + e.message;
  } finally {
    publishBox.loading = false;
  }
}

// ========== 分享链接 ==========
async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(props.shareLink);
  } catch {
    const el = document.createElement('textarea');
    el.value = props.shareLink;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  }
}

// ========== 批注（写作者留言/审核人批注：任务行追加，任何状态可发） ==========
const commentText = ref('');
async function addComment() {
  if (!commentText.value.trim()) return;
  errMsg.value = '';
  try {
    await request('/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({
        id: props.task.id,
        comment: { by: localStorage.getItem('authorName') || '匿名', text: commentText.value.trim() },
      }),
    });
    commentText.value = '';
    emit('refresh-task'); // 父拉最新任务（含 comments）回填 props.task
  } catch (e) {
    errMsg.value = e.message;
  }
}

// ========== 打回弹窗：多行录入整改清单（手动逐条 / 粘贴老师微信留言 AI 整理） ==========
const rejectModal = reactive({ show: false, input: '', loading: false });

function openRejectModal() {
  rejectModal.show = true;
  rejectModal.input = '';
  errMsg.value = '';
}

// AI 整理：粘贴的老师微信留言 → 逐条意见（整理后仍可手动增删改）
async function aiOrganizeNotes() {
  if (!rejectModal.input.trim()) return;
  rejectModal.loading = true;
  errMsg.value = '';
  try {
    const text = await callAI('organize_review_notes', { text: rejectModal.input });
    const arr = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    if (Array.isArray(arr) && arr.length) rejectModal.input = arr.join('\n');
    else errMsg.value = 'AI 未识别出意见，请手动逐行录入';
  } catch (e) {
    errMsg.value = 'AI 整理失败，请手动逐行录入：' + e.message;
  } finally {
    rejectModal.loading = false;
  }
}

// 确认打回：录入归一化 → 清单条目上抛父执行 PATCH（空录入=沿用现有清单，同旧打回行为）
function confirmReject() {
  const lines = normalizeLines(rejectModal.input);
  const items = lines.map(makeItem);
  rejectModal.show = false;
  emit('reject', items);
}
</script>

<template>
  <div>
    <!-- 发布准备：审核通过后的人工发布四步（复制 → 取图 → 公众号后台 → 已标记发布） -->
    <div v-if="task.status === 'published'" class="publish-box">
      <h3>🚀 发布准备（已标记为已发布）</h3>
      <p class="publish-steps">① 复制文章 → ② 获取全部图片 → ③ 打开公众号后台粘贴并上传图片 → ④ 发布</p>
      <div class="publish-actions">
        <button class="copy-wechat" @click="emit('copy-wechat')">📋 复制文章</button>
        <button :disabled="publishBox.loading" @click="downloadAllImages">
          {{ publishBox.loading ? '下载中…' : '⬇ 获取全部图片' }}
        </button>
        <a href="https://mp.weixin.qq.com" target="_blank" rel="noopener">↗ 打开微信公众号后台</a>
      </div>
      <p v-if="publishBox.error" class="publish-error">{{ publishBox.error }}</p>
      <p class="step-hint">图片按「封面 / 第N图-说明」命名逐张下载；公众号后台粘贴正文后按对应位置上传</p>
    </div>

    <div class="review-actions">
      <button v-if="task.status === 'reviewing'" class="status-btn" @click="emit('pass')">
        审核通过，推进为已发布 →
      </button>
      <button v-if="task.status === 'reviewing'" class="status-btn reject" @click="openRejectModal">
        打回修改
      </button>
      <button v-if="task.status !== 'published'" class="status-btn share" @click="emit('generate-share')">
        生成分享链接（发审核人）
      </button>
    </div>

    <!-- 分享链接展示 + 复制（生成后显示） -->
    <div v-if="shareLink" class="share-link">
      <a :href="shareLink" target="_blank" rel="noopener">{{ shareLink }}</a>
      <button @click="copyShareLink">复制</button>
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
      <p v-if="errMsg" class="err-msg">{{ errMsg }}</p>
    </div>

    <!-- 打回弹窗：手动逐行 / 粘贴老师留言 AI 整理（P0-2） -->
    <div v-if="rejectModal.show" class="modal-mask" @click.self="rejectModal.show = false">
      <div class="modal">
        <p class="modal-title">打回修改 · 录入整改清单</p>
        <textarea v-model="rejectModal.input" rows="6" placeholder="每行一条整改项；或粘贴老师微信留言后点「AI 整理」"></textarea>
        <p v-if="errMsg" class="err-msg">{{ errMsg }}</p>
        <div class="modal-btns">
          <button @click="rejectModal.show = false">取消</button>
          <button :disabled="rejectModal.loading" @click="aiOrganizeNotes">
            {{ rejectModal.loading ? '整理中…' : '✨ AI 整理' }}
          </button>
          <button class="primary" @click="confirmReject">打回并生成清单</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 样式同原 TaskDetail ⑥ 审核区 + 打回弹窗 */
.review-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.status-btn { padding: 6px 12px; background: #1e88e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
.status-btn.reject { background: #e67e22; }
.status-btn.share { background: #8e44ad; }
.share-link { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.share-link a { color: #8e44ad; word-break: break-all; }
.share-link button { padding: 4px 10px; }
.comments { margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px; }
.comments h3 { margin: 0 0 8px; font-size: 14px; }
.comments ul { list-style: none; padding: 0; }
.comments li { padding: 6px 0; border-bottom: 1px dashed #f0f0f0; }
.comments .at { color: #aaa; font-size: 12px; margin-left: 8px; }
.add-comment { display: flex; gap: 8px; margin-top: 8px; }
.add-comment input { flex: 1; padding: 6px 10px; }
.comments button { padding: 6px 12px; }
.publish-box { border: 1px solid #bfe3c8; background: #f4fbf6; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.publish-box h3 { margin: 0; font-size: 15px; color: #1e7e43; }
.publish-steps { font-size: 13px; color: #555; margin: 0; }
.publish-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.publish-actions button { padding: 8px 16px; font-size: 14px; cursor: pointer; }
.publish-actions a { padding: 8px 16px; font-size: 14px; background: #27ae60; color: #fff; border-radius: 4px; text-decoration: none; white-space: nowrap; }
.publish-actions .copy-wechat { background: #1e88e5; color: #fff; border: none; border-radius: 4px; }
.publish-error { color: #c0392b; font-size: 13px; margin: 0; }
.step-hint { font-size: 12px; color: #999; margin: 0; }
.err-msg { color: #c0392b; font-size: 12px; margin: 4px 0 0; }
.modal-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal { background: #fff; border-radius: 8px; padding: 16px; width: min(420px, 90vw); display: flex; flex-direction: column; gap: 10px; }
.modal-title { margin: 0; font-size: 14px; font-weight: 600; }
.modal textarea { resize: vertical; padding: 8px 10px; font-family: inherit; }
.modal-btns { display: flex; justify-content: flex-end; gap: 8px; }
.modal-btns button { padding: 6px 12px; }
.modal-btns .primary { background: #e67e22; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
</style>
