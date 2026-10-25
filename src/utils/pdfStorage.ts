// src/utils/pdfStorage.ts — Upload e leitura de PDFs otimizados (compatível com os PDFs já salvos e com o firestore.rules)
//
// Formato das partes de PDF:
//   documento:  pdfChunks/{pdfId}_{índice}          (sem zeros à esquerda)
//   campos:     pdfId, chunkIndex, totalChunks, data, authorId, createdAt, isFree
//   referência: "chunked:{pdfId}:{totalChunks}"

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { SCHEMA_LIMITS, generateSafeId, sanitizeString } from '../types';

const PDF_CHUNK_COLLECTION = 'pdfChunks';
// Cada parte tem ~650 KB (8 × 650 KB ≈ 5,2 MB por writeBatch, abaixo do limite de 10 MiB do Firestore e de 750.000 chars da regra)
const CHUNK_CHAR_SIZE = 650_000;
const MAX_CHUNKS = 200; // regra: chunkIndex <= 200
const CHUNKS_PER_BATCH = 8;
const BATCH_CONCURRENCY = 2;
const INLINE_MAX_CHARS = 500_000;
const SINGLE_CHUNK_CONCURRENCY = 8;

/**
 * Executa tarefas assíncronas sobre uma lista com limite máximo de concorrência.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const concurrency = Math.max(1, Math.min(limit, items.length));
  let nextIdx = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIdx < items.length) {
        const currentIndex = nextIdx++;
        await worker(items[currentIndex], currentIndex);
      }
    })
  );
}

export interface StudentPdfWatermarkInfo {
  name: string;
  cpf: string;
  email: string;
}

let activeStudentPdfWatermark: StudentPdfWatermarkInfo | null = null;

export function setStudentPdfWatermarkInfo(info: StudentPdfWatermarkInfo | null) {
  activeStudentPdfWatermark = info;
}

export function getStudentPdfWatermarkInfo(): StudentPdfWatermarkInfo | null {
  return activeStudentPdfWatermark;
}

// Bytes originais em memória (abrir o mesmo PDF de novo fica instantâneo)
const rawPdfBytesCache = new Map<string, Uint8Array>();

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
      let fontSize = Math.max(6.5, Math.min(8.5, width * 0.0135));
      let textWidth = font.widthOfTextAtSize(stampText, fontSize);
      const maxWidth = Math.max(120, width - 24);
      if (textWidth > maxWidth) {
        fontSize = Math.max(4.8, fontSize * (maxWidth / textWidth));
        textWidth = font.widthOfTextAtSize(stampText, fontSize);
      }
      const x = Math.max(12, (width - textWidth) / 2);
      page.drawText(stampText, {
        x,
        y: 8,
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

function parseChunkedUrl(
  pdfUrl: string
): { pdfId: string; totalChunks: number } | null {
  if (!pdfUrl || !pdfUrl.startsWith('chunked:')) return null;
  const parts = pdfUrl.split(':');
  if (parts.length < 3) return null;
  const pdfId = parts[1]?.trim() || '';
  const totalChunks = Number.parseInt(parts[2] || '0', 10);
  if (
    !pdfId ||
    !Number.isFinite(totalChunks) ||
    totalChunks < 1 ||
    totalChunks > MAX_CHUNKS + 1
  ) {
    return null;
  }
  return { pdfId, totalChunks };
}

function chunkDocId(pdfId: string, idx: number): string {
  return `${pdfId}_${idx}`;
}

async function uploadDataUrlToPdfChunks(
  dataUrl: string,
  authorId: string,
  onProgress?: (percent: number) => void,
  isFree = false
): Promise<string> {
  if (!dataUrl) {
    throw new Error('Conteúdo do arquivo PDF está vazio.');
  }

  const effectiveAuthorId = auth.currentUser?.uid || authorId;
  const pdfId = generateSafeId('pdfdoc');
  const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_CHAR_SIZE));

  if (totalChunks > MAX_CHUNKS) {
    throw new Error(
      'O arquivo PDF excede o limite máximo suportado pela plataforma.'
    );
  }

  // Agrupa os índices em lotes de até 8 partes (8 × 650 KB ≈ 5,2 MB < 10 MiB por writeBatch)
  const batchGroups: number[][] = [];
  for (let start = 0; start < totalChunks; start += CHUNKS_PER_BATCH) {
    const end = Math.min(totalChunks, start + CHUNKS_PER_BATCH);
    const group: number[] = [];
    for (let idx = start; idx < end; idx++) {
      group.push(idx);
    }
    batchGroups.push(group);
  }

  let completedChunks = 0;

  await runWithConcurrency(batchGroups, BATCH_CONCURRENCY, async (indices) => {
    const batch = writeBatch(db);
    const ts = serverTimestamp();

    for (const idx of indices) {
      const startOffset = idx * CHUNK_CHAR_SIZE;
      const chunkData = dataUrl.slice(
        startOffset,
        startOffset + CHUNK_CHAR_SIZE
      );
      batch.set(doc(db, PDF_CHUNK_COLLECTION, chunkDocId(pdfId, idx)), {
        pdfId,
        chunkIndex: idx,
        totalChunks,
        data: chunkData,
        authorId: effectiveAuthorId,
        isFree: Boolean(isFree),
        createdAt: ts,
      });
    }

    await batch.commit();
    completedChunks += indices.length;
    onProgress?.(
      Math.min(100, Math.round((completedChunks / totalChunks) * 100))
    );
  });

  return `chunked:${pdfId}:${totalChunks}`;
}

/**
 * Converte um PDF inline (`data:...`) em partes no `pdfChunks` quando necessário
 * (por exemplo, quando uma aula possui múltiplos PDFs que juntos passariam de 1 MB).
 */
