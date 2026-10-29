import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { generateSafeId } from '../types';

export interface StudentPdfWatermarkInfo {
  name: string;
  cpf: string;
  email?: string;
}

let activeWatermarkInfo: StudentPdfWatermarkInfo | null = null;

export function setStudentPdfWatermarkInfo(
  info: StudentPdfWatermarkInfo | null
): void {
  activeWatermarkInfo = info;
}

export function getStudentPdfWatermarkInfo(): StudentPdfWatermarkInfo | null {
  return activeWatermarkInfo;
}

const CHUNK_CHAR_SIZE = 650_000;
const MAX_PDF_FILE_BYTES = 80 * 1024 * 1024; // 80 MB
const CHUNK_WRITE_CONCURRENCY = 6;
const CHUNK_WRITE_TIMEOUT_MS = 35_000;
const CHUNK_MAX_RETRIES = 2;

const rawPdfBytesCache = new Map<string, Uint8Array>();
const watermarkedPdfBytesCache = new Map<string, Uint8Array>();

export function formatPdfBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;
  const count = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: count }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      await worker(items[current], current);
    }
  });
  await Promise.all(runners);
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const cleanBase64 = base64.replace(/\s+/g, '');
  const binary = atob(cleanBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}

async function readFileAsUint8Array(
  file: File,
  onProgress?: (pct: number) => void
): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    onProgress?.(5);
    const buf = await file.arrayBuffer();
    onProgress?.(15);
    return new Uint8Array(buf);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.min(15, Math.round((ev.loaded / ev.total) * 15));
        onProgress(pct);
      }
    };
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        onProgress?.(15);
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Falha ao ler os bytes do arquivo PDF.'));
      }
    };
    reader.onerror = () =>
      reject(new Error('Não foi possível ler o arquivo PDF selecionado.'));
    reader.readAsArrayBuffer(file);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function writeSingleChunkWithRetry(
  chunkId: string,
  payload: {
    pdfId: string;
    chunkIndex: number;
    totalChunks: number;
    data: string;
    isFree: boolean;
    authorId: string;
  }
): Promise<void> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= CHUNK_MAX_RETRIES; attempt++) {
    try {
      await withTimeout(
        setDoc(doc(db, 'pdfChunks', chunkId), {
          ...payload,
          createdAt: serverTimestamp(),
        }),
        CHUNK_WRITE_TIMEOUT_MS,
        `Tempo esgotado ao salvar parte ${payload.chunkIndex + 1}/${payload.totalChunks} do PDF.`
      );
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < CHUNK_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export async function updatePdfChunksIsFree(
  rawUrl: string,
  isFree: boolean
): Promise<void> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed.startsWith('chunked:')) return;

  const parts = trimmed.split(':');
  const pdfId = parts[1];
  const totalChunks = Number(parts[2] || 0);
  const activeUid = auth.currentUser?.uid;
  if (!pdfId || !totalChunks || !activeUid) return;

  try {
    const indices = Array.from({ length: totalChunks }, (_, i) => i);
    for (let start = 0; start < indices.length; start += CHUNK_WRITE_CONCURRENCY) {
      const batch = indices.slice(start, start + CHUNK_WRITE_CONCURRENCY);
      await Promise.all(
        batch.map(async (i) => {
          const chunkId = `${pdfId}_${i}`;
          const snap = await getDoc(doc(db, 'pdfChunks', chunkId));
          if (!snap.exists()) return;
          const existing = snap.data();
          if (Boolean(existing.isFree) === Boolean(isFree)) return;
          await setDoc(doc(db, 'pdfChunks', chunkId), {
            pdfId: existing.pdfId,
            chunkIndex: existing.chunkIndex,
            totalChunks: existing.totalChunks,
            data: existing.data,
            isFree: Boolean(isFree),
            authorId: activeUid,
            createdAt: existing.createdAt || serverTimestamp(),
          });
        })
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `pdfChunks/${pdfId}`);
  }
}

export async function deletePdfFromFirestore(rawUrl: string): Promise<void> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return;

  rawPdfBytesCache.delete(trimmed);
  for (const k of Array.from(watermarkedPdfBytesCache.keys())) {
    if (k.startsWith(`${trimmed}::`)) {
      watermarkedPdfBytesCache.delete(k);
    }
  }

  if (!trimmed.startsWith('chunked:')) return;
  const parts = trimmed.split(':');
  const pdfId = parts[1];
  const totalChunks = Number(parts[2] || 0);
  if (!pdfId || !totalChunks) return;

  try {
    const indices = Array.from({ length: totalChunks }, (_, i) => i);
    for (let start = 0; start < indices.length; start += CHUNK_WRITE_CONCURRENCY) {
      const batch = indices.slice(start, start + CHUNK_WRITE_CONCURRENCY);
      await Promise.all(
        batch.map((i) =>
          deleteDoc(doc(db, 'pdfChunks', `${pdfId}_${i}`)).catch(() => {})
        )
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `pdfChunks/${pdfId}`);
  }
}

async function uploadDataUrlInChunks(
  dataUrl: string,
  authorId: string,
  isFree = false,
  onProgress?: (pct: number) => void
): Promise<string> {
  const effectiveAuthorId = (auth.currentUser?.uid || authorId || '').trim();
  if (!effectiveAuthorId) {
    throw new Error('Sessão expirada. Faça login novamente para enviar PDFs.');
  }

  const pdfId = generateSafeId('pdfdoc');
  const totalChunks = Math.ceil(dataUrl.length / CHUNK_CHAR_SIZE);

  if (totalChunks > 200) {
    throw new Error('O arquivo PDF excede o limite máximo de 200 blocos.');
  }

  let completed = 0;
  const indices = Array.from({ length: totalChunks }, (_, i) => i);

  try {
    for (let start = 0; start < indices.length; start += CHUNK_WRITE_CONCURRENCY) {
      const batch = indices.slice(start, start + CHUNK_WRITE_CONCURRENCY);
      await Promise.all(
        batch.map(async (i) => {
          const slice = dataUrl.slice(
            i * CHUNK_CHAR_SIZE,
            (i + 1) * CHUNK_CHAR_SIZE
          );
          const chunkId = `${pdfId}_${i}`;
          await writeSingleChunkWithRetry(chunkId, {
            pdfId,
            chunkIndex: i,
            totalChunks,
            data: slice,
            isFree: Boolean(isFree),
            authorId: effectiveAuthorId,
          });
          completed++;
          if (onProgress) {
            const pct = Math.min(
              99,
              Math.max(18, Math.round(18 + (completed / totalChunks) * 81))
            );
            onProgress(pct);
          }
        })
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `pdfChunks/${pdfId}`);
    throw err;
  }

  onProgress?.(100);
  return `chunked:${pdfId}:${totalChunks}`;
}

export async function ensurePdfUrlChunked(
  rawUrl: string,
  authorId: string,
  isFree = false
): Promise<string> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('chunked:')) return trimmed;

  if (trimmed.startsWith('data:')) {
    try {
      const bytes = dataUrlToUint8Array(trimmed);
      const chunkedRef = await uploadDataUrlInChunks(
        trimmed,
        authorId,
        isFree
      );
      rawPdfBytesCache.set(chunkedRef, bytes);
      return chunkedRef;
    } catch (err) {
      console.error('Erro ao converter PDF inline em blocos:', err);
      throw err;
    }
  }

  return trimmed;
}

