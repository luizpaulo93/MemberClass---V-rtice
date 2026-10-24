import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db } from '../firebase';
import { generateSafeId, sanitizeString, SCHEMA_LIMITS } from '../types';

const CHUNK_CHAR_SIZE = 700000;
const MAX_CHUNKS = 200; // Up to ~105 MB PDF support
const UPLOAD_CONCURRENCY = 4;

export interface StudentPdfWatermarkInfo {
  name: string;
  cpf: string;
  email: string;
}

let activeStudentWatermark: StudentPdfWatermarkInfo | null = null;

export function setStudentPdfWatermarkInfo(
  info: StudentPdfWatermarkInfo | null
): void {
  activeStudentWatermark = info;
}

// In-memory cache mapping raw pdfUrl reference -> raw Uint8Array bytes
const rawPdfBytesCache = new Map<string, Uint8Array>();
// In-memory cache mapping `${pdfUrl}::${watermarkKey}` -> object URL (blob:...)
const watermarkedBlobUrlCache = new Map<string, string>();

function toWinAnsiSafeText(input: string): string {
  // Keep Latin-1 (ISO-8859-1) printable characters supported by StandardFonts.Helvetica
  return input
    .replace(/[•·]/g, '|')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function getWatermarkSignature(
  override?: StudentPdfWatermarkInfo | null
): string {
  const info = override || activeStudentWatermark;
  if (!info) return 'raw';
  const name = (info.name || 'Aluno').trim();
  const cpf = (info.cpf || 'Não cadastrado').trim();
  const email = (info.email || '').trim();
  return `${name}|${cpf}|${email}`;
}

async function applyEdgeWatermarkToPdfBytes(
  rawBytes: Uint8Array,
  override?: StudentPdfWatermarkInfo | null
): Promise<Uint8Array> {
  const info = override || activeStudentWatermark;
  if (!info) return rawBytes;

  try {
    const pdfDoc = await PDFDocument.load(rawBytes, {
      ignoreEncryption: true,
    });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    const cleanName = (info.name || 'Aluno').trim();
    const cleanCpf = (info.cpf || 'Não cadastrado').trim();
    const cleanEmail = (info.email || 'Não informado').trim();

    const stampLine = toWinAnsiSafeText(
      `Nome: ${cleanName}   |   CPF: ${cleanCpf}   |   E-mail: ${cleanEmail}`
    );

    for (const page of pages) {
      const { width } = page.getSize();
      const maxAvailableWidth = Math.max(120, width - 24);
      let fontSize = 6.8;
      let textWidth = font.widthOfTextAtSize(stampLine, fontSize);

      if (textWidth > maxAvailableWidth && textWidth > 0) {
        fontSize = Math.max(
          4.8,
          fontSize * (maxAvailableWidth / textWidth)
        );
        textWidth = font.widthOfTextAtSize(stampLine, fontSize);
      }

      const x = Math.max(12, (width - textWidth) / 2);
      // Positioned right at the bottom edge of the sheet (5pt from bottom border)
      // so it never overlaps or disturbs textbook/apostila content.
      const y = 5;

      page.drawText(stampLine, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.42, 0.42, 0.46),
        opacity: 0.82,
      });
    }

    return await pdfDoc.save();
  } catch {
    // If the PDF is encrypted or malformed in a way pdf-lib cannot modify, return original bytes safely
    return rawBytes;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler arquivo PDF'));
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('Conteúdo do PDF vazio'));
      }
    };
    reader.readAsDataURL(file);
  });
}

async function dataUrlToPdfBytes(dataUrl: string): Promise<Uint8Array> {
  try {
    const normalized = dataUrl.startsWith('data:')
      ? dataUrl
      : `data:application/pdf;base64,${dataUrl}`;
    const res = await fetch(normalized);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    const commaIdx = dataUrl.indexOf(',');
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    const binaryStr = window.atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }
}