export async function ensurePdfUrlChunked(
  pdfUrl: string,
  authorId: string,
  isFree = false
): Promise<string> {
  if (!pdfUrl || !pdfUrl.startsWith('data:')) {
    return pdfUrl;
  }
  return uploadDataUrlToPdfChunks(pdfUrl, authorId, undefined, isFree);
}

/**
 * Envia o PDF para o Firestore.
 * - Lê o arquivo uma única vez em base64.
 * - Se for pequeno (<= 500.000 caracteres), retorna inline.
 * - Caso contrário, grava em lotes (`writeBatch` de até 8 partes, 2 lotes em paralelo).
 */
export async function uploadPdfToFirestore(
  file: File,
  authorId: string,
  onProgress?: (percent: number) => void,
  isFree = false
): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  onProgress?.(10);

  if (dataUrl.length <= INLINE_MAX_CHARS) {
    onProgress?.(100);
    return dataUrl;
  }

  const ref = await uploadDataUrlToPdfChunks(
    dataUrl,
    authorId,
    (pct) => {
      onProgress?.(Math.min(100, 10 + Math.round(pct * 0.9)));
    },
    isFree
  );

  return ref;
}

export async function uploadPdfFileToCloud(
  file: File,
  authorId: string,
  onProgress?: (percent: number) => void,
  isFree = false
): Promise<{ pdfUrl: string; pdfTitle: string; sizeLabel: string }> {
  const pdfUrl = await uploadPdfToFirestore(file, authorId, onProgress, isFree);
  const rawName = file.name.replace(/\.pdf$/i, '').trim() || 'Material PDF';
  const pdfTitle = sanitizeString(
    rawName,
    SCHEMA_LIMITS.TITLE_MAX,
    'Material PDF'
  );
  const sizeLabel = formatFileSizeLabel(file.size || 0);
  return { pdfUrl, pdfTitle, sizeLabel };
}

/**
 * Atualiza o campo `isFree` em todas as partes de um PDF dividido quando a aula muda entre grátis e paga.
 */
export async function updatePdfChunksIsFree(
  pdfUrl: string,
  isFree: boolean
): Promise<void> {
  const parsed = parseChunkedUrl(pdfUrl);
  if (!parsed) return;
  const { pdfId, totalChunks } = parsed;
  const indices = Array.from({ length: totalChunks }, (_, i) => i);

  try {
    await runWithConcurrency(indices, SINGLE_CHUNK_CONCURRENCY, async (idx) => {
      await updateDoc(doc(db, PDF_CHUNK_COLLECTION, chunkDocId(pdfId, idx)), {
        isFree: Boolean(isFree),
      });
    });
  } catch (err) {
    console.warn('Erro ao sincronizar isFree nos pdfChunks:', err);
  }
}