export async function uploadPdfFileToCloud(
  file: File,
  authorId: string,
  onProgress?: (percent: number) => void,
  isFree = false
): Promise<{
  pdfUrl: string;
  pdfTitle: string;
  sizeLabel: string;
}> {
  const fileName = (file.name || 'material.pdf').trim();
  const isPdfMime =
    file.type === 'application/pdf' ||
    file.type === 'application/x-pdf' ||
    fileName.toLowerCase().endsWith('.pdf');

  if (!isPdfMime) {
    throw new Error('Selecione um arquivo no formato PDF (.pdf).');
  }
  if (file.size <= 0) {
    throw new Error('O arquivo PDF selecionado está vazio.');
  }
  if (file.size > MAX_PDF_FILE_BYTES) {
    throw new Error(
      `Este PDF tem ${formatPdfBytes(file.size)}. O limite máximo é de 80 MB por arquivo.`
    );
  }

  const sizeLabel = formatPdfBytes(file.size);
  const pdfTitle =
    fileName.replace(/\.pdf$/i, '').trim() || 'Material Complementar';

  onProgress?.(2);
  const bytes = await readFileAsUint8Array(file, onProgress);
  if (!bytes || bytes.byteLength === 0) {
    throw new Error('Não foi possível ler os dados do arquivo PDF.');
  }

  onProgress?.(18);
  const dataUrl = uint8ArrayToDataUrl(bytes);
  const pdfUrl = await uploadDataUrlInChunks(
    dataUrl,
    authorId,
    isFree,
    onProgress
  );

  rawPdfBytesCache.set(pdfUrl, bytes);
  onProgress?.(100);

  return {
    pdfUrl,
    pdfTitle,
    sizeLabel,
  };
}

