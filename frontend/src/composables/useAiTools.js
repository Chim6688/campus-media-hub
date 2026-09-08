// frontend/src/composables/useAiTools.js
// AI 调用统一封装（宿主无关）：callAI(action, payload) + 按钮禁用态 + 长任务等待计时
// - aiLoading：当前进行中的 action（按钮禁用与文案复用）
// - aiElapsed：超 8 秒显示已等待秒数（P2-7，避免误以为卡死）；与 callAI 同生命周期
import { ref, getCurrentInstance, onBeforeUnmount } from 'vue';
import { request } from '../api/client.js';

export function useAiTools() {
  const aiLoading = ref('');
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

  async function callAI(action, payload) {
    aiLoading.value = action;
    startElapse();
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

  if (getCurrentInstance()) onBeforeUnmount(() => { stopElapse(); });

  return { aiLoading, aiElapsed, callAI, startElapse, stopElapse };
}
