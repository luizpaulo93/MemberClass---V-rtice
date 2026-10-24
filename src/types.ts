import { Timestamp } from 'firebase/firestore';

export interface PdfAttachment {
  id: string;
  title: string;
  url: string;
  sizeLabel: string;
}

export interface LessonFolder {
  id: string;
  name: string;
  isPublished: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  duration: string;
  thumbnailUrl: string;
  pdfs: PdfAttachment[];
  folderId?: string;
  isFree: boolean;
  isPublished: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  lessonIds: string[];
  isPublished: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  coverUrl: string;
  bannerUrl: string;
  playlistIds: string[];
  featured: boolean;
  isPublished: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Turma {
  id: string;
  name: string;
  description: string;
  courseIds: string[];
  accessAll: boolean;
  isPublished: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone?: string;
  cpf?: string;
  birthDate?: string;
  turmaId?: string;
  status: 'active' | 'blocked';
  courseIds: string[];
  accessAll: boolean;
  addedBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserProgress {
  userId: string;
  displayName?: string;
  phone?: string;
  cpf?: string;
  birthDate?: string;
  favoriteLessonIds: string[];
  completedLessonIds: string[];
  lastWatchedLessonId: string;
  updatedAt?: Timestamp;
}

export type CalendarEventCategory =
  | 'assunto_semana'
  | 'evento_curso'
  | 'simulado'
  | 'revisao'
  | 'feriado_nacional'
  | 'feriado_para';

export type CalendarEventColor =
  | 'blue'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'cyan'
  | 'rose'
  | 'pink'
  | 'indigo'
  | 'teal';

export type CalendarEventIconName =
  | 'book'
  | 'sparkles'
  | 'clipboard'
  | 'flame'
  | 'graduation'
  | 'trophy'
  | 'star'
  | 'flag'
  | 'palmtree'
  | 'bell';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  category: CalendarEventCategory;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  color: CalendarEventColor;
  icon: CalendarEventIconName;
  isPublished: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PlatformConfig {
  brandName: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroBgUrl?: string;
  restrictToStudentList: boolean;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export type EnemArea = 'MT' | 'CN' | 'CH' | 'LC';

export type BubbleOption = 'A' | 'B' | 'C' | 'D' | 'E';

export const BUBBLE_OPTIONS: BubbleOption[] = ['A', 'B', 'C', 'D', 'E'];

export const ENEM_AREA_LABELS: Record<EnemArea, { short: string; full: string }> = {
  MT: { short: 'MT', full: 'Matemática' },
  CN: { short: 'CN', full: 'Ciências da Natureza' },
  CH: { short: 'CH', full: 'Ciências Humanas' },
  LC: { short: 'LC', full: 'Linguagens' },
};

export interface Simulado {
  id: string;
  title: string;
  area: EnemArea;
  questionCount: number;
  timeLimitMinutes: number; // 0 = Tempo Livre
  pdfUrl: string;
  pdfTitle: string;
  answerKey: string; // e.g. "ABCDE..." of length questionCount
  resultsReleased: boolean;
  isPublished: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SimuladoSubmission {
  id: string;
  simuladoId: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: 'in_progress' | 'completed';
  answersString: string; // e.g. "A-C-E..." of length questionCount ('-' = blank)
  startedAtMs: number;
  finishedAtMs: number;
  durationSeconds: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Doubt {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  text: string;
  imageUrl: string;
  likedBy: string[];
  isResolved: boolean;
  createdAtMs: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DoubtReply {
  id: string;
  doubtId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string;
  text: string;
  imageUrl: string;
  createdAtMs: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const ADMIN_BOOTSTRAP_EMAIL = 'luizpaulofisica@gmail.com';

// Schema validation limits synchronized with firebase-blueprint.json & firestore.rules
export const SCHEMA_LIMITS = {
  ID_MAX: 128,
  ID_REGEX: /^[a-zA-Z0-9_\-]+$/,
  TITLE_MAX: 160,
  SUBTITLE_MAX: 240,
  LESSON_DESC_MAX: 4000,
  PLAYLIST_DESC_MAX: 1500,
  COURSE_DESC_MAX: 3000,
  CATEGORY_MAX: 80,
  URL_MAX: 900000,
  PDF_URL_MAX: 900000,
  MAX_PDFS: 20,
  MAX_LESSON_IDS: 100,
  MAX_PLAYLIST_IDS: 50,
  MAX_QUESTIONS: 180,
};

// Recommended vertical dimensions displayed in Admin UI
export const IMAGE_DIMENSIONS = {
  PLATFORM_BG: {
    label: '1080 × 1920 px (Vertical 9:16) ou 1920 × 1080 px (Horizontal)',
    targetWidth: 1280,
    targetHeight: 1280,
  },
  COURSE_COVER: {
    label: '600 × 900 px (Vertical 2:3 — Padrão MemberClass)',
    targetWidth: 600,
    targetHeight: 900,
  },
  PLAYLIST_COVER: {
    label: '600 × 800 px (Vertical 3:4)',
    targetWidth: 600,
    targetHeight: 800,
  },
  LESSON_COVER: {
    label: '600 × 800 px (Vertical 3:4)',
    targetWidth: 600,
    targetHeight: 800,
  },
};

export function sanitizeString(val: string, maxLength: number, fallback = ''): string {
  const trimmed = (val || '').trim();
  if (!trimmed && fallback) return fallback.slice(0, maxLength);
  return trimmed.slice(0, maxLength);
}

export function formatBirthDateInput(raw: string): string {
  // If YYYY-MM-DD (from native date picker), convert to DD/MM/AAAA
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    const [y, m, d] = raw.trim().split('-');
    return `${d}/${m}/${y}`;
  }
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatBirthDateDisplay(raw?: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  return v;
}

export function generateSafeId(prefix: string): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36);
  return `${prefix}_${timePart}_${randomPart}`.replace(/[^a-zA-Z0-9_\-]/g, '');
}

export function emailToStudentDocId(email: string): string {
  const clean = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 100);
  return `stu_${clean || 'user'}`;
}

export function buildSubmissionDocId(simuladoId: string, userId: string): string {
  const s = simuladoId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 55);
  const u = userId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 55);
  return `sub_${s}_${u}`;
}

export async function processAndResizeImageFile(
  file: File,
  targetWidth = 900,
  targetHeight = 900,
  quality = 0.85
): Promise<string> {
  const { compressImageToDataUrl } = await import('./utils/imageCompress');
  return compressImageToDataUrl(file, Math.max(targetWidth, targetHeight), quality);
}

/**
 * Preserves full aspect ratio (no cropping) for question photos and handwritten solution photos,
 * compressing to fit cleanly inside Firestore document limits while keeping math/text sharp.
 */
export async function processDoubtPhotoFile(
  file: File,
  maxDimension = 1400
): Promise<string> {
  const { compressImageToDataUrl } = await import('./utils/imageCompress');
  return compressImageToDataUrl(file, maxDimension, 0.85);
}

export function hasLessonVideo(youtubeId?: string | null): boolean {
  const clean = (youtubeId || '').trim();
  return clean.length >= 5 && clean !== 'no_video';
}

export function extractYoutubeId(input: string): string {
  const raw = (input || '').trim();
  if (!raw || raw === 'no_video') return '';

  try {
    if (raw.includes('youtu.be/')) {
      const after = raw.split('youtu.be/')[1] || '';
      const id = after.split(/[?&/#]/)[0];
      if (id && SCHEMA_LIMITS.ID_REGEX.test(id)) return id.slice(0, 64);
    }
    if (raw.includes('youtube.com/')) {
      const urlObj = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const vParam = urlObj.searchParams.get('v');
      if (vParam && SCHEMA_LIMITS.ID_REGEX.test(vParam)) return vParam.slice(0, 64);

      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const embedIdx = pathParts.findIndex((p) => ['embed', 'shorts', 'live', 'v'].includes(p));
      if (embedIdx !== -1 && pathParts[embedIdx + 1]) {
        const id = pathParts[embedIdx + 1].split(/[?&/#]/)[0];
        if (SCHEMA_LIMITS.ID_REGEX.test(id)) return id.slice(0, 64);
      }
    }
  } catch {
    // fallback below
  }

  const match = raw.match(/([a-zA-Z0-9_-]{11})/);
  if (match && match[1]) return match[1];

  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64);
  return cleaned.length >= 5 ? cleaned : '';
}

export interface CoverPreset {
  id: string;
  label: string;
  gradient: string;
  accentColor: string;
  patternType: 'stadium' | 'trophy' | 'astronaut' | 'strategy' | 'mastery';
}

export const COVER_PRESETS: CoverPreset[] = [
  {
    id: 'preset:stadium',
    label: 'Arena Azul Safira (Padrão)',
    gradient: 'from-[#0a1530] via-[#172554] to-[#2563eb]',
    accentColor: '#3b82f6',
    patternType: 'stadium',
  },
  {
    id: 'preset:trophy',
    label: 'Troféu Elite Azul',
    gradient: 'from-[#050b18] via-[#0f244c] to-[#1d4ed8]',
    accentColor: '#60a5fa',
    patternType: 'trophy',
  },
  {
    id: 'preset:astronaut',
    label: 'Visão Cósmica Deep Blue',
    gradient: 'from-[#030712] via-[#0c1f44] to-[#1e40af]',
    accentColor: '#38bdf8',
    patternType: 'astronaut',
  },
  {
    id: 'preset:strategy',
    label: 'Estratégia & Dados',
    gradient: 'from-[#081226] via-[#0f172a] to-[#2563eb]',
    accentColor: '#60a5fa',
    patternType: 'strategy',
  },
  {
    id: 'preset:mastery',
    label: 'Comunidade VIP Índigo',
    gradient: 'from-[#060d20] via-[#1e293b] to-[#1d4ed8]',
    accentColor: '#93c5fd',
    patternType: 'mastery',
  },
];

export const FREE_COURSE_ID = 'course_free_access';
export const FREE_PLAYLIST_ID = 'playlist_free_access';