export async function resolveRawPdfBytes(
  url: string
): Promise<Uint8Array | null> {
  if (!url) return null;
  const trimmed = url.trim();

  const cached = rawPdfBytesCache.get(trimmed);
  if (cached) return cached;

  if (trimmed.startsWith('chunked:')) {
    const parts = trimmed.split(':');
    const pdfId = parts[1];
    const totalChunks = Number(parts[2] || 0);
    if (!pdfId || !totalChunks) return null;

    try {
      const snaps = await Promise.all(
        Array.from({ length: totalChunks }, (_, i) =>
          getDoc(doc(db, 'pdfChunks', `${pdfId}_${i}`))
        )
      );
      const chunks: string[] = [];
      for (const s of snaps) {
        if (!s.exists()) {
          console.error(`Bloco de PDF ausente para ${pdfId}`);
          return null;
        }
        chunks.push((s.data().data as string) || '');
      }
      const fullDataUrl = chunks.join('');
      const bytes = dataUrlToUint8Array(fullDataUrl);
      rawPdfBytesCache.set(trimmed, bytes);
      return bytes;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `pdfChunks/${pdfId}`);
      return null;
    }
  }

  if (trimmed.startsWith('data:')) {
    try {
      const bytes = dataUrlToUint8Array(trimmed);
      rawPdfBytesCache.set(trimmed, bytes);
      return bytes;
    } catch (err) {
      console.error('Erro ao decodificar dataUrl de PDF:', err);
      return null;
    }
  }

  try {
    const resp = await fetch(trimmed);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    rawPdfBytesCache.set(trimmed, bytes);
    return bytes;
  } catch (err) {
    console.error('Erro ao baixar bytes de PDF externo:', err);
    return null;
  }
}

function sanitizePdfWatermarkText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

export async function stampPdfBytesWithStudentWatermark(
  rawBytes: Uint8Array,
  info: StudentPdfWatermarkInfo | null
): Promise<Uint8Array> {
  if (!info) return rawBytes;
  const cleanName = sanitizePdfWatermarkText(info.name).toUpperCase();
  const cleanCpf = sanitizePdfWatermarkText(info.cpf);
  if (!cleanName && !cleanCpf) return rawBytes;

  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(rawBytes, {
      ignoreEncryption: true,
    });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    const stampParts: string[] = [];
    if (cleanName) stampParts.push(`ALUNO(A): ${cleanName}`);
    if (cleanCpf) stampParts.push(`CPF: ${cleanCpf}`);
    const footerText = `DOCUMENTO EXCLUSIVO - ${stampParts.join('  |  ')} - PROIBIDO COMPARTILHAR`;

    for (const page of pages) {
      const { width } = page.getSize();
      const fontSize = Math.max(
        6.5,
        Math.min(8.5, (width / Math.max(40, footerText.length)) * 1.45)
      );
      const textWidth = font.widthOfTextAtSize(footerText, fontSize);
      const x = Math.max(14, (width - textWidth) / 2);
      const y = 10;

      page.drawText(footerText, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.42, 0.42, 0.46),
        opacity: 0.72,
      });
    }

    return await pdfDoc.save();
  } catch (err) {
    console.warn('Não foi possível aplicar marca d’água no PDF:', err);
    return rawBytes;
  }
}

export async function resolveWatermarkedPdfBytes(
  url: string,
  overrideInfo?: StudentPdfWatermarkInfo | null
): Promise<Uint8Array | null> {
  const info = overrideInfo !== undefined ? overrideInfo : activeWatermarkInfo;
  const watermarkKey = info ? `${info.name.trim()}|${info.cpf.trim()}` : 'raw';
  const cacheKey = `${url}::${watermarkKey}`;

  const cached = watermarkedPdfBytesCache.get(cacheKey);
  if (cached) return cached;

  const rawBytes = await resolveRawPdfBytes(url);
  if (!rawBytes) return null;

  const finalBytes = await stampPdfBytesWithStudentWatermark(rawBytes, info);
  watermarkedPdfBytesCache.set(cacheKey, finalBytes);
  return finalBytes;
}

export async function triggerPdfDownload(
  url: string,
  filename: string,
  overrideInfo?: StudentPdfWatermarkInfo | null
): Promise<void> {
  if (!url) return;
  const safeName = filename.toLowerCase().endsWith('.pdf')
    ? filename
    : `${filename}.pdf`;

  const bytes = await resolveWatermarkedPdfBytes(url, overrideInfo);
  if (bytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy.buffer], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
