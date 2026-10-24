import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { SCHEMA_LIMITS, sanitizeString } from '../types';

const PDF_CHUNK_COLLECTION = 'pdfChunks';
// Keep each chunk safely under 700KB (Firestore document limit is 1MB)
const CHUNK_CHAR_SIZE = 650_000;

export interface StudentPdfWatermarkInfo {
  name: string;
  cpf: string;
  email: string;
}

let activeStudentPdfWatermark: StudentPdfWatermarkInfo | null = null;

export function setStudentPdfWatermarkInfo(
  info: StudentPdfWatermarkInfo | null
) {
  activeStudentPdfWatermark = info;
}

export function getStudentPdfWatermarkInfo(): StudentPdfWatermarkInfo | null {
  return activeStudentPdfWatermark;
}

function sanitizePdfLatin1Text(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').trim();
}

async function applyEdgeWatermarkToPdfBytes(
  pdfBytes: Uint8Array,
  info: StudentPdfWatermarkInfo | null
): Promise<Uint8Array> {
  if (!info) return pdfBytes;
  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    const safeName = sanitizePdfLatin1Text(info.name || 'Aluno');
    const safeCpf = sanitizePdfLatin1Text(info.cpf || 'Nao cadastrado');
    const safeEmail = sanitizePdfLatin1Text(info.email || 'Nao informado');
    const stampText = `Documento licenciado para: ${safeName}  |  CPF: ${safeCpf}  |  E-mail: ${safeEmail}`;

    for (const page of pages) {
      const { width } = page.getSize();
      const fontSize = Math.max(6.5, Math.min(8.5, width * 0.0135));
      const textWidth = font.widthOfTextAtSize(stampText, fontSize);
      const x = Math.max(16, (width - textWidth) / 2);
      const y = 8;

      page.drawText(stampText, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.42, 0.45, 0.52),
        opacity: 0.72,
      });
    }

    return await pdfDoc.save();
  } catch (err) {
    console.warn('Aviso ao aplicar identificacao na borda do PDF:', err);
    return pdfBytes;
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () =>
      reject(reader.error || new Error('Erro ao ler arquivo PDF'));
    reader.readAsDataURL(file);
  });
}

function formatFileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uploads a PDF file of any size up to 25MB by splitting its Base64 data URL
 * into smaller chunks stored in `pdfChunks` collection if it exceeds inline size.
 */
