/**
 * Compresses and resizes an image File or Data URL in the browser before saving to Firestore.
 * Uses asynchronous canvas.toBlob (WebP with JPEG fallback) so encoding runs off the main thread.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () =>
      reject(reader.error || new Error('Erro ao ler imagem comprimida'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function compressImageToDataUrl(
  file: File,
  maxSide: number,
  quality = 0.8
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const webpBlob = await canvasToBlobAsync(canvas, 'image/webp', quality);
  if (webpBlob && webpBlob.type === 'image/webp') {
    return blobToDataUrl(webpBlob);
  }

  const jpegBlob = await canvasToBlobAsync(canvas, 'image/jpeg', quality);
  if (jpegBlob) {
    return blobToDataUrl(jpegBlob);
  }

  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Recompresses an existing data:image/... string in the browser using the same WebP/JPEG pipeline.
 */
export async function recompressDataUrlImage(
  dataUrl: string,
  maxSide: number,
  quality = 0.8
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], 'image', { type: blob.type || 'image/jpeg' });
  return compressImageToDataUrl(file, maxSide, quality);
}
