// 审核工作台纯函数（V1.0 Phase 7，§22）：share_token 认证下的审核操作校验与打回补丁
// 分享页免口令，token 即审核人凭证；approve/reject 仅限 reviewing 态防越权
import { normalizeLines, makeItem } from './checklist.mjs';

// 校验审核动作：返回 null=允许，字符串=拒绝原因（HTTP 400）
export function validateShareAction(task, action) {
  if (!action) return '缺少操作类型';
  if (action === 'comment') return null; // 批注任意状态可加（低风险写操作）
  if (action !== 'approve' && action !== 'reject') return `未知操作 ${action}`;
  // 通过/退回都是审核态流转：writing 不能在分享页被通过（必须先提交审核）；published 不可逆
  if (task.status !== 'reviewing') {
    return `当前状态为「${task.status}」，仅审核中的任务可执行此操作`;
  }
  return null;
}

// 打回补丁（P0-2 同格式）：多行意见 → 整改清单，状态重置 writing
export function buildRejectPatch(text) {
  const lines = normalizeLines(text);
  return {
    status: 'writing',
    review_checklist: lines.map(makeItem),
  };
}