/**
 * Remove todas as partes de um PDF dividido do Firestore.
 */
export async function deletePdfFromFirestore(pdfUrl: string): Promise<void> {
  rawPdfBytesCache.delete(pdfUrl);
  const parsed = parseChunkedUrl(pdfUrl);
  if (!parsed) return;
  const { pdfId, totalChunks } = parsed;
  const indices = Array.from({ length: totalChunks }, (_, i) => i);

  try {
    await runWithConcurrency(indices, SINGLE_CHUNK_CONCURRENCY, async (idx) => {
      await deleteDoc(doc(db, PDF_CHUNK_COLLECTION, chunkDocId(pdfId, idx)));
    });
  } catch (err) {
    console.error('Erro ao excluir blocos do PDF:', err);
  }
}

async function decodeDataUrlToPdfBytes(
  dataUrl: string
): Promise<Uint8Array | null> {
  try {
    const commaIdx = dataUrl.indexOf(',');
    const base64 =
      commaIdx === -1 ? dataUrl.trim() : dataUrl.slice(commaIdx + 1).trim();
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Compatibilidade com qualquer PDF salvo anteriormente com compressão GZIP
    const isGzip =
      dataUrl.startsWith('data:application/x-gzip-pdf') ||
      (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);

    if (isGzip && typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      const decompressedStream = new Blob([bytes]).stream().pipeThrough(ds);
      const decompressedBuf = await new Response(
        decompressedStream
      ).arrayBuffer();
      return new Uint8Array(decompressedBuf);
    }

    return bytes;
  } catch {
    return null;
  }
}

async function resolveRawPdfBytes(url: string): Promise<Uint8Array | null> {
  if (!url) return null;

  const cached = rawPdfBytesCache.get(url);
  if (cached) return cached;

  if (url.startsWith('chunked:')) {
    const parsed = parseChunkedUrl(url);
    if (!parsed) return null;
    const { pdfId, totalChunks } = parsed;

    const parts = new Array<string>(totalChunks).fill('');
    const indices = Array.from({ length: totalChunks }, (_, i) => i);

    await runWithConcurrency(indices, SINGLE_CHUNK_CONCURRENCY, async (idx) => {
      const snap = await getDoc(
        doc(db, PDF_CHUNK_COLLECTION, chunkDocId(pdfId, idx))
      );
      if (!snap.exists()) {
        throw new Error(
          `Parte ${idx + 1}/${totalChunks} do PDF não encontrada.`
        );
      }
      const data = snap.data() as { data?: string };
      parts[idx] = typeof data?.data === 'string' ? data.data : '';
    });

    const fullDataUrl = parts.join('');
    const bytes = await decodeDataUrlToPdfBytes(fullDataUrl);
    if (bytes) {
      rawPdfBytesCache.set(url, bytes);
    }
    return bytes;
  }

  if (url.startsWith('data:')) {
    const bytes = await decodeDataUrlToPdfBytes(url);
    if (bytes) {
      rawPdfBytesCache.set(url, bytes);
    }
    return bytes;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    rawPdfBytesCache.set(url, bytes);
    return bytes;
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
 * Converte qualquer URL de PDF salva (`data:...`, `https://...` ou `chunked:...`)
 * em uma Object URL pronta para visualização, com a identificação do aluno na borda.
 */
export async function resolvePdfUrlToBlobUrl(
  url: string,
  overrideWatermark?: StudentPdfWatermarkInfo | null
): Promise<string> {
  if (!url) return '';

  const stampedBytes = await resolveWatermarkedPdfBytes(url, overrideWatermark);
  if (stampedBytes) {
    const blob = new Blob([stampedBytes as unknown as BlobPart], {
      type: 'application/pdf',
    });
    return URL.createObjectURL(blob);
  }

  return url;
}

/**
 * Inicia o download direto de qualquer PDF (inline, dividido em partes ou externo).
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