export function formatPdfSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function uploadPdfFileToCloud(
  file: File,
  authorId: string,
  onProgress?: (percent: number) => void
): Promise<{
  pdfUrl: string;
  pdfTitle: string;
  sizeLabel: string;
}> {
  onProgress?.(5);
  const dataUrl = await readFileAsDataUrl(file);
  onProgress?.(15);

  const pdfTitle = sanitizeString(
    file.name.trim() || 'Documento.pdf',
    SCHEMA_LIMITS.TITLE_MAX,
    'Documento.pdf'
  );
  const sizeLabel = formatPdfSize(file.size);

  const totalChunks = Math.ceil(dataUrl.length / CHUNK_CHAR_SIZE);
  if (totalChunks < 1 || totalChunks > MAX_CHUNKS) {
    throw new Error('Arquivo PDF excede o limite suportado.');
  }

  const pdfId = generateSafeId('pdfdoc');
  let completedChunks = 0;

  for (let start = 0; start < totalChunks; start += UPLOAD_CONCURRENCY) {
    const batchIndices: number[] = [];
    for (
      let idx = start;
      idx < Math.min(totalChunks, start + UPLOAD_CONCURRENCY);
      idx++
    ) {
      batchIndices.push(idx);
    }

    await Promise.all(
      batchIndices.map(async (idx) => {
        const slice = dataUrl.slice(
          idx * CHUNK_CHAR_SIZE,
          (idx + 1) * CHUNK_CHAR_SIZE
        );
        const chunkDocId = `${pdfId}_${idx}`;
        await setDoc(doc(db, 'pdfChunks', chunkDocId), {
          pdfId,
          chunkIndex: idx,
          totalChunks,
          data: slice,
          authorId,
          createdAt: serverTimestamp(),
        });
        completedChunks += 1;
        const pct = 15 + Math.round((completedChunks / totalChunks) * 85);
        onProgress?.(Math.min(100, pct));
      })
    );
  }

  const chunkedRef = `chunked:${pdfId}:${totalChunks}`;

  // Cache local raw bytes immediately for 0ms opening/downloading
  try {
    const fileBuf = await file.arrayBuffer();
    rawPdfBytesCache.set(chunkedRef, new Uint8Array(fileBuf));
  } catch {
    // ignore local byte cache error
  }

  return {
    pdfUrl: chunkedRef,
    pdfTitle,
    sizeLabel,
  };
}

async function resolveRawPdfBytes(pdfUrl: string): Promise<Uint8Array | null> {
  if (!pdfUrl) return null;

  const cachedBytes = rawPdfBytesCache.get(pdfUrl);
  if (cachedBytes) return cachedBytes;

  if (pdfUrl.startsWith('chunked:')) {
    const parts = pdfUrl.split(':');
    const pdfId = parts[1];
    const totalChunks = Number(parts[2]) || 1;
    if (!pdfId) return null;

    const chunkPromises = Array.from({ length: totalChunks }, (_, idx) =>
      getDoc(doc(db, 'pdfChunks', `${pdfId}_${idx}`))
    );
    const snaps = await Promise.all(chunkPromises);
    const orderedSlices: string[] = [];
    for (const snap of snaps) {
      if (!snap.exists()) {
        throw new Error('Partes do PDF não encontradas no banco de dados.');
      }
      const data = snap.data();
      orderedSlices.push(typeof data.data === 'string' ? data.data : '');
    }

    const fullDataUrl = orderedSlices.join('');
    const bytes = await dataUrlToPdfBytes(fullDataUrl);
    rawPdfBytesCache.set(pdfUrl, bytes);
    return bytes;
  }

  if (pdfUrl.startsWith('data:')) {
    const bytes = await dataUrlToPdfBytes(pdfUrl);
    rawPdfBytesCache.set(pdfUrl, bytes);
    return bytes;
  }

  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    rawPdfBytesCache.set(pdfUrl, bytes);
    return bytes;
  } catch {
    return null;
  }
}

export async function resolvePdfUrlToViewable(
  pdfUrl: string,
  watermarkOverride?: StudentPdfWatermarkInfo | null
): Promise<string> {
  if (!pdfUrl) return '';

  const wmKey = getWatermarkSignature(watermarkOverride);
  const cacheKey = `${pdfUrl}::${wmKey}`;
  const cachedBlobUrl = watermarkedBlobUrlCache.get(cacheKey);
  if (cachedBlobUrl) return cachedBlobUrl;

  const rawBytes = await resolveRawPdfBytes(pdfUrl);
  if (!rawBytes) {
    return pdfUrl;
  }

  const stampedBytes = await applyEdgeWatermarkToPdfBytes(
    rawBytes,
    watermarkOverride
  );
  const blob = new Blob([stampedBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });
  const blobUrl = URL.createObjectURL(blob);
  watermarkedBlobUrlCache.set(cacheKey, blobUrl);
  return blobUrl;
}

export async function triggerPdfDownload(
  pdfUrl: string,
  fileName: string,
  watermarkOverride?: StudentPdfWatermarkInfo | null
): Promise<void> {
  const resolvedUrl = await resolvePdfUrlToViewable(pdfUrl, watermarkOverride);
  if (!resolvedUrl) return;

  const cleanName = fileName.toLowerCase().endsWith('.pdf')
    ? fileName
    : `${fileName}.pdf`;

  const link = document.createElement('a');
  link.href = resolvedUrl;
  link.download = cleanName;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
