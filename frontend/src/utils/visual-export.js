// frontend/src/utils/visual-export.js
// 视觉导出管线（V1.0 Phase 1）：html2canvas 懒加载 + 前置就绪检查 + 截图下载
// 约束（规格 §3）：fonts.ready → 图片全就绪 → useCORS 截图；任一步失败明确报错，不生成缺图 PNG

// 等待节点内全部 <img> 加载完成；失败即 reject（含序号与 URL，提示用户换图或重试）
export function waitForImages(el) {
  const imgs = Array.from(el.querySelectorAll ? el.querySelectorAll('img') : []);
  const checks = imgs.map((img, i) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (img.complete && img.naturalWidth === 0) {
      return Promise.reject(new Error(`图片加载失败（第 ${i + 1} 张）：${img.src}`));
    }
    // 未加载完：挂 onload/onerror 决议（onerror 也走 naturalWidth=0 路径）
    return new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`图片加载失败（第 ${i + 1} 张）：${img.src}`));
    });
  });
  return Promise.all(checks);
}

// 导出 PNG：前置检查 → 离屏克隆自然尺寸节点 → html2canvas(useCORS) → 下载或返回 Blob
// opts.returnBlob=true（Phase 3+4）：不触发下载，resolve Blob 供上传 article_images（同一 Blob 落库，禁止二次编解码）
export async function exportVisualPNG(el, filename, size, opts = {}) {
  // 1) 字体就绪（中文渲染正确性的前提）
  if (document.fonts?.ready) await document.fonts.ready;
  // 2) 图片就绪（失败抛错终止）
  await waitForImages(el);
  // 3) 懒加载 html2canvas（首屏零成本；vite 自动分包独立 chunk）
  const { default: html2canvas } = await import('html2canvas');
  // 4) 离屏克隆：自然尺寸渲染，避免预览缩放 transform 污染截图
  const clone = el.cloneNode(true);
  clone.style.transform = 'none';
  clone.style.width = `${size.width}px`;
  clone.style.height = `${size.height}px`;
  clone.style.position = 'fixed';
  clone.style.left = '-99999px';
  document.body.appendChild(clone);
  try {
    // 5) 截图：scale=2 输出 2 倍分辨率（1800×766 / 1800×2400）
    const canvas = await html2canvas(clone, {
      useCORS: true,
      scale: 2,
      width: size.width,
      height: size.height,
      backgroundColor: null,
    });
    // 6) Blob 分支：canvas → Blob（Promise 化），直接交调用方上传
    if (opts.returnBlob) {
      return await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 生成失败，请重试'))), 'image/png'),
      );
    }
    // 7) 默认：触发浏览器下载（零回归路径）
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    document.body.removeChild(clone);
  }
}