export async function uploadPdfToFirestore(
  file: File,
  authorId: string,
  onProgress?: (percent: number) => void,
  isFree = false
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);

  // If small enough (< 500KB base64), store directly inline for instant access
  if (dataUrl.length <= 500_000) {
    onProgress?.(100);
    return dataUrl;
  }

  const fileId = `pdf_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const totalChunks = Math.ceil(dataUrl.length / CHUNK_CHAR_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const slice = dataUrl.slice(
      i * CHUNK_CHAR_SIZE,
      (i + 1) * CHUNK_CHAR_SIZE
    );
    const chunkDocId = `${fileId}_${String(i).padStart(4, '0')}`;
    await setDoc(doc(db, PDF_CHUNK_COLLECTION, chunkDocId), {
      fileId,
      index: i,
      total: totalChunks,
      data: slice,
      authorId,
      isFree: Boolean(isFree),
      createdAt: serverTimestamp(),
    });
    if (onProgress) {
      onProgress(Math.round(((i + 1) / totalChunks) * 100));
    }
  }

  return `chunked:${fileId}:${totalChunks}`;
}

export async function uploadPdfFileToCloud(
  file: File,
  authorId: string,
  onProgress?: (percent: number) => void,
  isFree = false
): Promise<{ pdfUrl: string; pdfTitle: string; sizeLabel: string }> {
  const pdfUrl = await uploadPdfToFirestore(file, authorId, onProgress, isFree);
  const rawName = file.name.replace(/\.pdf$/i, '').trim() || 'Material PDF';
  const pdfTitle = sanitizeString(rawName, SCHEMA_LIMITS.TITLE_MAX, 'Material PDF');
  const sizeLabel = formatFileSizeLabel(file.size || 0);
  return { pdfUrl, pdfTitle, sizeLabel };
}

/**
 * Updates the `isFree` flag on all chunks of a chunked PDF when a lesson's free status changes.
 */
export async function updatePdfChunksIsFree(
  pdfUrl: string,
  isFree: boolean
): Promise<void> {
  if (!pdfUrl || !pdfUrl.startsWith('chunked:')) return;
  const parts = pdfUrl.split(':');
  const fileId = parts[1];
  if (!fileId) return;

  try {
    const q = query(
      collection(db, PDF_CHUNK_COLLECTION),
      where('fileId', '==', fileId)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const existing = d.data();
      if (Boolean(existing.isFree) !== Boolean(isFree)) {
        await setDoc(doc(db, PDF_CHUNK_COLLECTION, d.id), {
          ...existing,
          isFree: Boolean(isFree),
        });
      }
    }
  } catch (err) {
    console.warn('Erro ao sincronizar isFree nos pdfChunks:', err);
  }
}

/**
 * Deletes associated chunks from Firestore when a chunked PDF is removed.
 */
export async function deletePdfFromFirestore(pdfUrl: string): Promise<void> {
  if (!pdfUrl || !pdfUrl.startsWith('chunked:')) return;
  const parts = pdfUrl.split(':');
  const fileId = parts[1];
  if (!fileId) return;

  try {
    const q = query(
      collection(db, PDF_CHUNK_COLLECTION),
      where('fileId', '==', fileId)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(doc(db, PDF_CHUNK_COLLECTION, d.id));
    }
  } catch (err) {
    console.error('Erro ao excluir blocos do PDF:', err);
  }
}

function base64DataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const base64 = dataUrl.slice(commaIdx + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function resolveRawPdfBytes(url: string): Promise<Uint8Array | null> {
  if (!url) return null;

  if (url.startsWith('chunked:')) {
    const parts = url.split(':');
    const fileId = parts[1];
    if (!fileId) return null;

    const q = query(
      collection(db, PDF_CHUNK_COLLECTION),
      where('fileId', '==', fileId)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const chunks = snap.docs
      .map((d) => d.data() as { index: number; data: string })
      .sort((a, b) => a.index - b.index);

    const fullDataUrl = chunks.map((c) => c.data).join('');
    return base64DataUrlToUint8Array(fullDataUrl);
  }

  if (url.startsWith('data:')) {
    return base64DataUrlToUint8Array(url);
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function resolveWatermarkedPdfBytes(
  url: string,
  overrideWatermark?: StudentPdfWatermarkInfo | null
): Promise<Uint8Array | null> {
  const rawBytes = await resolveRawPdfBytes(url);
  if (!rawBytes) return null;
  const effectiveInfo =
    overrideWatermark !== undefined
      ? overrideWatermark
      : activeStudentPdfWatermark;
  return applyEdgeWatermarkToPdfBytes(rawBytes, effectiveInfo);
}

/**
 * Resolves any stored PDF URL (`data:...`, `https://...`, or `chunked:...`)
 * into a browser-viewable Object URL (or external URL) with the student's
 * identification subtly stamped on the bottom edge of every page.
 */
export async function resolvePdfUrlToBlobUrl(
  url: string,
  overrideWatermark?: StudentPdfWatermarkInfo | null
): Promise<string> {
  if (!url) return '';

  const stampedBytes = await resolveWatermarkedPdfBytes(url, overrideWatermark);
  if (stampedBytes) {
    const blob = new Blob([stampedBytes as unknown as BlobPart], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }

  return url;
}

/**
 * Triggers a direct file download for any PDF URL (inline data, chunked, or external).
 */
export async function triggerPdfDownload(
  url: string,
  title: string,
  overrideWatermark?: StudentPdfWatermarkInfo | null
): Promise<void> {
  const resolved = await resolvePdfUrlToBlobUrl(url, overrideWatermark);
  if (!resolved) return;

  const link = document.createElement('a');
  link.href = resolved;
  const safeName = (title || 'Material')
    .replace(/[^a-zA-Z0-9_\-\u00C0-\u017F ]/g, '')
    .trim();
  link.download = `${safeName || 'Material'}.pdf`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (resolved.startsWith('blob:')) {
    setTimeout(() => URL.revokeObjectURL(resolved), 60_000);
  }
}
