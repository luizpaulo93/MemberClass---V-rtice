/**
 * Compresses and resizes an image File or Data URL in the browser before saving to Firestore.
 * Uses WebP when supported by the browser canvas, with automatic JPEG fallback.
 */
export async function compressImageToDataUrl(
  file: File,
  maxSide: number,
  quality = 0.85
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
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

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
  quality = 0.85
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], 'image', { type: blob.type || 'image/jpeg' });
  return compressImageToDataUrl(file, maxSide, quality);
}
