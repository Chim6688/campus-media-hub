// frontend/src/composables/useAskUser.js
// 通用输入弹窗（替代原生 prompt：嵌入式预览 iframe 不支持 prompt）
// 返回 modal 状态供模板渲染弹窗 + askUser() 承诺式调用（取消返回 null）
import { reactive, ref, nextTick } from 'vue';

export function useAskUser() {
  const modal = reactive({ show: false, message: '', value: '', resolve: null });
  const modalInput = ref(null);

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

  return { modal, modalInput, askUser, confirmModal, cancelModal };
}
