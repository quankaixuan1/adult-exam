// Resize screenshots before sending them through the cloud-function payload.
export async function preparePaymentProof(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片读取失败，请重新选择'));
      img.src = url;
    });
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let dataUrl;
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length < 520000) break;
    }
    if (dataUrl.length >= 520000) throw new Error('图片内容过大，请裁剪后再上传');
    return { base64: dataUrl.split(',')[1], fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } finally { URL.revokeObjectURL(url); }
}
