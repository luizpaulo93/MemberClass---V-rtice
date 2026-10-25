// src/utils/pdfStorage.ts — Upload e leitura de PDFs de alta velocidade (compatível com os PDFs já salvos e com o firestore.rules)
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
// Tamanho otimizado de cada parte (regra aceita até 750.000 caracteres)
const CHUNK_CHAR_SIZE = 735_000;
const MAX_CHUNKS = 200; // regra: chunkIndex <= 200
// Quantidade de partes enviadas por lote (writeBatch) e lotes simultâneos
const CHUNKS_PER_BATCH = 5;
const BATCH_CONCURRENCY = 4;
const SINGLE_CHUNK_CONCURRENCY = 12;

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

// Bytes originais em memória (abrir o mesmo PDF ou um PDF recém-enviado fica instantâneo)
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

export function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () =>
      reject(reader.error || new Error('Erro ao ler arquivo PDF'));
    reader.readAsDataURL(blob);
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return readBlobAsDataUrl(file);
}

/**
 * Compacta o arquivo PDF nativamente em GZIP (C++ no navegador) quando isso reduz o tamanho,
 * gerando menos blocos para enviar ao Firestore.
 */
async function readFileAsOptimizedDataUrl(
  file: File
): Promise<{ dataUrl: string; rawBytes: Uint8Array }> {
  const buf = await file.arrayBuffer();
  const rawBytes = new Uint8Array(buf);

  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const compressedStream = new Blob([rawBytes]).stream().pipeThrough(cs);
      const compressedBuf = await new Response(compressedStream).arrayBuffer();
      if (compressedBuf.byteLength < rawBytes.byteLength * 0.96) {
        const compressedBlob = new Blob([compressedBuf], {
          type: 'application/x-gzip-pdf',
        });
        const dataUrl = await readBlobAsDataUrl(compressedBlob);
        return { dataUrl, rawBytes };
      }
    } catch {
      // fallback para PDF sem compressão extra se CompressionStream não estiver disponível
    }
  }

  const pdfBlob = new Blob([rawBytes], { type: 'application/pdf' });
  const dataUrl = await readBlobAsDataUrl(pdfBlob);
  return { dataUrl, rawBytes };
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
    totalChunks > MAX_CHUNKS
  ) {
    return null;
  }
  return { pdfId, totalChunks };
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
  const pdfId = generateSafeId('pdf');
  const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_CHAR_SIZE));

  if (totalChunks > MAX_CHUNKS) {
    throw new Error(
      'O arquivo PDF excede o limite máximo permitido pela plataforma.'
    );
  }

  let completed = 0;

  // Agrupa os blocos em lotes (writeBatch) para reduzir drasticamente o número de round-trips de rede
  const batchGroups: number[][] = [];
  for (let start = 0; start < totalChunks; start += CHUNKS_PER_BATCH) {
    const group: number[] = [];
    for (
      let idx = start;
      idx < Math.min(totalChunks, start + CHUNKS_PER_BATCH);
      idx++
    ) {
      group.push(idx);
    }
    batchGroups.push(group);
  }

  let nextBatchIdx = 0;

  const uploadBatchGroup = async (indices: number[]) => {
    try {
      const batch = writeBatch(db);
      const ts = serverTimestamp();
      for (const i of indices) {
        const slice = dataUrl.slice(
          i * CHUNK_CHAR_SIZE,
          (i + 1) * CHUNK_CHAR_SIZE
        );
        const chunkRef = doc(db, PDF_CHUNK_COLLECTION, `${pdfId}_${i}`);
        batch.set(chunkRef, {
          pdfId,
          chunkIndex: i,
          totalChunks,
          data: slice,
          authorId: effectiveAuthorId,
          isFree: Boolean(isFree),
          createdAt: ts,
        });
      }
      await batch.commit();
      completed += indices.length;
      onProgress?.(Math.min(100, Math.round((completed / totalChunks) * 100)));
    } catch {
      // Fallback individual em paralelo caso algum lote falhe
      await Promise.all(
        indices.map(async (i) => {
          const slice = dataUrl.slice(
            i * CHUNK_CHAR_SIZE,
            (i + 1) * CHUNK_CHAR_SIZE
          );
          await setDoc(doc(db, PDF_CHUNK_COLLECTION, `${pdfId}_${i}`), {
            pdfId,
            chunkIndex: i,
            totalChunks,
            data: slice,
            authorId: effectiveAuthorId,
            isFree: Boolean(isFree),
            createdAt: serverTimestamp(),
          });
          completed++;
          onProgress?.(
            Math.min(100, Math.round((completed / totalChunks) * 100))
          );
        })
      );
    }
  };

  const batchWorker = async () => {
    while (nextBatchIdx < batchGroups.length) {
      const group = batchGroups[nextBatchIdx++];
      if (group) {
        await uploadBatchGroup(group);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(BATCH_CONCURRENCY, batchGroups.length) },
      () => batchWorker()
    )
  );

  return `chunked:${pdfId}:${totalChunks}`;
}

/**
 * Garante que qualquer PDF salvo anteriormente como data URL inline seja migrado
 * para `pdfChunks`, evitando que documentos de aula com vários PDFs ultrapassem 1 MB.
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
 * Envia um arquivo PDF para o Firestore dividindo em partes na coleção `pdfChunks`
 * com compactação GZIP automática e escrita em lote paralela.
 */
export async function uploadPdfToFirestore(
  file: File,
  authorId: string,
  onProgress?: (percent: number) => void,
  isFree = false
): Promise<string> {
  onProgress?.(8);
  const { dataUrl, rawBytes } = await readFileAsOptimizedDataUrl(file);
  onProgress?.(18);
  const chunkedRef = await uploadDataUrlToPdfChunks(
    dataUrl,
    authorId,
    (pct) => {
      onProgress?.(Math.min(100, 18 + Math.round(pct * 0.82)));
    },
    isFree
  );
  rawPdfBytesCache.set(chunkedRef, rawBytes);
  return chunkedRef;
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

  try {
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < totalChunks) {
        const i = nextIndex++;
        const chunkRef = doc(db, PDF_CHUNK_COLLECTION, `${pdfId}_${i}`);
        await updateDoc(chunkRef, { isFree: Boolean(isFree) });
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(SINGLE_CHUNK_CONCURRENCY, totalChunks) },
        () => worker()
      )
    );
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

  try {
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < totalChunks) {
        const i = nextIndex++;
        await deleteDoc(doc(db, PDF_CHUNK_COLLECTION, `${pdfId}_${i}`));
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(SINGLE_CHUNK_CONCURRENCY, totalChunks) },
        () => worker()
      )
    );
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

    // Se os bytes estiverem compactados em GZIP (magic bytes 0x1f 0x8b ou MIME x-gzip-pdf), descompacta nativamente
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

    const chunkPromises = Array.from({ length: totalChunks }, async (_, i) => {
      const snap = await getDoc(doc(db, PDF_CHUNK_COLLECTION, `${pdfId}_${i}`));
      if (!snap.exists()) {
        throw new Error(`Parte ${i + 1}/${totalChunks} do PDF não encontrada.`);
      }
      const data = snap.data() as { data?: string };
      return typeof data?.data === 'string' ? data.data : '';
    });

    const parts = await Promise.all(chunkPromises);
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
