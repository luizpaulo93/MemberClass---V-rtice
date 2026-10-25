/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Play,
  CheckCircle2,
  FileText,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ListVideo,
  Home,
  ClipboardCheck,
  MessageCircle,
  LogOut,
  Sliders,
  ArrowLeft,
  ArrowRight,
  Download,
  Lock,
  User as UserIcon,
  X,
  Trash2,
  Sun,
  Moon,
  Calendar as CalendarIcon,
  Sparkles,
  Compass,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  Course,
  Lesson,
  LessonFolder,
  Playlist,
  Student,
  Turma,
  UserProgress,
  PlatformConfig,
  PdfAttachment,
  Simulado,
  SimuladoSubmission,
  Doubt,
  DoubtReply,
  CalendarEvent,
  emailToStudentDocId,
  buildSubmissionDocId,
  generateSafeId,
  sanitizeString,
  formatBirthDateInput,
  formatBirthDateDisplay,
  hasLessonVideo,
  SCHEMA_LIMITS,
  FREE_COURSE_ID,
  FREE_PLAYLIST_ID,
  sortByOrder,
} from './types';
import { CoverArtwork } from './components/CoverArtwork';
import { StealthVideoPlayer } from './components/StealthVideoPlayer';
import { VerticeLogo } from './components/VerticeLogo';
import {
  ensurePdfUrlChunked,
  triggerPdfDownload,
  setStudentPdfWatermarkInfo,
  updatePdfChunksIsFree,
} from './utils/pdfStorage';
import { Mentoria, subscribeMyMentoria } from './utils/mentoriaService';

const PdfCanvasViewer = React.lazy(() =>
  import('./components/PdfCanvasViewer').then((m) => ({
    default: m.PdfCanvasViewer,
  }))
);

const AdminStudioModal = React.lazy(() =>
  import('./components/AdminStudioModal').then((m) => ({
    default: m.AdminStudioModal,
  }))
);
const CalendarModal = React.lazy(() =>
  import('./components/CalendarModal').then((m) => ({
    default: m.CalendarModal,
  }))
);
const SimuladosWindow = React.lazy(() =>
  import('./components/SimuladosWindow').then((m) => ({
    default: m.SimuladosWindow,
  }))
);
const SimuladoEditorWindow = React.lazy(() =>
  import('./components/SimuladoEditorWindow').then((m) => ({
    default: m.SimuladoEditorWindow,
  }))
);
const DuvidasWindow = React.lazy(() =>
  import('./components/DuvidasWindow').then((m) => ({
    default: m.DuvidasWindow,
  }))
);
const LessonPopupModal = React.lazy(() =>
  import('./components/LessonPopupModal').then((m) => ({
    default: m.LessonPopupModal,
  }))
);
const MentoriaWindow = React.lazy(() =>
  import('./components/MentoriaWindow').then((m) => ({
    default: m.MentoriaWindow,
  }))
);

const LazyComponentFallback = () => (
  <div className="w-full py-16 flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
  </div>
);

interface ClassroomLessonRowProps {
  lesson: Lesson;
  idx: number;
  isCurrent: boolean;
  isDone: boolean;
  onSelect: (lessonId: string) => void;
}

const ClassroomLessonRow = React.memo<ClassroomLessonRowProps>(
  ({ lesson, idx, isCurrent, isDone, onSelect }) => (
    <button
      type="button"
      onClick={() => onSelect(lesson.id)}
      className={`cv-auto-row w-full flex items-center justify-between gap-2.5 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
        isCurrent
          ? 'bg-brand border border-brand-accent text-white shadow-glow-sm'
          : 'bg-surface-2 hover:bg-surface-3 border border-line text-ink-2 hover:text-ink'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono tabular-nums shrink-0 ${
            isCurrent
              ? 'bg-white text-[#1d4ed8] font-bold'
              : isDone
                ? 'bg-emerald-500/20 text-emerald-500'
                : 'bg-chip text-ink-2'
          }`}
        >
          {isDone ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            idx + 1
          )}
        </div>
        <p
          className={`text-xs truncate ${
            isCurrent ? 'font-bold text-white' : 'font-medium text-ink'
          }`}
        >
          {lesson.title}
        </p>
      </div>

      {isCurrent && (
        <Play className="w-3.5 h-3.5 text-white fill-current shrink-0" />
      )}
    </button>
  )
);

type NavSection =
  | 'home'
  | 'simulados'
  | 'lessons'
  | 'duvidas'
  | 'mentoria'
  | 'free'
  | 'admin';

// Guarda onde o aluno estava (sobrevive a recarregar a aba, mas não a fechar o navegador)
const NAV_STATE_KEY = 'vertice_nav_state_v1';
const NAV_SECTIONS: NavSection[] = [
  'home',
  'simulados',
  'lessons',
  'duvidas',
  'mentoria',
  'free',
  'admin',
];

interface SavedNavState {
  activeNav: NavSection;
  selectedCourseId: string | null;
  selectedPlaylistId: string | null;
  selectedLessonId: string | null;
}

function loadSavedNavState(): SavedNavState | null {
  try {
    const raw = sessionStorage.getItem(NAV_STATE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SavedNavState>;
    const str = (v: unknown) =>
      typeof v === 'string' && v.length <= 128 ? v : null;
    return {
      activeNav: NAV_SECTIONS.includes(p.activeNav as NavSection)
        ? (p.activeNav as NavSection)
        : 'home',
      selectedCourseId: str(p.selectedCourseId),
      selectedPlaylistId: str(p.selectedPlaylistId),
      selectedLessonId: str(p.selectedLessonId),
    };
  } catch {
    return null;
  }
}

class SafeErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('SafeErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-8 rounded-2xl bg-surface border border-rose-500/30 text-center space-y-3 my-6 max-w-lg mx-auto shadow-card">
            <p className="text-sm font-bold text-rose-500">
              Ocorreu um problema ao carregar este vídeo.
            </p>
            <p className="text-xs text-ink-muted">
              O vídeo não pôde ser iniciado ou ocorreu um erro de conexão.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-5 py-2.5 rounded-full bg-brand hover:bg-brand-hover text-xs font-bold text-white transition-all cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

const CONFIG_CACHE_KEY = 'vertice_platform_config_v1';
const BOOT_CACHE_KEY = 'vertice_fast_boot_v2';
const AUTH_HINT_KEY = 'vertice_auth_hint_v2';
const THEME_STORAGE_KEY = 'vertice_theme_v1';
const FAST_BOOT_IMAGE_MAX_CHARS = 60000;

interface FastBootCache {
  courses?: Course[];
  playlists?: Playlist[];
  lessons?: Lesson[];
  lessonFolders?: LessonFolder[];
  simulados?: Simulado[];
  turmas?: Turma[];
  calendarEvents?: CalendarEvent[];
  myStudentRecord?: Student | null;
  userProgress?: UserProgress | null;
}

interface AuthHint {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
}

const DEFAULT_CONFIG: PlatformConfig = {
  brandName: 'CURSO VÉRTICE',
  heroTitle: 'Sua plataforma para Enem e vestibulares',
  heroSubtitle: 'Especialista em física, química e matemática',
  heroCtaText: 'Confira agora!',
  heroBgUrl: '',
  restrictToStudentList: true,
  updatedBy: 'system',
};

function loadCachedPlatformConfig(): {
  config: PlatformConfig;
  hasCache: boolean;
} {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlatformConfig>;
      return {
        hasCache: true,
        config: {
          brandName: parsed.brandName || DEFAULT_CONFIG.brandName,
          heroTitle: parsed.heroTitle || DEFAULT_CONFIG.heroTitle,
          heroSubtitle: parsed.heroSubtitle || DEFAULT_CONFIG.heroSubtitle,
          heroCtaText: parsed.heroCtaText || DEFAULT_CONFIG.heroCtaText,
          heroBgUrl: parsed.heroBgUrl || '',
          restrictToStudentList:
            typeof parsed.restrictToStudentList === 'boolean'
              ? parsed.restrictToStudentList
              : true,
          updatedBy: parsed.updatedBy || 'system',
        },
      };
    }
  } catch {
    // ignore storage errors
  }
  return { config: DEFAULT_CONFIG, hasCache: false };
}

function saveCachedPlatformConfig(cfg: PlatformConfig) {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
}

let memoryBootCache: FastBootCache | null = null;

function loadFastBootCache(): FastBootCache | null {
  if (memoryBootCache) return memoryBootCache;
  try {
    const raw = localStorage.getItem(BOOT_CACHE_KEY);
    if (!raw) return null;
    memoryBootCache = JSON.parse(raw) as FastBootCache;
    return memoryBootCache;
  } catch {
    return null;
  }
}

function saveFastBootCache(patch: Partial<FastBootCache>) {
  try {
    const prev = memoryBootCache || loadFastBootCache() || {};
    const merged: FastBootCache = { ...prev, ...patch };
    if (patch.courses && merged.courses) {
      merged.courses = merged.courses.map((c) => ({
        ...c,
        coverUrl:
          c.coverUrl && c.coverUrl.length > FAST_BOOT_IMAGE_MAX_CHARS
            ? ''
            : c.coverUrl,
        bannerUrl:
          c.bannerUrl && c.bannerUrl.length > FAST_BOOT_IMAGE_MAX_CHARS
            ? ''
            : c.bannerUrl,
      }));
    }
    if (patch.playlists && merged.playlists) {
      merged.playlists = merged.playlists.map((p) => ({
        ...p,
        coverUrl:
          p.coverUrl && p.coverUrl.length > FAST_BOOT_IMAGE_MAX_CHARS
            ? ''
            : p.coverUrl,
      }));
    }
    if (patch.lessons && merged.lessons) {
      merged.lessons = merged.lessons.map((l) => ({
        ...l,
        thumbnailUrl:
          l.thumbnailUrl && l.thumbnailUrl.length > FAST_BOOT_IMAGE_MAX_CHARS
            ? ''
            : l.thumbnailUrl,
        pdfs: (l.pdfs || []).map((pdf) => ({
          ...pdf,
          url:
            pdf.url && pdf.url.length > FAST_BOOT_IMAGE_MAX_CHARS
              ? ''
              : pdf.url,
        })),
      }));
    }
    if (patch.simulados && merged.simulados) {
      merged.simulados = merged.simulados.map((s) => ({
        ...s,
        answerKey: '',
        pdfUrl:
          s.pdfUrl && s.pdfUrl.length > FAST_BOOT_IMAGE_MAX_CHARS
            ? ''
            : s.pdfUrl,
      }));
    }
    if (merged.myStudentRecord) {
      merged.myStudentRecord = {
        ...merged.myStudentRecord,
        cpf: '',
        phone: '',
        birthDate: '',
      };
    }
    if (merged.userProgress) {
      merged.userProgress = {
        ...merged.userProgress,
        cpf: '',
        phone: '',
        birthDate: '',
      };
    }
    memoryBootCache = merged;
    localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage quota errors
  }
}

function clearUserLocalCache(uid?: string | null) {
  memoryBootCache = null;
  try {
    localStorage.removeItem(BOOT_CACHE_KEY);
    localStorage.removeItem(AUTH_HINT_KEY);
    if (uid) {
      localStorage.removeItem(`vertice_watch_progress_${uid}`);
      localStorage.removeItem(`vertice_playlist_watch_${uid}`);
    }
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('vertice_watch_progress_') ||
          k.startsWith('vertice_playlist_watch_') ||
          k.startsWith('vertice_simulado_'))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore storage errors
  }
}

function loadAuthHint(): AuthHint | null {
  try {
    const raw = localStorage.getItem(AUTH_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthHint;
    return parsed && parsed.uid ? parsed : null;
  } catch {
    return null;
  }
}

function saveAuthHint(u: FirebaseUser | null) {
  try {
    if (!u) {
      localStorage.removeItem(AUTH_HINT_KEY);
      return;
    }
    const hint: AuthHint = {
      uid: u.uid,
      email: u.email,
      emailVerified: Boolean(u.emailVerified),
      displayName: u.displayName,
      photoURL: u.photoURL,
    };
    localStorage.setItem(AUTH_HINT_KEY, JSON.stringify(hint));
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  const initialConfigState = useMemo(() => loadCachedPlatformConfig(), []);
  const initialBootCache = useMemo(() => loadFastBootCache(), []);
  const initialAuthHint = useMemo(() => loadAuthHint(), []);

  const [user, setUser] = useState<FirebaseUser | null>(
    () => auth.currentUser || (initialAuthHint as unknown as FirebaseUser | null)
  );
  const [verifiedAuthUid, setVerifiedAuthUid] = useState<string | null>(
    () => auth.currentUser?.uid || null
  );
  const [authReady, setAuthReady] = useState<boolean>(
    () => Boolean(auth.currentUser || initialAuthHint)
  );
  // true só depois que o Firebase responder de verdade (onAuthStateChanged).
  // Enquanto for false, NADA é apagado: a tela usa o cache de abertura rápida.
  const [authResolved, setAuthResolved] = useState<boolean>(
    () => Boolean(auth.currentUser)
  );
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Firestore Collections State
  const [lessons, setLessons] = useState<Lesson[]>(() =>
    sortByOrder(initialBootCache?.lessons || [])
  );
  const [lessonFolders, setLessonFolders] = useState<LessonFolder[]>(() =>
    sortByOrder(initialBootCache?.lessonFolders || [])
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    sortByOrder(initialBootCache?.playlists || [])
  );
  const [courses, setCourses] = useState<Course[]>(() =>
    sortByOrder(initialBootCache?.courses || [])
  );
  const [turmas, setTurmas] = useState<Turma[]>(
    () => initialBootCache?.turmas || []
  );
  const [students, setStudents] = useState<Student[]>([]);
  const [simulados, setSimulados] = useState<Simulado[]>(
    () => initialBootCache?.simulados || []
  );
  const [simuladoSubmissions, setSimuladoSubmissions] = useState<
    SimuladoSubmission[]
  >([]);
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [doubtReplies, setDoubtReplies] = useState<DoubtReply[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(
    () => initialBootCache?.calendarEvents || []
  );
  const [myStudentRecord, setMyStudentRecord] = useState<Student | null>(
    () => initialBootCache?.myStudentRecord || null
  );
  const [userProgress, setUserProgress] = useState<UserProgress | null>(
    () => initialBootCache?.userProgress || null
  );
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(
    () => initialConfigState.config
  );
  const [heroImgLoaded, setHeroImgLoaded] = useState(false);

  useEffect(() => {
    setHeroImgLoaded(false);
  }, [platformConfig.heroBgUrl]);

  // Initial Firestore Snapshot Readiness Flags
  const [configLoaded, setConfigLoaded] = useState<boolean>(
    () => initialConfigState.hasCache
  );
  const [coursesLoaded, setCoursesLoaded] = useState<boolean>(
    () => Array.isArray(initialBootCache?.courses)
  );
  const [playlistsLoaded, setPlaylistsLoaded] = useState<boolean>(
    () => Array.isArray(initialBootCache?.playlists)
  );
  const [lessonsLoaded, setLessonsLoaded] = useState<boolean>(
    () => Array.isArray(initialBootCache?.lessons)
  );

  const [enableDoubtsSync, setEnableDoubtsSync] = useState(false);

  // Navigation & Window State
  const initialNavState = useMemo(() => loadSavedNavState(), []);
  const [activeNav, setActiveNav] = useState<NavSection>(
    () => initialNavState?.activeNav || 'home'
  );
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    () => initialNavState?.selectedCourseId || null
  );
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    () => initialNavState?.selectedPlaylistId || null
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    () => initialNavState?.selectedLessonId || null
  );

  // Salva a posição de navegação a cada mudança (para voltar ao mesmo lugar se a aba recarregar)
  useEffect(() => {
    try {
      sessionStorage.setItem(
        NAV_STATE_KEY,
        JSON.stringify({
          activeNav,
          selectedCourseId,
          selectedPlaylistId,
          selectedLessonId,
        } satisfies SavedNavState)
      );
    } catch {
      // ignore storage errors
    }
  }, [activeNav, selectedCourseId, selectedPlaylistId, selectedLessonId]);
  const [theaterMode, setTheaterMode] = useState(false);
  const [activePdf, setActivePdf] = useState<PdfAttachment | null>(null);

  // Simulado Editor Window State
  const [isSimuladoEditorOpen, setIsSimuladoEditorOpen] = useState(false);
  const [editingSimuladoDirect, setEditingSimuladoDirect] =
    useState<Simulado | null>(null);

  const [lockedCoursePopup, setLockedCoursePopup] = useState<Course | null>(
    null
  );

  // Minimalist Lesson Popup Modal State
  const [isLessonPopupOpen, setIsLessonPopupOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [lessonModalDefaultFree, setLessonModalDefaultFree] = useState(false);
  const [lessonModalDefaultFolderId, setLessonModalDefaultFolderId] =
    useState<string>('');
  const [isLessonsDropdownOpen, setIsLessonsDropdownOpen] = useState(false);

  // Top-right Profile Dropdown & Profile Modal State
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileNameError, setProfileNameError] = useState<string | null>(null);
  const profileNameRef = useRef<HTMLInputElement>(null);
  const [profilePhoneInput, setProfilePhoneInput] = useState('');
  const [profileBirthDateInput, setProfileBirthDateInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Calendar Modal Window State + Visible Year filter (Fase 1.8)
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarVisibleYear, setCalendarVisibleYear] = useState<number>(() =>
    new Date().getFullYear()
  );

  // User Theme State ('dark' | 'light') with persistent storage & smooth 250ms transition
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'light'
        ? 'light'
        : 'dark';
    } catch {
      return 'dark';
    }
  });

  const themeSwitchTimerRef = useRef<number | null>(null);

  const applyThemeChange = useCallback(
    (nextTheme: 'dark' | 'light' | ((prev: 'dark' | 'light') => 'dark' | 'light')) => {
      const root = document.documentElement;
      root.classList.add('theme-switching');
      if (themeSwitchTimerRef.current !== null) {
        window.clearTimeout(themeSwitchTimerRef.current);
      }
      themeSwitchTimerRef.current = window.setTimeout(() => {
        root.classList.remove('theme-switching');
      }, 250);
      setTheme(nextTheme);
    },
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('theme-light');
    } else {
      root.classList.remove('theme-light');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#f0f5fc' : '#070b14');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // Fase 1.9: Preload secondary tabs in requestIdleCallback after first paint
  useEffect(() => {
    if (!user) return;
    const preloadChunks = () => {
      import('./components/SimuladosWindow').catch(() => {});
      import('./components/DuvidasWindow').catch(() => {});
      import('./components/CalendarModal').catch(() => {});
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(preloadChunks, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(preloadChunks, 1500);
    return () => window.clearTimeout(timer);
  }, [user]);

  // Deletion Confirmation Popup State
  const [pendingDelete, setPendingDelete] = useState<{
    type:
      | 'student'
      | 'turma'
      | 'lesson'
      | 'lessonFolder'
      | 'playlist'
      | 'course'
      | 'simulado'
      | 'doubt'
      | 'doubtReply'
      | 'calendarEvent';
    id: string;
    title: string;
    articleAndType: string;
  } | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const lessonsDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const [lessonWatchMap, setLessonWatchMap] = useState<
    Record<
      string,
      {
        currentTimeSec: number;
        durationSec: number;
        courseId?: string | null;
        playlistId?: string | null;
        updatedAt: number;
      }
    >
  >({});

  const [playlistWatchMap, setPlaylistWatchMap] = useState<
    Record<
      string,
      {
        lessonId: string;
        courseId?: string | null;
        updatedAt: number;
      }
    >
  >({});

  // Fase 1.4: In-memory ref for video playback progress so App only re-renders every 15s, on pause, on video end, or on visibilitychange
  const pendingLessonProgressRef = useRef<
    Record<
      string,
      {
        currentTimeSec: number;
        durationSec: number;
        courseId: string | null;
        playlistId: string | null;
        updatedAt: number;
      }
    >
  >({});
  const lastFlushedWatchAtRef = useRef<Record<string, number>>({});

  const flushPendingWatchProgress = useCallback(
    (specificLessonId?: string) => {
      if (!user?.uid) return;
      const pending = pendingLessonProgressRef.current;
      const keys = specificLessonId
        ? pending[specificLessonId]
          ? [specificLessonId]
          : []
        : Object.keys(pending);
      if (keys.length === 0) return;

      const uid = user.uid;
      const now = Date.now();

      setLessonWatchMap((prev) => {
        const next = { ...prev };
        for (const lid of keys) {
          const entry = pending[lid];
          if (!entry) continue;
          next[lid] = {
            currentTimeSec: entry.currentTimeSec,
            durationSec: entry.durationSec || prev[lid]?.durationSec || 0,
            courseId: entry.courseId ?? prev[lid]?.courseId ?? null,
            playlistId: entry.playlistId ?? prev[lid]?.playlistId ?? null,
            updatedAt: entry.updatedAt || now,
          };
          lastFlushedWatchAtRef.current[lid] = now;
        }
        try {
          localStorage.setItem(
            `vertice_watch_progress_${uid}`,
            JSON.stringify(next)
          );
        } catch {
          // ignore
        }
        return next;
      });

      setPlaylistWatchMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const lid of keys) {
          const entry = pending[lid];
          if (!entry || !entry.playlistId) continue;
          next[entry.playlistId] = {
            lessonId: lid,
            courseId: entry.courseId ?? prev[entry.playlistId]?.courseId ?? null,
            updatedAt: entry.updatedAt || now,
          };
          changed = true;
        }
        if (!changed) return prev;
        try {
          localStorage.setItem(
            `vertice_playlist_watch_${uid}`,
            JSON.stringify(next)
          );
        } catch {
          // ignore
        }
        return next;
      });
    },
    [user?.uid]
  );

  // Flush pending progress when tab becomes hidden or before page unload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingWatchProgress();
      }
    };
    const handlePageHide = () => {
      flushPendingWatchProgress();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [flushPendingWatchProgress]);

  useEffect(() => {
    if (!user?.uid) {
      setLessonWatchMap({});
      setPlaylistWatchMap({});
      pendingLessonProgressRef.current = {};
      lastFlushedWatchAtRef.current = {};
      return;
    }
    try {
      const raw = localStorage.getItem(`vertice_watch_progress_${user.uid}`);
      if (raw) {
        setLessonWatchMap(JSON.parse(raw));
      } else {
        setLessonWatchMap({});
      }
    } catch {
      setLessonWatchMap({});
    }
    try {
      const rawPl = localStorage.getItem(`vertice_playlist_watch_${user.uid}`);
      if (rawPl) {
        setPlaylistWatchMap(JSON.parse(rawPl));
      } else {
        setPlaylistWatchMap({});
      }
    } catch {
      setPlaylistWatchMap({});
    }
  }, [user?.uid]);

  const currentStudentWatermarkName =
    myStudentRecord?.name ||
    userProgress?.displayName ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'Aluno';
  const currentStudentWatermarkCpf =
    myStudentRecord?.cpf || userProgress?.cpf || 'Não cadastrado';
  const currentStudentWatermarkEmail =
    user?.email || myStudentRecord?.email || 'Não informado';

  useEffect(() => {
    if (!user) {
      setStudentPdfWatermarkInfo(null);
      return;
    }
    setStudentPdfWatermarkInfo({
      name: currentStudentWatermarkName,
      cpf: currentStudentWatermarkCpf,
      email: currentStudentWatermarkEmail,
    });
  }, [
    user,
    currentStudentWatermarkName,
    currentStudentWatermarkCpf,
    currentStudentWatermarkEmail,
  ]);

  useEffect(() => {
    if (!isLessonsDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        lessonsDropdownRef.current &&
        !lessonsDropdownRef.current.contains(e.target as Node)
      ) {
        setIsLessonsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isLessonsDropdownOpen]);

  useEffect(() => {
    if (!isProfileDropdownOpen) return;
    const handleOutsideProfileClick = (e: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(e.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideProfileClick);
    return () =>
      document.removeEventListener('mousedown', handleOutsideProfileClick);
  }, [isProfileDropdownOpen]);

  const userEmail = user?.email || null;
  const userEmailVerified = Boolean(user?.emailVerified);

  const [isAdminDoc, setIsAdminDoc] = useState<boolean>(false);
  const [adminCheckDone, setAdminCheckDone] = useState<boolean>(false);

  useEffect(() => {
    if (!verifiedAuthUid) {
      setIsAdminDoc(false);
      setAdminCheckDone(false);
      return;
    }
    setAdminCheckDone(false);
    const unsubAdmin = onSnapshot(
      doc(db, 'admins', verifiedAuthUid),
      (snap) => {
        setIsAdminDoc(snap.exists());
        setAdminCheckDone(true);
      },
      () => {
        setIsAdminDoc(false);
        setAdminCheckDone(true);
      }
    );
    return () => unsubAdmin();
  }, [verifiedAuthUid]);

  const isAdmin = useMemo(() => {
    const isOwner = Boolean(
      userEmail &&
        userEmailVerified &&
        userEmail.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase()
    );
    return isOwner || isAdminDoc;
  }, [userEmail, userEmailVerified, isAdminDoc]);

  const [myMentoria, setMyMentoria] = useState<Mentoria | null>(null);

  useEffect(() => {
    if (!userEmail) {
      setMyMentoria(null);
      return;
    }
    const unsub = subscribeMyMentoria(userEmail, (m) => {
      setMyMentoria(m);
    });
    return () => unsub();
  }, [userEmail]);

  const myStudentTurma = useMemo(() => {
    if (!myStudentRecord?.turmaId) return null;
    return turmas.find((t) => t.id === myStudentRecord.turmaId) || null;
  }, [myStudentRecord?.turmaId, turmas]);

  const canAccessCourse = (courseId: string): boolean => {
    if (courseId === FREE_COURSE_ID) return true;
    if (isAdmin) return true;
    if (!myStudentRecord || !myStudentTurma) return false;
    if (myStudentTurma.accessAll) return true;
    return Boolean(myStudentTurma.courseIds?.includes(courseId));
  };

  const isLiberatedUser = useMemo(() => {
    if (isAdmin) return true;
    if (!myStudentRecord || myStudentRecord.status !== 'active' || !myStudentTurma)
      return false;
    const regularCourses = courses.filter((c) => c.id !== FREE_COURSE_ID);
    if (myStudentTurma.accessAll) return true;
    if (regularCourses.length > 0) {
      return regularCourses.some((c) =>
        Boolean(myStudentTurma.courseIds?.includes(c.id))
      );
    }
    return (myStudentTurma.courseIds?.length || 0) > 0;
  }, [isAdmin, myStudentRecord, myStudentTurma, courses]);

  const isBlockedUser = !isLiberatedUser;

  const hasActiveMentoria =
    isAdmin || (!isBlockedUser && myMentoria?.status === 'active');

  const canAccessPlaylist = (pl: Playlist): boolean => {
    if (pl.id === FREE_PLAYLIST_ID) return true;
    if (isAdmin) return true;
    if (!myStudentRecord || !myStudentTurma) return false;
    const parentCourses = courses.filter(
      (c) => c.id !== FREE_COURSE_ID && c.playlistIds?.includes(pl.id)
    );
    if (parentCourses.length > 0) {
      return parentCourses.some((c) => canAccessCourse(c.id));
    }
    return Boolean(myStudentTurma.accessAll);
  };

  // Simulado Keys isolation & resolution (A4.1)
  const [simuladoKeysMap, setSimuladoKeysMap] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!verifiedAuthUid || !isAdmin) return;
    if (activeNav !== 'simulados' && activeNav !== 'admin') return;
    const unsubKeys = onSnapshot(
      collection(db, 'simuladoKeys'),
      (snap) => {
        const map: Record<string, string> = {};
        snap.forEach((d) => {
          const data = d.data();
          if (data && typeof data.answerKey === 'string') {
            map[d.id] = data.answerKey;
          }
        });
        setSimuladoKeysMap(map);
      },
      () => {}
    );
    return () => unsubKeys();
  }, [verifiedAuthUid, isAdmin, activeNav]);

  useEffect(() => {
    if (isAdmin || isBlockedUser || !verifiedAuthUid) return;
    if (activeNav !== 'simulados') return;
    const releasedSims = simulados.filter((s) => s.resultsReleased);
    if (releasedSims.length === 0) return;

    let active = true;
    Promise.all(
      releasedSims.map(async (s) => {
        try {
          const snap = await getDoc(doc(db, 'simuladoKeys', s.id));
          if (snap.exists()) {
            return {
              id: s.id,
              key: (snap.data()?.answerKey as string) || '',
            };
          }
        } catch {
          // ignore permission denied
        }
        return { id: s.id, key: '' };
      })
    ).then((results) => {
      if (!active) return;
      setSimuladoKeysMap((prev) => {
        const next = { ...prev };
        results.forEach((r) => {
          if (r.key) next[r.id] = r.key;
        });
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [isAdmin, isBlockedUser, verifiedAuthUid, simulados, activeNav]);

  const resolvedSimulados = useMemo(() => {
    return simulados.map((s) => ({
      ...s,
      answerKey: simuladoKeysMap[s.id] || s.answerKey || '',
    }));
  }, [simulados, simuladoKeysMap]);

  // 1. Auth Listener (confirms Firebase Auth session & updates fast-boot hint)
  useEffect(() => {
    // Rede de segurança: se o Firebase não responder em 8 s, libera a tela
    // (antes eram 350 ms, curto demais em celular: mostrava o login por engano).
    const fallbackTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 8000);
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      window.clearTimeout(fallbackTimer);
      setUser(currentUser);
      setVerifiedAuthUid(currentUser?.uid || null);
      saveAuthHint(currentUser);
      if (!currentUser) {
        clearUserLocalCache(null);
      }
      setAuthResolved(true);
      setAuthReady(true);
    });
    return () => {
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  // Ensure initial loading spinner never hangs on new devices/tablets if network or snapshots are slow.
  // 5 s (antes 250 ms: abria a tela inicial vazia e depois "piscava" ao chegar os dados).
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      setConfigLoaded(true);
      setCoursesLoaded(true);
      setPlaylistsLoaded(true);
      setLessonsLoaded(true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (!verifiedAuthUid) {
      setEnableDoubtsSync(false);
      return;
    }
    if (activeNav === 'duvidas') {
      setEnableDoubtsSync(true);
    }
  }, [verifiedAuthUid, activeNav]);

  // 2. Real-time Firestore Subscriptions (Core Home collections)
  useEffect(() => {
    if (!verifiedAuthUid) {
      // CORREÇÃO DO "PISCAR": só limpa os dados quando o Firebase CONFIRMAR que não há
      // usuário. Antes limpava logo ao abrir (auth ainda restaurando), apagando a tela
      // que veio do cache e jogando o aluno de volta para o início.
      if (authResolved) {
        setLessons([]);
        setLessonFolders([]);
        setPlaylists([]);
        setCourses([]);
        setTurmas([]);
        setStudents([]);
        setSimulados([]);
        setSimuladoSubmissions([]);
        setDoubts([]);
        setDoubtReplies([]);
        setMyStudentRecord(null);
        setUserProgress(null);
      }
      return;
    }

    const configRef = doc(db, 'platformConfig', 'main');
    const unsubConfig = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PlatformConfig;
          const nextConfig: PlatformConfig = {
            brandName:
              !data.brandName || data.brandName === 'SPORTLOCKER'
                ? 'CURSO VÉRTICE'
                : data.brandName,
            heroTitle:
              !data.heroTitle || data.heroTitle === 'Arriscado é não arriscar!'
                ? 'Sua plataforma para Enem e vestibulares'
                : data.heroTitle,
            heroSubtitle:
              !data.heroSubtitle ||
              data.heroSubtitle === 'O melhor do esporte você encontra aqui!'
                ? 'Especialista em física, química e matemática'
                : data.heroSubtitle,
            heroCtaText: data.heroCtaText || 'Confira agora!',
            heroBgUrl: data.heroBgUrl || '',
            restrictToStudentList:
              typeof data.restrictToStudentList === 'boolean'
                ? data.restrictToStudentList
                : true,
            updatedBy: data.updatedBy || verifiedAuthUid,
          };
          setPlatformConfig(nextConfig);
          saveCachedPlatformConfig(nextConfig);
        }
        setConfigLoaded(true);
      },
      (err) => {
        setConfigLoaded(true);
        handleFirestoreError(err, OperationType.GET, 'platformConfig/main');
      }
    );

    const coursesQuery = query(
      collection(db, 'courses'),
      where('isPublished', '==', true)
    );
    const unsubCourses = onSnapshot(
      coursesQuery,
      (snap) => {
        const list = sortByOrder(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<Course, 'id'>),
            id: d.id,
          }))
        );
        setCourses(list);
        setCoursesLoaded(true);
        saveFastBootCache({ courses: list });
      },
      (err) => {
        setCoursesLoaded(true);
        handleFirestoreError(err, OperationType.LIST, 'courses');
      }
    );

    const playlistsQuery = query(
      collection(db, 'playlists'),
      where('isPublished', '==', true)
    );
    const unsubPlaylists = onSnapshot(
      playlistsQuery,
      (snap) => {
        const list = sortByOrder(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<Playlist, 'id'>),
            id: d.id,
          }))
        );
        setPlaylists(list);
        setPlaylistsLoaded(true);
        saveFastBootCache({ playlists: list });
      },
      (err) => {
        setPlaylistsLoaded(true);
        handleFirestoreError(err, OperationType.LIST, 'playlists');
      }
    );

    const lessonFoldersQuery = query(
      collection(db, 'lessonFolders'),
      where('isPublished', '==', true)
    );
    const unsubLessonFolders = onSnapshot(
      lessonFoldersQuery,
      (snap) => {
        const list = sortByOrder(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<LessonFolder, 'id'>),
            id: d.id,
          }))
        );
        setLessonFolders(list);
        saveFastBootCache({ lessonFolders: list });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'lessonFolders');
      }
    );

    const progressRef = doc(db, 'userProgress', verifiedAuthUid);
    const unsubProgress = onSnapshot(
      progressRef,
      (snap) => {
        const nextProg: UserProgress = snap.exists()
          ? (snap.data() as UserProgress)
          : {
              userId: verifiedAuthUid,
              favoriteLessonIds: [],
              completedLessonIds: [],
              lastWatchedLessonId: '',
            };
        setUserProgress(nextProg);
        saveFastBootCache({ userProgress: nextProg });
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.GET,
          `userProgress/${verifiedAuthUid}`
        )
    );

    let unsubMyStudent = () => {};
    if (userEmail) {
      const cleanUserEmail = userEmail.trim().toLowerCase();
      const myStuId = emailToStudentDocId(cleanUserEmail);
      const stuDocRef = doc(db, 'students', myStuId);
      let autoCreatedSelf = false;
      unsubMyStudent = onSnapshot(
        stuDocRef,
        (snap) => {
          if (snap.exists()) {
            const nextStu = {
              ...(snap.data() as Omit<Student, 'id'>),
              id: snap.id,
            };
            setMyStudentRecord(nextStu);
            saveFastBootCache({ myStudentRecord: nextStu });
          } else {
            setMyStudentRecord(null);
            saveFastBootCache({ myStudentRecord: null });
            if (
              adminCheckDone &&
              !isAdmin &&
              !autoCreatedSelf &&
              auth.currentUser?.email
            ) {
              autoCreatedSelf = true;
              const defaultName = sanitizeString(
                auth.currentUser.displayName ||
                  cleanUserEmail.split('@')[0] ||
                  'Aluno',
                120,
                'Aluno'
              );
              setDoc(stuDocRef, {
                name: defaultName,
                email: sanitizeString(cleanUserEmail, 180),
                phone: '',
                cpf: '',
                turmaId: '',
                status: 'blocked',
                courseIds: [],
                accessAll: false,
                addedBy: verifiedAuthUid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }).catch(() => {
                // ignore if offline or already created
              });
            }
          }
        },
        () => {
          setMyStudentRecord(null);
        }
      );
    }

    const turmasQuery = query(
      collection(db, 'turmas'),
      where('isPublished', '==', true)
    );
    const unsubTurmas = onSnapshot(
      turmasQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Turma, 'id'>),
          id: d.id,
        }));
        setTurmas(list);
        saveFastBootCache({ turmas: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'turmas')
    );

    return () => {
      unsubConfig();
      unsubCourses();
      unsubPlaylists();
      unsubLessonFolders();
      unsubProgress();
      unsubMyStudent();
      unsubTurmas();
    };
  }, [authResolved, verifiedAuthUid, userEmail, isAdmin, adminCheckDone]);

  // Fase 1.8: Lazy Calendar Events subscription (only when Calendar is open, filtered by visible year)
  useEffect(() => {
    if (!user || !verifiedAuthUid || !isCalendarModalOpen) {
      return;
    }

    const startOfYear = `${calendarVisibleYear}-01-01`;
    const endOfYear = `${calendarVisibleYear}-12-31`;
    const calendarQuery = query(
      collection(db, 'calendarEvents'),
      where('startDate', '>=', startOfYear),
      where('startDate', '<=', endOfYear)
    );

    const unsubCalendar = onSnapshot(
      calendarQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<CalendarEvent, 'id'>),
          id: d.id,
        }));
        setCalendarEvents(list);
        saveFastBootCache({ calendarEvents: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'calendarEvents')
    );

    return () => unsubCalendar();
  }, [user, verifiedAuthUid, isCalendarModalOpen, calendarVisibleYear]);

  // Fase 1.8: Lazy Admin Students subscription (only when Gerenciar or Calendar is open)
  useEffect(() => {
    if (
      !user ||
      !verifiedAuthUid ||
      !isAdmin ||
      (activeNav !== 'admin' && !isCalendarModalOpen)
    ) {
      return;
    }

    const unsubStudentsList = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Student, 'id'>),
          id: d.id,
        }));
        setStudents(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'students')
    );

    return () => unsubStudentsList();
  }, [user, verifiedAuthUid, isAdmin, activeNav, isCalendarModalOpen]);

  // Dedicated Lessons Subscription based on student classification
  useEffect(() => {
    if (!user || !verifiedAuthUid) {
      if (authResolved) {
        setLessons([]);
        setLessonsLoaded(false);
      }
      return;
    }

    const lessonsQuery =
      isAdmin || !isBlockedUser
        ? query(collection(db, 'lessons'), where('isPublished', '==', true))
        : query(
            collection(db, 'lessons'),
            where('isPublished', '==', true),
            where('isFree', '==', true)
          );

    const unsubLessons = onSnapshot(
      lessonsQuery,
      (snap) => {
        const list = sortByOrder(
          snap.docs.map((d) => ({
            ...(d.data() as Omit<Lesson, 'id'>),
            id: d.id,
          }))
        );
        setLessons(list);
        setLessonsLoaded(true);
        saveFastBootCache({ lessons: list });
      },
      (err) => {
        setLessonsLoaded(true);
        setLessons([]);
        handleFirestoreError(err, OperationType.LIST, 'lessons');
      }
    );

    return () => unsubLessons();
  }, [authResolved, user, verifiedAuthUid, isAdmin, isBlockedUser]);

  // Fase 1.8: Lazy Simulados & Submissions subscription (only when Simulados, Home, or Admin is active)
  useEffect(() => {
    if (!user || !verifiedAuthUid) {
      if (authResolved) {
        setSimulados([]);
        setSimuladoSubmissions([]);
      }
      return;
    }

    if (!isAdmin && isBlockedUser) {
      setSimulados([]);
      setSimuladoSubmissions([]);
      return;
    }

    const shouldSubscribeSimulados =
      activeNav === 'simulados' ||
      activeNav === 'home' ||
      activeNav === 'admin';
    if (!shouldSubscribeSimulados) {
      return;
    }

    const simuladosQuery = query(
      collection(db, 'simulados'),
      where('isPublished', '==', true)
    );
    const unsubSimulados = onSnapshot(
      simuladosQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Simulado, 'id'>),
          id: d.id,
        }));
        setSimulados(list);
        saveFastBootCache({ simulados: list });
      },
      (err) => {
        setSimulados([]);
        handleFirestoreError(err, OperationType.LIST, 'simulados');
      }
    );

    const submissionsQuery = isAdmin
      ? collection(db, 'simuladoSubmissions')
      : query(
          collection(db, 'simuladoSubmissions'),
          where('userId', '==', verifiedAuthUid)
        );
    const unsubSubmissions = onSnapshot(
      submissionsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<SimuladoSubmission, 'id'>),
          id: d.id,
        }));
        setSimuladoSubmissions(list);
      },
      (err) => {
        setSimuladoSubmissions([]);
        handleFirestoreError(err, OperationType.LIST, 'simuladoSubmissions');
      }
    );

    return () => {
      unsubSimulados();
      unsubSubmissions();
    };
  }, [authResolved, user, verifiedAuthUid, isAdmin, isBlockedUser, activeNav]);

  // 3. Deferred / On-Demand Subscription for Dúvidas & Replies
  useEffect(() => {
    if (!verifiedAuthUid || !enableDoubtsSync) {
      return;
    }

    if (!isAdmin && isBlockedUser) {
      setDoubts([]);
      setDoubtReplies([]);
      return;
    }

    const unsubDoubts = onSnapshot(
      collection(db, 'doubts'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Doubt, 'id'>),
          id: d.id,
        }));
        setDoubts(list);
      },
      (err) => {
        setDoubts([]);
        handleFirestoreError(err, OperationType.LIST, 'doubts');
      }
    );

    const unsubDoubtReplies = onSnapshot(
      collection(db, 'doubtReplies'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<DoubtReply, 'id'>),
          id: d.id,
        }));
        setDoubtReplies(list);
      },
      (err) => {
        setDoubtReplies([]);
        handleFirestoreError(err, OperationType.LIST, 'doubtReplies');
      }
    );

    return () => {
      unsubDoubts();
      unsubDoubtReplies();
    };
  }, [verifiedAuthUid, enableDoubtsSync, isAdmin, isBlockedUser]);

  const activeSimuladoSubmissions = useMemo(() => {
    const validSimuladoIds = new Set(simulados.map((s) => s.id));
    return simuladoSubmissions.filter((sub) =>
      validSimuladoIds.has(sub.simuladoId)
    );
  }, [simulados, simuladoSubmissions]);

  // --- AUTH ACTIONS ---
  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    flushPendingWatchProgress();
    const currentUid = user?.uid || auth.currentUser?.uid || null;
    setSelectedCourseId(null);
    setSelectedPlaylistId(null);
    setSelectedLessonId(null);
    setActivePdf(null);
    setActiveNav('home');
    saveAuthHint(null);
    try {
      sessionStorage.removeItem(NAV_STATE_KEY);
    } catch {
      // ignore storage errors
    }
    clearUserLocalCache(currentUid);
    setUser(null);
    setVerifiedAuthUid(null);
    await signOut(auth);
  };

  // --- ADMIN CRUD OPERATIONS ---
  const toFirestoreTimestamp = (val: unknown) => {
    if (val instanceof Timestamp) return val;
    if (
      val &&
      typeof val === 'object' &&
      'seconds' in val &&
      typeof (val as { seconds: unknown }).seconds === 'number'
    ) {
      const s = (val as { seconds: number }).seconds;
      const ns =
        'nanoseconds' in val &&
        typeof (val as { nanoseconds: unknown }).nanoseconds === 'number'
          ? (val as { nanoseconds: number }).nanoseconds
          : 0;
      return new Timestamp(s, ns);
    }
    return serverTimestamp();
  };

  const normalizeLessonPdfsForSave = async (
    rawPdfs: PdfAttachment[] | undefined,
    fallbackPdfs: PdfAttachment[] | undefined,
    authorId: string,
    isFree: boolean
  ): Promise<PdfAttachment[]> => {
    const list = Array.isArray(rawPdfs) ? rawPdfs : [];
    const fallbackById = new Map(
      (Array.isArray(fallbackPdfs) ? fallbackPdfs : []).map((p) => [p.id, p])
    );
    const result: PdfAttachment[] = [];

    for (const item of list.slice(0, SCHEMA_LIMITS.MAX_PDFS)) {
      if (!item) continue;
      const rawUrl = (item.url || fallbackById.get(item.id)?.url || '').trim();
      if (!rawUrl) continue;
      const chunkedUrl = await ensurePdfUrlChunked(rawUrl, authorId, isFree);
      if (!chunkedUrl) continue;

      result.push({
        id: sanitizeString(
          item.id || generateSafeId('pdf'),
          SCHEMA_LIMITS.ID_MAX,
          generateSafeId('pdf')
        ),
        title: sanitizeString(
          item.title,
          SCHEMA_LIMITS.TITLE_MAX,
          'Material PDF'
        ),
        url: sanitizeString(chunkedUrl, SCHEMA_LIMITS.PDF_URL_MAX, ''),
        sizeLabel: sanitizeString(item.sizeLabel, 40, 'PDF'),
      });
    }

    return result;
  };

  const handleSaveLesson = async (
    lessonData: Omit<Lesson, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid) return;
    const { id, ...payload } = lessonData;
    const ref = doc(db, 'lessons', id);
    const existingLesson = lessons.find((l) => l.id === id);

    try {
      const isLessonFree = Boolean(payload.isFree);
      const cleanPdfs = await normalizeLessonPdfsForSave(
        payload.pdfs,
        existingLesson?.pdfs,
        activeUid,
        isLessonFree
      );

      const resolvedOrder =
        typeof payload.order === 'number'
          ? payload.order
          : typeof existingLesson?.order === 'number'
            ? existingLesson.order
            : undefined;

      await setDoc(ref, {
        title: sanitizeString(payload.title, SCHEMA_LIMITS.TITLE_MAX, 'Aula'),
        description: sanitizeString(
          payload.description || '',
          SCHEMA_LIMITS.LESSON_DESC_MAX,
          ''
        ),
        youtubeId: payload.youtubeId || '',
        duration: sanitizeString(payload.duration || '15:00', 20, '15:00'),
        thumbnailUrl: sanitizeString(
          payload.thumbnailUrl || 'preset:stadium',
          SCHEMA_LIMITS.URL_MAX,
          'preset:stadium'
        ),
        pdfs: cleanPdfs,
        folderId: sanitizeString(
          payload.folderId ?? existingLesson?.folderId ?? '',
          128,
          ''
        ),
        ...(typeof resolvedOrder === 'number' ? { order: resolvedOrder } : {}),
        isFree: isLessonFree,
        isPublished: true,
        authorId: activeUid,
        createdAt: isNew
          ? serverTimestamp()
          : toFirestoreTimestamp(existingLesson?.createdAt),
        updatedAt: serverTimestamp(),
      });

      if (
        existingLesson &&
        Boolean(existingLesson.isFree) !== isLessonFree &&
        cleanPdfs.length > 0
      ) {
        for (const pdf of cleanPdfs) {
          if (pdf.url && pdf.url.startsWith('chunked:')) {
            await updatePdfChunksIsFree(pdf.url, isLessonFree);
          }
        }
      }

      const existingFreePl = playlists.find((p) => p.id === FREE_PLAYLIST_ID);
      if (isLessonFree) {
        const nextFreeIds = existingFreePl
          ? Array.from(new Set([...existingFreePl.lessonIds, id]))
          : [id];

        await setDoc(doc(db, 'playlists', FREE_PLAYLIST_ID), {
          title: 'Aulas Grátis',
          description: existingFreePl?.description || '',
          coverUrl: existingFreePl?.coverUrl || 'preset:mastery',
          lessonIds: nextFreeIds,
          ...(typeof existingFreePl?.order === 'number'
            ? { order: existingFreePl.order }
            : {}),
          isPublished: true,
          authorId: activeUid,
          createdAt: existingFreePl
            ? toFirestoreTimestamp(existingFreePl.createdAt)
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (existingFreePl && existingFreePl.lessonIds.includes(id)) {
        const nextFreeIds = existingFreePl.lessonIds.filter(
          (item) => item !== id
        );
        await setDoc(doc(db, 'playlists', FREE_PLAYLIST_ID), {
          title: existingFreePl.title || 'Aulas Grátis',
          description: existingFreePl.description || '',
          coverUrl: existingFreePl.coverUrl || 'preset:mastery',
          lessonIds: nextFreeIds,
          ...(typeof existingFreePl.order === 'number'
            ? { order: existingFreePl.order }
            : {}),
          isPublished: true,
          authorId: activeUid,
          createdAt: toFirestoreTimestamp(existingFreePl.createdAt),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `lessons/${id}`
      );
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    try {
      await deleteDoc(doc(db, 'lessons', lessonId));
      if (selectedLessonId === lessonId) {
        setSelectedLessonId(null);
      }

      for (const pl of playlists) {
        if (pl.lessonIds.includes(lessonId)) {
          const cleanedIds = pl.lessonIds.filter((id) => id !== lessonId);
          await setDoc(doc(db, 'playlists', pl.id), {
            title: pl.title,
            description: pl.description || '',
            coverUrl: pl.coverUrl || 'preset:stadium',
            lessonIds: cleanedIds,
            ...(typeof pl.order === 'number' ? { order: pl.order } : {}),
            isPublished: true,
            authorId: activeUid || pl.authorId || '',
            createdAt: toFirestoreTimestamp(pl.createdAt),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `lessons/${lessonId}`);
    }
  };

  const handleSaveLessonFolder = async (
    folderData: Omit<LessonFolder, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid) return;
    const { id, ...payload } = folderData;
    const ref = doc(db, 'lessonFolders', id);
    const existingFolder = lessonFolders.find((f) => f.id === id);
    const resolvedOrder =
      typeof payload.order === 'number'
        ? payload.order
        : typeof existingFolder?.order === 'number'
          ? existingFolder.order
          : undefined;

    try {
      await setDoc(ref, {
        name: sanitizeString(payload.name, 120, 'Pasta'),
        ...(typeof resolvedOrder === 'number' ? { order: resolvedOrder } : {}),
        isPublished: true,
        authorId: activeUid,
        createdAt: isNew
          ? serverTimestamp()
          : toFirestoreTimestamp(existingFolder?.createdAt),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `lessonFolders/${id}`
      );
    }
  };

  const handleDeleteLessonFolder = async (folderId: string) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid) return;
    try {
      await deleteDoc(doc(db, 'lessonFolders', folderId));
      const folderLessons = lessons.filter((l) => l.folderId === folderId);
      for (const lesson of folderLessons) {
        await setDoc(doc(db, 'lessons', lesson.id), {
          title: lesson.title,
          description: lesson.description || '',
          youtubeId: lesson.youtubeId,
          duration: lesson.duration || '15:00',
          thumbnailUrl: lesson.thumbnailUrl || '',
          pdfs: lesson.pdfs || [],
          folderId: '',
          ...(typeof lesson.order === 'number' ? { order: lesson.order } : {}),
          isFree: Boolean(lesson.isFree),
          isPublished: true,
          authorId: activeUid,
          createdAt: toFirestoreTimestamp(lesson.createdAt),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `lessonFolders/${folderId}`
      );
    }
  };

  const handleMoveLessonsToFolder = async (
    lessonIds: string[],
    targetFolderId: string
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || lessonIds.length === 0) return;
    const cleanTargetFolderId = sanitizeString(targetFolderId, 128, '');
    try {
      for (const lid of lessonIds) {
        const lesson = lessons.find((l) => l.id === lid);
        if (!lesson) continue;
        await setDoc(doc(db, 'lessons', lesson.id), {
          title: lesson.title,
          description: lesson.description || '',
          youtubeId: lesson.youtubeId,
          duration: lesson.duration || '15:00',
          thumbnailUrl: lesson.thumbnailUrl || '',
          pdfs: lesson.pdfs || [],
          folderId: cleanTargetFolderId,
          ...(typeof lesson.order === 'number' ? { order: lesson.order } : {}),
          isFree: Boolean(lesson.isFree),
          isPublished: true,
          authorId: activeUid,
          createdAt: toFirestoreTimestamp(lesson.createdAt),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'lessons');
    }
  };

  const handleSavePlaylist = async (
    playlistData: Omit<Playlist, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid) return;
    const { id, ...payload } = playlistData;
    const ref = doc(db, 'playlists', id);
    const existingPl = playlists.find((p) => p.id === id);

    const validLessonIds = new Set(lessons.map((l) => l.id));
    const cleanLessonIds = payload.lessonIds.filter((lid) =>
      validLessonIds.has(lid)
    );
    const resolvedOrder =
      typeof payload.order === 'number'
        ? payload.order
        : typeof existingPl?.order === 'number'
          ? existingPl.order
          : undefined;

    try {
      await setDoc(ref, {
        title: payload.title,
        description: payload.description || '',
        coverUrl: payload.coverUrl || 'preset:stadium',
        lessonIds: cleanLessonIds,
        ...(typeof resolvedOrder === 'number' ? { order: resolvedOrder } : {}),
        isPublished: true,
        authorId: activeUid,
        createdAt: isNew
          ? serverTimestamp()
          : toFirestoreTimestamp(existingPl?.createdAt),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `playlists/${id}`
      );
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    try {
      await deleteDoc(doc(db, 'playlists', playlistId));
      if (selectedPlaylistId === playlistId) {
        setSelectedPlaylistId(null);
      }

      for (const c of courses) {
        if (c.playlistIds.includes(playlistId)) {
          const cleanedPlIds = c.playlistIds.filter((id) => id !== playlistId);
          await setDoc(doc(db, 'courses', c.id), {
            title: c.title,
            subtitle: c.subtitle || '',
            description: c.description || '',
            category: c.category || 'Destaques',
            coverUrl: c.coverUrl || 'preset:stadium',
            bannerUrl: c.bannerUrl || '',
            playlistIds: cleanedPlIds,
            ...(typeof c.order === 'number' ? { order: c.order } : {}),
            featured: Boolean(c.featured),
            isPublished: true,
            authorId: activeUid || c.authorId || '',
            createdAt: toFirestoreTimestamp(c.createdAt),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `playlists/${playlistId}`
      );
    }
  };

  const handleSaveCourse = async (
    courseData: Omit<Course, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid) return;
    const { id, ...payload } = courseData;
    const ref = doc(db, 'courses', id);
    const existingCourse = courses.find((c) => c.id === id);

    const validPlaylistIds = new Set(playlists.map((p) => p.id));
    const cleanPlaylistIds = payload.playlistIds.filter((pid) =>
      validPlaylistIds.has(pid)
    );
    const resolvedOrder =
      typeof payload.order === 'number'
        ? payload.order
        : typeof existingCourse?.order === 'number'
          ? existingCourse.order
          : undefined;

    try {
      await setDoc(ref, {
        title: payload.title,
        subtitle: payload.subtitle || '',
        description: payload.description || '',
        category: payload.category || 'Destaques',
        coverUrl: payload.coverUrl || 'preset:stadium',
        bannerUrl: payload.bannerUrl || '',
        playlistIds: cleanPlaylistIds,
        ...(typeof resolvedOrder === 'number' ? { order: resolvedOrder } : {}),
        featured: Boolean(payload.featured),
        isPublished: true,
        authorId: activeUid,
        createdAt: isNew
          ? serverTimestamp()
          : toFirestoreTimestamp(existingCourse?.createdAt),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `courses/${id}`
      );
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    try {
      await deleteDoc(doc(db, 'courses', courseId));
      if (selectedCourseId === courseId) {
        setSelectedCourseId(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `courses/${courseId}`);
    }
  };

  const handleReorderCourses = async (orderedCourseIds: string[]) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || !isAdmin || orderedCourseIds.length === 0) return;

    const orderMap = new Map<string, number>();
    orderedCourseIds.forEach((id, idx) => orderMap.set(id, idx));

    const nextCourses = sortByOrder(
      courses.map((c) =>
        orderMap.has(c.id) ? { ...c, order: orderMap.get(c.id)! } : c
      )
    );
    setCourses(nextCourses);
    saveFastBootCache({ courses: nextCourses });

    try {
      await Promise.all(
        orderedCourseIds.map(async (cid, idx) => {
          const c = courses.find((item) => item.id === cid);
          if (!c) return;
          await setDoc(doc(db, 'courses', c.id), {
            title: sanitizeString(c.title, SCHEMA_LIMITS.TITLE_MAX, 'Curso'),
            subtitle: sanitizeString(c.subtitle || '', SCHEMA_LIMITS.SUBTITLE_MAX, ''),
            description: sanitizeString(c.description || '', SCHEMA_LIMITS.DESCRIPTION_MAX, ''),
            category: sanitizeString(c.category || 'Destaques', SCHEMA_LIMITS.CATEGORY_MAX, 'Destaques'),
            coverUrl: sanitizeString(c.coverUrl || 'preset:stadium', SCHEMA_LIMITS.URL_MAX, 'preset:stadium'),
            bannerUrl: sanitizeString(c.bannerUrl || '', SCHEMA_LIMITS.URL_MAX, ''),
            playlistIds: c.playlistIds || [],
            order: idx,
            featured: Boolean(c.featured),
            isPublished: true,
            authorId: activeUid,
            createdAt: toFirestoreTimestamp(c.createdAt),
            updatedAt: serverTimestamp(),
          });
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'courses');
    }
  };

  const handleReorderPlaylists = async (orderedPlaylistIds: string[]) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || !isAdmin || orderedPlaylistIds.length === 0) return;

    const orderMap = new Map<string, number>();
    orderedPlaylistIds.forEach((id, idx) => orderMap.set(id, idx));

    const nextPlaylists = sortByOrder(
      playlists.map((p) =>
        orderMap.has(p.id) ? { ...p, order: orderMap.get(p.id)! } : p
      )
    );
    setPlaylists(nextPlaylists);
    saveFastBootCache({ playlists: nextPlaylists });

    try {
      await Promise.all(
        orderedPlaylistIds.map(async (pid, idx) => {
          const pl = playlists.find((item) => item.id === pid);
          if (!pl) return;
          await setDoc(doc(db, 'playlists', pl.id), {
            title: sanitizeString(pl.title, SCHEMA_LIMITS.TITLE_MAX, 'Playlist'),
            description: sanitizeString(pl.description || '', SCHEMA_LIMITS.DESCRIPTION_MAX, ''),
            coverUrl: sanitizeString(pl.coverUrl || 'preset:stadium', SCHEMA_LIMITS.URL_MAX, 'preset:stadium'),
            lessonIds: pl.lessonIds || [],
            order: idx,
            isPublished: true,
            authorId: activeUid,
            createdAt: toFirestoreTimestamp(pl.createdAt),
            updatedAt: serverTimestamp(),
          });
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'playlists');
    }
  };

  const handleReorderCoursePlaylists = async (
    courseId: string,
    orderedPlaylistIds: string[]
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || !isAdmin || !courseId) return;
    const targetCourse = courses.find((c) => c.id === courseId);
    if (!targetCourse) return;

    const nextCourses = courses.map((c) =>
      c.id === courseId ? { ...c, playlistIds: orderedPlaylistIds } : c
    );
    setCourses(nextCourses);
    saveFastBootCache({ courses: nextCourses });

    try {
      await setDoc(doc(db, 'courses', targetCourse.id), {
        title: sanitizeString(targetCourse.title, SCHEMA_LIMITS.TITLE_MAX, 'Curso'),
        subtitle: sanitizeString(targetCourse.subtitle || '', SCHEMA_LIMITS.SUBTITLE_MAX, ''),
        description: sanitizeString(targetCourse.description || '', SCHEMA_LIMITS.DESCRIPTION_MAX, ''),
        category: sanitizeString(targetCourse.category || 'Destaques', SCHEMA_LIMITS.CATEGORY_MAX, 'Destaques'),
        coverUrl: sanitizeString(targetCourse.coverUrl || 'preset:stadium', SCHEMA_LIMITS.URL_MAX, 'preset:stadium'),
        bannerUrl: sanitizeString(targetCourse.bannerUrl || '', SCHEMA_LIMITS.URL_MAX, ''),
        playlistIds: orderedPlaylistIds,
        ...(typeof targetCourse.order === 'number'
          ? { order: targetCourse.order }
          : {}),
        featured: Boolean(targetCourse.featured),
        isPublished: true,
        authorId: activeUid,
        createdAt: toFirestoreTimestamp(targetCourse.createdAt),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `courses/${courseId}`);
    }
  };

  const handleReorderLessonFolders = async (orderedFolderIds: string[]) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || !isAdmin || orderedFolderIds.length === 0) return;

    const orderMap = new Map<string, number>();
    orderedFolderIds.forEach((id, idx) => orderMap.set(id, idx));

    const nextFolders = sortByOrder(
      lessonFolders.map((f) =>
        orderMap.has(f.id) ? { ...f, order: orderMap.get(f.id)! } : f
      )
    );
    setLessonFolders(nextFolders);
    saveFastBootCache({ lessonFolders: nextFolders });

    try {
      await Promise.all(
        orderedFolderIds.map(async (fid, idx) => {
          const folder = lessonFolders.find((item) => item.id === fid);
          if (!folder) return;
          await setDoc(doc(db, 'lessonFolders', folder.id), {
            name: sanitizeString(folder.name, 120, 'Pasta'),
            order: idx,
            isPublished: true,
            authorId: activeUid,
            createdAt: toFirestoreTimestamp(folder.createdAt),
            updatedAt: serverTimestamp(),
          });
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'lessonFolders');
    }
  };

  const handleReorderLessons = async (orderedLessonIds: string[]) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || !isAdmin || orderedLessonIds.length === 0) return;

    const orderMap = new Map<string, number>();
    orderedLessonIds.forEach((id, idx) => orderMap.set(id, idx));

    const nextLessons = sortByOrder(
      lessons.map((l) =>
        orderMap.has(l.id) ? { ...l, order: orderMap.get(l.id)! } : l
      )
    );
    setLessons(nextLessons);
    saveFastBootCache({ lessons: nextLessons });

    try {
      await Promise.all(
        orderedLessonIds.map(async (lid, idx) => {
          const lesson = lessons.find((item) => item.id === lid);
          if (!lesson) return;
          await setDoc(doc(db, 'lessons', lesson.id), {
            title: sanitizeString(lesson.title, SCHEMA_LIMITS.TITLE_MAX, 'Aula'),
            description: sanitizeString(
              lesson.description || '',
              SCHEMA_LIMITS.LESSON_DESC_MAX,
              ''
            ),
            youtubeId: lesson.youtubeId || '',
            duration: sanitizeString(lesson.duration || '15:00', 20, '15:00'),
            thumbnailUrl: sanitizeString(
              lesson.thumbnailUrl || 'preset:stadium',
              SCHEMA_LIMITS.URL_MAX,
              'preset:stadium'
            ),
            pdfs: lesson.pdfs || [],
            folderId: sanitizeString(lesson.folderId || '', 128, ''),
            order: idx,
            isFree: Boolean(lesson.isFree),
            isPublished: true,
            authorId: activeUid,
            createdAt: toFirestoreTimestamp(lesson.createdAt),
            updatedAt: serverTimestamp(),
          });
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'lessons');
    }
  };

  const handleReorderPlaylistLessons = async (
    playlistId: string,
    orderedLessonIds: string[]
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || !isAdmin || !playlistId) return;
    const existingPl = playlists.find((p) => p.id === playlistId);

    const nextPlaylists = playlists.map((p) =>
      p.id === playlistId ? { ...p, lessonIds: orderedLessonIds } : p
    );
    setPlaylists(nextPlaylists);
    saveFastBootCache({ playlists: nextPlaylists });

    try {
      await setDoc(doc(db, 'playlists', playlistId), {
        title: sanitizeString(
          existingPl?.title ||
            (playlistId === FREE_PLAYLIST_ID ? 'Aulas Grátis' : 'Playlist'),
          SCHEMA_LIMITS.TITLE_MAX,
          'Playlist'
        ),
        description: sanitizeString(
          existingPl?.description || '',
          SCHEMA_LIMITS.DESCRIPTION_MAX,
          ''
        ),
        coverUrl: sanitizeString(
          existingPl?.coverUrl ||
            (playlistId === FREE_PLAYLIST_ID ? 'preset:mastery' : 'preset:stadium'),
          SCHEMA_LIMITS.URL_MAX,
          'preset:stadium'
        ),
        lessonIds: orderedLessonIds,
        ...(typeof existingPl?.order === 'number'
          ? { order: existingPl.order }
          : {}),
        isPublished: true,
        authorId: activeUid,
        createdAt: existingPl
          ? toFirestoreTimestamp(existingPl.createdAt)
          : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `playlists/${playlistId}`);
    }
  };

  const handleReorderLessonPdfs = async (
    lessonId: string,
    orderedPdfs: PdfAttachment[]
  ) => {
    const activeUid = auth.currentUser?.uid || user?.uid;
    if (!activeUid || !isAdmin || !lessonId) return;
    const targetLesson = lessons.find((l) => l.id === lessonId);
    if (!targetLesson) return;

    const nextLessons = lessons.map((l) =>
      l.id === lessonId ? { ...l, pdfs: orderedPdfs } : l
    );
    setLessons(nextLessons);
    saveFastBootCache({ lessons: nextLessons });

    try {
      await setDoc(doc(db, 'lessons', targetLesson.id), {
        title: sanitizeString(
          targetLesson.title,
          SCHEMA_LIMITS.TITLE_MAX,
          'Aula'
        ),
        description: sanitizeString(
          targetLesson.description || '',
          SCHEMA_LIMITS.LESSON_DESC_MAX,
          ''
        ),
        youtubeId: targetLesson.youtubeId || '',
        duration: sanitizeString(targetLesson.duration || '15:00', 20, '15:00'),
        thumbnailUrl: sanitizeString(
          targetLesson.thumbnailUrl || 'preset:stadium',
          SCHEMA_LIMITS.URL_MAX,
          'preset:stadium'
        ),
        pdfs: orderedPdfs,
        folderId: sanitizeString(targetLesson.folderId || '', 128, ''),
        ...(typeof targetLesson.order === 'number'
          ? { order: targetLesson.order }
          : {}),
        isFree: Boolean(targetLesson.isFree),
        isPublished: true,
        authorId: activeUid,
        createdAt: toFirestoreTimestamp(targetLesson.createdAt),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lessons/${lessonId}`);
    }
  };

  const handleSaveFreeModule = async (
    coverUrl: string,
    freeLessonIds: string[]
  ) => {
    if (!user) return;
    const validLessonIds = new Set(lessons.map((l) => l.id));
    const sanitizedIds = freeLessonIds
      .filter((id) => validLessonIds.has(id))
      .slice(0, 100);
    const existingPl = playlists.find((p) => p.id === FREE_PLAYLIST_ID);
    const existingCourse = courses.find((c) => c.id === FREE_COURSE_ID);

    try {
      await setDoc(doc(db, 'playlists', FREE_PLAYLIST_ID), {
        title: 'Aulas Grátis',
        description: '',
        coverUrl: coverUrl || 'preset:mastery',
        lessonIds: sanitizedIds,
        isPublished: true,
        authorId: existingPl?.authorId || user.uid,
        createdAt: existingPl?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'courses', FREE_COURSE_ID), {
        title: 'Aulas Grátis',
        subtitle: '',
        description: '',
        category: 'Gratuito',
        coverUrl: coverUrl || 'preset:mastery',
        bannerUrl: '',
        playlistIds: [FREE_PLAYLIST_ID],
        featured: false,
        isPublished: true,
        authorId: existingCourse?.authorId || user.uid,
        createdAt: existingCourse?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      for (const lesson of lessons) {
        const shouldBeFree = sanitizedIds.includes(lesson.id);
        if (lesson.isFree !== shouldBeFree) {
          await setDoc(doc(db, 'lessons', lesson.id), {
            title: lesson.title,
            description: lesson.description || '',
            youtubeId: lesson.youtubeId,
            duration: lesson.duration || '15:00',
            thumbnailUrl: lesson.thumbnailUrl || '',
            pdfs: lesson.pdfs || [],
            folderId: lesson.folderId || '',
            isFree: shouldBeFree,
            isPublished: true,
            authorId: lesson.authorId || user.uid,
            createdAt: lesson.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (lesson.pdfs && lesson.pdfs.length > 0) {
            for (const pdf of lesson.pdfs) {
              if (pdf.url && pdf.url.startsWith('chunked:')) {
                await updatePdfChunksIsFree(pdf.url, shouldBeFree);
              }
            }
          }
        }
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `courses/${FREE_COURSE_ID}`
      );
    }
  };

  const handleSaveSimulado = async (
    simuladoData: Omit<Simulado, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    if (!user) return;
    const { id, answerKey, ...payload } = simuladoData;
    const ref = doc(db, 'simulados', id);
    const existingSim = simulados.find((s) => s.id === id);

    try {
      await setDoc(ref, {
        title: payload.title,
        area: payload.area,
        questionCount: payload.questionCount,
        timeLimitMinutes: payload.timeLimitMinutes || 0,
        pdfUrl: payload.pdfUrl || '',
        pdfTitle: payload.pdfTitle || '',
        resultsReleased: Boolean(payload.resultsReleased),
        isPublished: true,
        authorId: existingSim?.authorId || payload.authorId || user.uid,
        createdAt: existingSim?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (answerKey) {
        const cleanKey = answerKey.replace(/[^ABCDE]/g, 'A');
        const keyRef = doc(db, 'simuladoKeys', id);
        const existingKeySnap = await getDoc(keyRef).catch(() => null);
        const existingKeyData = existingKeySnap?.exists()
          ? existingKeySnap.data()
          : null;

        await setDoc(keyRef, {
          answerKey: cleanKey,
          authorId: existingKeyData?.authorId || user.uid,
          createdAt: existingKeyData?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setSimuladoKeysMap((prev) => ({
          ...prev,
          [id]: cleanKey,
        }));
      }
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `simulados/${id}`
      );
    }
  };

  const handleDeleteSimulado = async (simuladoId: string) => {
    try {
      await deleteDoc(doc(db, 'simulados', simuladoId));
      await deleteDoc(doc(db, 'simuladoKeys', simuladoId)).catch(() => {});

      setSimuladoKeysMap((prev) => {
        const next = { ...prev };
        delete next[simuladoId];
        return next;
      });

      const subsToDelete = simuladoSubmissions.filter(
        (sub) => sub.simuladoId === simuladoId
      );
      for (const sub of subsToDelete) {
        await deleteDoc(doc(db, 'simuladoSubmissions', sub.id));
      }

      if (user) {
        try {
          localStorage.removeItem(
            `vertice_simulado_${simuladoId}_${user.uid}`
          );
        } catch {
          // ignore storage errors
        }
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `simulados/${simuladoId}`
      );
    }
  };

  const handleToggleReleaseSimulado = async (simulado: Simulado) => {
    if (!user) return;
    const ref = doc(db, 'simulados', simulado.id);
    try {
      await setDoc(ref, {
        title: simulado.title,
        area: simulado.area,
        questionCount: simulado.questionCount,
        timeLimitMinutes: simulado.timeLimitMinutes || 0,
        pdfUrl: simulado.pdfUrl || '',
        pdfTitle: simulado.pdfTitle || '',
        resultsReleased: !simulado.resultsReleased,
        isPublished: true,
        authorId: simulado.authorId || user.uid,
        createdAt: simulado.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `simulados/${simulado.id}`
      );
    }
  };

  const handleStartOrUpdateSubmission = async (
    simulado: Simulado,
    answersString: string,
    startedAtMs: number,
    finishNow: boolean
  ) => {
    if (!user) return;
    const subId = buildSubmissionDocId(simulado.id, user.uid);
    const ref = doc(db, 'simuladoSubmissions', subId);
    const existing = simuladoSubmissions.find((s) => s.id === subId);

    const nowMs = Date.now();
    const safeStart = existing?.startedAtMs || startedAtMs || nowMs;
    const elapsedSec = Math.max(
      1,
      Math.min(86400, Math.round((nowMs - safeStart) / 1000))
    );
    const cleanAnswers = answersString
      .replace(/[^ABCDE\-]/g, '-')
      .padEnd(simulado.questionCount, '-')
      .slice(0, simulado.questionCount);

    const resolvedUserName =
      myStudentRecord?.name ||
      userProgress?.displayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'Aluno';
    const userName = sanitizeString(resolvedUserName, 120, 'Aluno');
    const userEmailStr = sanitizeString(
      (user.email || 'aluno@gmail.com').toLowerCase(),
      180,
      'aluno@gmail.com'
    );

    try {
      await setDoc(ref, {
        simuladoId: simulado.id,
        userId: user.uid,
        userName,
        userEmail: userEmailStr,
        status: finishNow ? 'completed' : existing?.status || 'in_progress',
        answersString: cleanAnswers,
        startedAtMs: safeStart,
        finishedAtMs: finishNow ? nowMs : existing?.finishedAtMs || 0,
        durationSeconds: finishNow
          ? elapsedSec
          : existing?.durationSeconds || elapsedSec,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        existing ? OperationType.UPDATE : OperationType.CREATE,
        `simuladoSubmissions/${subId}`
      );
    }
  };

  const handleSaveStudent = async (
    studentData: Omit<Student, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    if (!user) return;
    const { id, ...payload } = studentData;
    const ref = doc(db, 'students', id);
    const existingStu = students.find((s) => s.id === id);

    try {
      await setDoc(ref, {
        name: payload.name,
        email: payload.email,
        phone: payload.phone ?? existingStu?.phone ?? '',
        cpf: payload.cpf ?? existingStu?.cpf ?? '',
        birthDate: payload.birthDate ?? existingStu?.birthDate ?? '',
        turmaId: payload.turmaId ?? existingStu?.turmaId ?? '',
        status: payload.status,
        accessAll: Boolean(payload.accessAll),
        courseIds: payload.courseIds || [],
        addedBy: existingStu?.addedBy || payload.addedBy || user.uid,
        createdAt: existingStu?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `students/${id}`
      );
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    try {
      await deleteDoc(doc(db, 'students', studentId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `students/${studentId}`);
    }
  };

  const handleSaveTurma = async (
    turmaData: Omit<Turma, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    if (!user) return;
    const { id, ...payload } = turmaData;
    const ref = doc(db, 'turmas', id);
    const existingTurma = turmas.find((t) => t.id === id);

    const validCourseIds = new Set(
      courses.filter((c) => c.id !== FREE_COURSE_ID).map((c) => c.id)
    );
    const cleanCourseIds = (payload.courseIds || [])
      .filter((cid) => validCourseIds.has(cid))
      .slice(0, 50);
    const isAll = Boolean(payload.accessAll);
    const effectiveCourseIds = isAll
      ? Array.from(validCourseIds).slice(0, 50)
      : cleanCourseIds;
    const nextStuStatus: 'active' | 'blocked' =
      isAll || effectiveCourseIds.length > 0 ? 'active' : 'blocked';

    try {
      await setDoc(ref, {
        name: sanitizeString(payload.name, 120, 'Turma'),
        description: sanitizeString(payload.description || '', 500, ''),
        courseIds: effectiveCourseIds,
        accessAll: isAll,
        isPublished: true,
        authorId: existingTurma?.authorId || payload.authorId || user.uid,
        createdAt: existingTurma?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const turmaStudents = students.filter((s) => s.turmaId === id);
      for (const stu of turmaStudents) {
        await setDoc(doc(db, 'students', stu.id), {
          name: stu.name,
          email: stu.email,
          phone: stu.phone || '',
          cpf: stu.cpf || '',
          birthDate: stu.birthDate || '',
          turmaId: id,
          status: nextStuStatus,
          accessAll: isAll,
          courseIds: effectiveCourseIds,
          addedBy: stu.addedBy || user.uid,
          createdAt: stu.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `turmas/${id}`
      );
    }
  };

  const handleDeleteTurma = async (turmaId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'turmas', turmaId));
      const turmaStudents = students.filter((s) => s.turmaId === turmaId);
      for (const stu of turmaStudents) {
        await setDoc(doc(db, 'students', stu.id), {
          name: stu.name,
          email: stu.email,
          phone: stu.phone || '',
          cpf: stu.cpf || '',
          birthDate: stu.birthDate || '',
          turmaId: '',
          status: 'blocked',
          accessAll: false,
          courseIds: [],
          addedBy: stu.addedBy || user.uid,
          createdAt: stu.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `turmas/${turmaId}`);
    }
  };

  const handleSaveCalendarEvent = async (
    eventData: Omit<CalendarEvent, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    if (!user) return;
    const { id, ...payload } = eventData;
    const ref = doc(db, 'calendarEvents', id);
    const existingEv = calendarEvents.find((ev) => ev.id === id);
    try {
      await setDoc(ref, {
        title: sanitizeString(payload.title, 160, 'Evento'),
        description: sanitizeString(payload.description || '', 2000, ''),
        category: payload.category || 'assunto_semana',
        startDate: payload.startDate,
        endDate: payload.endDate,
        color: payload.color || 'violet',
        icon: payload.icon || 'book',
        isPublished: true,
        authorId: existingEv?.authorId || payload.authorId || user.uid,
        createdAt: existingEv?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        isNew ? OperationType.CREATE : OperationType.UPDATE,
        `calendarEvents/${id}`
      );
    }
  };

  const handleDeleteCalendarEvent = async (eventId: string) => {
    try {
      await deleteDoc(doc(db, 'calendarEvents', eventId));
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `calendarEvents/${eventId}`
      );
    }
  };

  const handleCreateDoubt = async (text: string, imageUrl: string) => {
    if (!user) return;
    const id = generateSafeId('doubt');
    const resolvedAuthorName = sanitizeString(
      myStudentRecord?.name ||
        userProgress?.displayName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'Aluno',
      120,
      'Aluno'
    );
    const resolvedAvatar = sanitizeString(user.photoURL || '', 2000, '');
    try {
      await setDoc(doc(db, 'doubts', id), {
        authorId: user.uid,
        authorName: resolvedAuthorName,
        authorPhotoUrl: resolvedAvatar,
        text: sanitizeString(text, 2000, ''),
        imageUrl: imageUrl || '',
        likedBy: [],
        isResolved: false,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `doubts/${id}`);
    }
  };

  const handleToggleLikeDoubt = async (doubt: Doubt) => {
    if (!user) return;
    const currentLikes = Array.isArray(doubt.likedBy) ? doubt.likedBy : [];
    const hasLiked = currentLikes.includes(user.uid);
    const nextLikes = hasLiked
      ? currentLikes.filter((uid) => uid !== user.uid)
      : [...currentLikes, user.uid].slice(0, 500);
    try {
      await updateDoc(doc(db, 'doubts', doubt.id), {
        likedBy: nextLikes,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `doubts/${doubt.id}`);
    }
  };

  const handleToggleResolveDoubt = async (doubt: Doubt) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'doubts', doubt.id), {
        isResolved: !doubt.isResolved,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `doubts/${doubt.id}`);
    }
  };

  const handleDeleteDoubt = async (doubtId: string) => {
    try {
      await deleteDoc(doc(db, 'doubts', doubtId));
      const associatedReplies = doubtReplies.filter(
        (r) => r.doubtId === doubtId
      );
      for (const r of associatedReplies) {
        try {
          await deleteDoc(doc(db, 'doubtReplies', r.id));
        } catch {
          // ignore if reply owned by another user and current user is not admin
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `doubts/${doubtId}`);
    }
  };

  const handleCreateReply = async (
    doubtId: string,
    text: string,
    imageUrl: string
  ) => {
    if (!user) return;
    const id = generateSafeId('reply');
    const resolvedAuthorName = sanitizeString(
      myStudentRecord?.name ||
        userProgress?.displayName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'Aluno',
      120,
      'Aluno'
    );
    const resolvedAvatar = sanitizeString(user.photoURL || '', 2000, '');
    try {
      await setDoc(doc(db, 'doubtReplies', id), {
        doubtId,
        authorId: user.uid,
        authorName: resolvedAuthorName,
        authorPhotoUrl: resolvedAvatar,
        text: sanitizeString(text, 2000, ''),
        imageUrl: imageUrl || '',
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `doubtReplies/${id}`);
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      await deleteDoc(doc(db, 'doubtReplies', replyId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `doubtReplies/${replyId}`);
    }
  };

  // --- DELETION CONFIRMATION POPUP HANDLERS ---
  const requestDeleteLesson = async (lessonId: string) => {
    const item = lessons.find((l) => l.id === lessonId);
    setPendingDelete({
      type: 'lesson',
      id: lessonId,
      title: item?.title || 'esta aula',
      articleAndType: 'a aula',
    });
  };

  const requestDeleteLessonFolder = async (folderId: string) => {
    const item = lessonFolders.find((f) => f.id === folderId);
    setPendingDelete({
      type: 'lessonFolder',
      id: folderId,
      title: item?.name || 'esta pasta',
      articleAndType: 'a pasta',
    });
  };

  const requestDeletePlaylist = async (playlistId: string) => {
    const item = playlists.find((p) => p.id === playlistId);
    setPendingDelete({
      type: 'playlist',
      id: playlistId,
      title: item?.title || 'esta playlist',
      articleAndType: 'a playlist',
    });
  };

  const requestDeleteCourse = async (courseId: string) => {
    const item = courses.find((c) => c.id === courseId);
    setPendingDelete({
      type: 'course',
      id: courseId,
      title: item?.title || 'este curso',
      articleAndType: 'o curso',
    });
  };

  const requestDeleteStudent = async (studentId: string) => {
    const item = students.find((s) => s.id === studentId);
    setPendingDelete({
      type: 'student',
      id: studentId,
      title: item?.name || item?.email || 'este usuário',
      articleAndType: 'o usuário',
    });
  };

  const requestDeleteTurma = async (turmaId: string) => {
    const item = turmas.find((t) => t.id === turmaId);
    setPendingDelete({
      type: 'turma',
      id: turmaId,
      title: item?.name || 'esta turma',
      articleAndType: 'a turma',
    });
  };

  const requestDeleteSimulado = async (simuladoId: string) => {
    const item = simulados.find((s) => s.id === simuladoId);
    setPendingDelete({
      type: 'simulado',
      id: simuladoId,
      title: item?.title || 'este simulado',
      articleAndType: 'o simulado',
    });
  };

  const requestDeleteDoubt = async (doubtId: string) => {
    const item = doubts.find((d) => d.id === doubtId);
    const preview = item?.text
      ? item.text.slice(0, 40) + (item.text.length > 40 ? '...' : '')
      : 'esta dúvida';
    setPendingDelete({
      type: 'doubt',
      id: doubtId,
      title: preview,
      articleAndType: 'a dúvida',
    });
  };

  const requestDeleteDoubtReply = async (replyId: string) => {
    setPendingDelete({
      type: 'doubtReply',
      id: replyId,
      title: 'esta resposta',
      articleAndType: 'a resposta',
    });
  };

  const requestDeleteCalendarEvent = async (eventId: string) => {
    const item = calendarEvents.find((ev) => ev.id === eventId);
    setPendingDelete({
      type: 'calendarEvent',
      id: eventId,
      title: item?.title || 'este evento',
      articleAndType: 'o evento',
    });
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete || isDeletingItem) return;
    setIsDeletingItem(true);
    try {
      if (pendingDelete.type === 'lesson') {
        await handleDeleteLesson(pendingDelete.id);
      } else if (pendingDelete.type === 'lessonFolder') {
        await handleDeleteLessonFolder(pendingDelete.id);
      } else if (pendingDelete.type === 'playlist') {
        await handleDeletePlaylist(pendingDelete.id);
      } else if (pendingDelete.type === 'course') {
        await handleDeleteCourse(pendingDelete.id);
      } else if (pendingDelete.type === 'student') {
        await handleDeleteStudent(pendingDelete.id);
      } else if (pendingDelete.type === 'turma') {
        await handleDeleteTurma(pendingDelete.id);
      } else if (pendingDelete.type === 'simulado') {
        await handleDeleteSimulado(pendingDelete.id);
      } else if (pendingDelete.type === 'doubt') {
        await handleDeleteDoubt(pendingDelete.id);
      } else if (pendingDelete.type === 'doubtReply') {
        await handleDeleteReply(pendingDelete.id);
      } else if (pendingDelete.type === 'calendarEvent') {
        await handleDeleteCalendarEvent(pendingDelete.id);
      }
      setPendingDelete(null);
    } finally {
      setIsDeletingItem(false);
    }
  };

  const handleSaveConfig = async (
    configData: Omit<PlatformConfig, 'updatedAt'>
  ) => {
    const ref = doc(db, 'platformConfig', 'main');
    try {
      saveCachedPlatformConfig(configData as PlatformConfig);
      setPlatformConfig(configData as PlatformConfig);
      await setDoc(ref, {
        ...configData,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'platformConfig/main');
    }
  };

  // --- USER PROGRESS & PROFILE ---
  const saveProgressState = async (
    nextFavorites: string[],
    nextCompleted: string[],
    lastLessonId: string
  ) => {
    if (!user) return;
    const ref = doc(db, 'userProgress', user.uid);
    const payload: Record<string, unknown> = {
      userId: user.uid,
      favoriteLessonIds: nextFavorites.slice(0, 100),
      completedLessonIds: nextCompleted.slice(0, 200),
      lastWatchedLessonId: lastLessonId.slice(0, 128),
      updatedAt: serverTimestamp(),
    };
    if (userProgress?.displayName !== undefined) {
      payload.displayName = userProgress.displayName;
    }
    if (userProgress?.phone !== undefined) {
      payload.phone = userProgress.phone;
    }
    if (userProgress?.cpf !== undefined) {
      payload.cpf = userProgress.cpf;
    }
    if (userProgress?.birthDate !== undefined) {
      payload.birthDate = userProgress.birthDate;
    }
    try {
      await setDoc(ref, payload);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `userProgress/${user.uid}`
      );
    }
  };

  const openProfileModal = () => {
    const currentName =
      myStudentRecord?.name ||
      userProgress?.displayName ||
      user?.displayName ||
      user?.email?.split('@')[0] ||
      '';
    const currentPhone = myStudentRecord?.phone || userProgress?.phone || '';
    const currentBirthDate = formatBirthDateDisplay(
      myStudentRecord?.birthDate || userProgress?.birthDate || ''
    );
    setProfileNameInput(currentName);
    setProfileNameError(null);
    setProfilePhoneInput(currentPhone);
    setProfileBirthDateInput(currentBirthDate);
    setIsProfileDropdownOpen(false);
    setIsProfileModalOpen(true);
  };

  const formatPhoneValue = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSaveUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!profileNameInput.trim()) {
      setProfileNameError('Informe o seu nome completo.');
      profileNameRef.current?.focus();
      return;
    }
    setProfileNameError(null);
    setIsSavingProfile(true);
    const cleanName = sanitizeString(profileNameInput, 120, 'Aluno');
    const cleanPhone = sanitizeString(profilePhoneInput, 40, '');
    const cleanBirthDate = sanitizeString(profileBirthDateInput, 30, '');

    try {
      const progressRef = doc(db, 'userProgress', user.uid);
      const nextProgressPayload: Record<string, unknown> = {
        userId: user.uid,
        displayName: cleanName,
        phone: cleanPhone,
        birthDate: cleanBirthDate,
        favoriteLessonIds: (userProgress?.favoriteLessonIds || []).slice(0, 100),
        completedLessonIds: (userProgress?.completedLessonIds || []).slice(
          0,
          200
        ),
        lastWatchedLessonId: (userProgress?.lastWatchedLessonId || '').slice(
          0,
          128
        ),
        updatedAt: serverTimestamp(),
      };
      if (userProgress?.cpf !== undefined) {
        nextProgressPayload.cpf = userProgress.cpf;
      }
      await setDoc(progressRef, nextProgressPayload);

      if (myStudentRecord) {
        const stuRef = doc(db, 'students', myStudentRecord.id);
        await updateDoc(stuRef, {
          name: cleanName,
          phone: cleanPhone,
          birthDate: cleanBirthDate,
          updatedAt: serverTimestamp(),
        });
      }

      const mySubs = simuladoSubmissions.filter((s) => s.userId === user.uid);
      for (const sub of mySubs) {
        if (sub.userName !== cleanName) {
          await updateDoc(doc(db, 'simuladoSubmissions', sub.id), {
            userName: cleanName,
            updatedAt: serverTimestamp(),
          });
        }
      }

      setIsProfileModalOpen(false);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `userProgress/${user.uid}`
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const toggleCompletedLesson = (lessonId: string) => {
    if (!userProgress) return;
    const exists = userProgress.completedLessonIds.includes(lessonId);
    const nextComp = exists
      ? userProgress.completedLessonIds.filter((id) => id !== lessonId)
      : [...userProgress.completedLessonIds, lessonId];
    saveProgressState(userProgress.favoriteLessonIds, nextComp, lessonId);
  };

  const freePlaylist = useMemo(
    () => playlists.find((p) => p.id === FREE_PLAYLIST_ID) || null,
    [playlists]
  );

  const freeCourse = useMemo(() => {
    const found = courses.find((c) => c.id === FREE_COURSE_ID);
    if (found) return found;
    return {
      id: FREE_COURSE_ID,
      title: 'Teste Grátis',
      subtitle: '',
      description: '',
      category: 'Gratuito',
      coverUrl: freePlaylist?.coverUrl || 'preset:mastery',
      bannerUrl: '',
      playlistIds: [FREE_PLAYLIST_ID],
      featured: false,
      isPublished: true,
      authorId: '',
    } satisfies Course;
  }, [courses, freePlaylist]);

  const freePlaylistCard = useMemo((): Playlist => {
    if (freePlaylist) return freePlaylist;
    return {
      id: FREE_PLAYLIST_ID,
      title: 'Aulas Grátis',
      description: '',
      coverUrl: freeCourse.coverUrl || 'preset:mastery',
      lessonIds: lessons.filter((l) => l.isFree).map((l) => l.id),
      isPublished: true,
      authorId: '',
    };
  }, [freePlaylist, freeCourse, lessons]);

  const homeCourses = useMemo(() => {
    return courses.filter(
      (c) => c.id !== FREE_COURSE_ID && canAccessCourse(c.id)
    );
  }, [courses, isAdmin, myStudentRecord, myStudentTurma]);

  const buildUpdatedPlaylistTokens = (
    existingFavs: string[],
    playlistId: string | null,
    lessonId: string
  ): string[] => {
    if (!playlistId || !lessonId) return existingFavs;
    const prefix = `pl__${playlistId}__`;
    const newToken = `${prefix}${lessonId}`.slice(0, 128);
    const filtered = (existingFavs || []).filter(
      (item) => !item.startsWith(prefix)
    );
    return [newToken, ...filtered].slice(0, 100);
  };

  const parsedFirestorePlaylistHistory = useMemo(() => {
    const favs = userProgress?.favoriteLessonIds || [];
    const result: Array<{ playlistId: string; lessonId: string }> = [];
    for (const token of favs) {
      if (token.startsWith('pl__')) {
        const parts = token.split('__');
        if (parts.length >= 3 && parts[1] && parts[2]) {
          result.push({ playlistId: parts[1], lessonId: parts[2] });
        }
      }
    }
    return result;
  }, [userProgress?.favoriteLessonIds]);

  const resolveLastWatchedLessonInPlaylist = (
    pl: Playlist,
    fallbackLesson: Lesson | null = null
  ): Lesson | null => {
    const validLessons = (pl.lessonIds || [])
      .map((id) => lessons.find((l) => l.id === id))
      .filter((l): l is Lesson => Boolean(l));

    if (validLessons.length === 0) return fallbackLesson;

    const directPlWatch = playlistWatchMap[pl.id];
    if (directPlWatch?.lessonId) {
      const found = validLessons.find((l) => l.id === directPlWatch.lessonId);
      if (found) return found;
    }

    const firestoreToken = parsedFirestorePlaylistHistory.find(
      (t) => t.playlistId === pl.id
    );
    if (firestoreToken?.lessonId) {
      const found = validLessons.find((l) => l.id === firestoreToken.lessonId);
      if (found) return found;
    }

    let bestLesson: Lesson | null = null;
    let bestUpdatedAt = 0;

    for (const lesson of validLessons) {
      const meta = lessonWatchMap[lesson.id];
      if (meta?.playlistId === pl.id) {
        const ts = meta.updatedAt || 0;
        if (ts > bestUpdatedAt) {
          bestUpdatedAt = ts;
          bestLesson = lesson;
        }
      }
    }
    if (bestLesson) return bestLesson;

    for (const lesson of validLessons) {
      const meta = lessonWatchMap[lesson.id];
      const ts = meta?.updatedAt || 0;
      if (ts > bestUpdatedAt) {
        bestUpdatedAt = ts;
        bestLesson = lesson;
      }
    }
    if (bestLesson) return bestLesson;

    if (userProgress?.lastWatchedLessonId) {
      const matched = validLessons.find(
        (l) => l.id === userProgress.lastWatchedLessonId
      );
      if (matched) return matched;
    }

    return validLessons[0] || fallbackLesson;
  };

  const recordWatchActivity = (
    lessonId: string,
    playlistId: string | null,
    courseId: string | null
  ) => {
    if (!user?.uid || !lessonId) return;
    const now = Date.now();

    setLessonWatchMap((prev) => {
      const existing = prev[lessonId];
      const pending = pendingLessonProgressRef.current[lessonId];
      const next = {
        ...prev,
        [lessonId]: {
          currentTimeSec:
            pending?.currentTimeSec ?? existing?.currentTimeSec ?? 0,
          durationSec: pending?.durationSec ?? existing?.durationSec ?? 0,
          courseId: courseId || existing?.courseId || null,
          playlistId: playlistId || existing?.playlistId || null,
          updatedAt: now,
        },
      };
      try {
        localStorage.setItem(
          `vertice_watch_progress_${user.uid}`,
          JSON.stringify(next)
        );
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });

    if (playlistId) {
      setPlaylistWatchMap((prev) => {
        const next = {
          ...prev,
          [playlistId]: {
            lessonId,
            courseId: courseId || prev[playlistId]?.courseId || null,
            updatedAt: now,
          },
        };
        try {
          localStorage.setItem(
            `vertice_playlist_watch_${user.uid}`,
            JSON.stringify(next)
          );
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
    }

    const currentFavs = userProgress?.favoriteLessonIds || [];
    const nextFavs = buildUpdatedPlaylistTokens(
      currentFavs,
      playlistId,
      lessonId
    );
    const currentCompleted = userProgress?.completedLessonIds || [];

    if (
      !userProgress ||
      userProgress.lastWatchedLessonId !== lessonId ||
      nextFavs[0] !== currentFavs[0]
    ) {
      setUserProgress((prev) =>
        prev
          ? {
              ...prev,
              favoriteLessonIds: nextFavs,
              lastWatchedLessonId: lessonId,
            }
          : {
              userId: user.uid,
              favoriteLessonIds: nextFavs,
              completedLessonIds: currentCompleted,
              lastWatchedLessonId: lessonId,
            }
      );
      saveProgressState(nextFavs, currentCompleted, lessonId);
    }
  };

  const openFreeModule = () => {
    flushPendingWatchProgress();
    setActivePdf(null);
    setActiveNav('home');
    setSelectedCourseId(FREE_COURSE_ID);
    setSelectedPlaylistId(FREE_PLAYLIST_ID);

    const fallbackFree = lessons.find((l) => l.isFree) || null;
    const targetLesson = resolveLastWatchedLessonInPlaylist(
      freePlaylistCard,
      fallbackFree
    );

    if (targetLesson) {
      setSelectedLessonId(targetLesson.id);
      recordWatchActivity(targetLesson.id, FREE_PLAYLIST_ID, FREE_COURSE_ID);
    } else {
      setSelectedLessonId(null);
    }
  };

  const openCourse = (course: Course) => {
    if (!canAccessCourse(course.id)) return;
    if (course.id === FREE_COURSE_ID) {
      openFreeModule();
      return;
    }
    flushPendingWatchProgress();
    setActivePdf(null);
    setSelectedCourseId(course.id);
    setSelectedPlaylistId(null);
    setSelectedLessonId(null);
    setIsLessonsDropdownOpen(false);
  };

  const openPlaylistFromCourse = (pl: Playlist, courseId: string | null) => {
    if (pl.id === FREE_PLAYLIST_ID) {
      openFreeModule();
      return;
    }
    if (!canAccessPlaylist(pl)) return;
    flushPendingWatchProgress();
    setActivePdf(null);
    const parentCourse = courseId
      ? courses.find((c) => c.id === courseId) || null
      : courses.find(
          (c) => c.id !== FREE_COURSE_ID && c.playlistIds?.includes(pl.id)
        ) || null;
    const resolvedCourseId = courseId || (parentCourse ? parentCourse.id : null);
    setSelectedCourseId(resolvedCourseId);
    setSelectedPlaylistId(pl.id);
    const targetLesson = resolveLastWatchedLessonInPlaylist(pl, null);
    setSelectedLessonId(targetLesson ? targetLesson.id : null);
    setIsLessonsDropdownOpen(false);
    if (targetLesson) {
      recordWatchActivity(targetLesson.id, pl.id, resolvedCourseId);
    }
  };

  const openDirectLesson = (lesson: Lesson) => {
    if (isBlockedUser && !lesson.isFree) return;
    flushPendingWatchProgress();
    setActivePdf(null);
    const parentPl =
      playlists.find(
        (p) => p.id !== FREE_PLAYLIST_ID && p.lessonIds?.includes(lesson.id)
      ) || null;
    const parentCourse = parentPl
      ? courses.find(
          (c) => c.id !== FREE_COURSE_ID && c.playlistIds?.includes(parentPl.id)
        ) || null
      : null;
    const resolvedCourseId = parentCourse
      ? parentCourse.id
      : lesson.isFree
        ? FREE_COURSE_ID
        : null;
    const resolvedPlId = parentPl
      ? parentPl.id
      : lesson.isFree
        ? FREE_PLAYLIST_ID
        : null;
    setSelectedCourseId(resolvedCourseId);
    setSelectedPlaylistId(resolvedPlId);
    setSelectedLessonId(lesson.id);
    recordWatchActivity(lesson.id, resolvedPlId, resolvedCourseId);
  };

  const exitClassroom = useCallback(() => {
    flushPendingWatchProgress();
    setSelectedCourseId(null);
    setSelectedPlaylistId(null);
    setSelectedLessonId(null);
    setActivePdf(null);
    setIsLessonsDropdownOpen(false);
    setIsSimuladoEditorOpen(false);
    setEditingSimuladoDirect(null);
  }, [flushPendingWatchProgress]);

  const handleSelectLessonFromDropdown = useCallback(
    (lessonId: string) => {
      flushPendingWatchProgress();
      setSelectedLessonId(lessonId);
      setIsLessonsDropdownOpen(false);
    },
    [flushPendingWatchProgress]
  );

  const openCreateLessonPopup = (
    defaultIsFree = false,
    defaultFolderId = ''
  ) => {
    setEditingLesson(null);
    setLessonModalDefaultFree(Boolean(defaultIsFree));
    setLessonModalDefaultFolderId(defaultFolderId || '');
    setIsLessonPopupOpen(true);
  };

  const openEditLessonPopup = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setLessonModalDefaultFree(Boolean(lesson.isFree));
    setLessonModalDefaultFolderId(lesson.folderId || '');
    setIsLessonPopupOpen(true);
  };

  const activeCourse = useMemo(() => {
    if (selectedCourseId === FREE_COURSE_ID) return freeCourse;
    return courses.find((c) => c.id === selectedCourseId) || null;
  }, [courses, selectedCourseId, freeCourse]);

  const activePlaylist = useMemo(() => {
    if (selectedPlaylistId === FREE_PLAYLIST_ID) {
      return (
        freePlaylist || {
          id: FREE_PLAYLIST_ID,
          title: 'Aulas Grátis',
          description: '',
          coverUrl: 'preset:mastery',
          lessonIds: lessons.filter((l) => l.isFree).map((l) => l.id),
          isPublished: true,
          authorId: '',
        }
      );
    }
    if (selectedPlaylistId) {
      return playlists.find((p) => p.id === selectedPlaylistId) || null;
    }
    if (selectedLessonId) {
      return (
        playlists.find(
          (p) =>
            p.id !== FREE_PLAYLIST_ID &&
            p.lessonIds?.includes(selectedLessonId)
        ) || null
      );
    }
    return null;
  }, [playlists, selectedPlaylistId, selectedLessonId, freePlaylist, lessons]);

  const resolvedCourseForHeader = useMemo(() => {
    if (activeCourse) return activeCourse;
    const plId = selectedPlaylistId || activePlaylist?.id || null;
    if (plId) {
      return (
        courses.find(
          (c) => c.id !== FREE_COURSE_ID && c.playlistIds?.includes(plId)
        ) || null
      );
    }
    return null;
  }, [activeCourse, selectedPlaylistId, activePlaylist, courses]);

  const coursePlaylists = useMemo(() => {
    if (selectedCourseId === FREE_COURSE_ID) {
      if (freePlaylist) return [freePlaylist];
      return [
        {
          id: FREE_PLAYLIST_ID,
          title: 'Aulas Grátis',
          description: '',
          coverUrl: 'preset:mastery',
          lessonIds: lessons.filter((l) => l.isFree).map((l) => l.id),
          isPublished: true,
          authorId: '',
        },
      ];
    }
    if (activeCourse) {
      return activeCourse.playlistIds
        .map((id) => playlists.find((p) => p.id === id))
        .filter((p): p is Playlist => Boolean(p));
    }
    if (selectedPlaylistId) {
      const pl = playlists.find((p) => p.id === selectedPlaylistId);
      return pl ? [pl] : [];
    }
    return [];
  }, [
    selectedCourseId,
    activeCourse,
    selectedPlaylistId,
    playlists,
    freePlaylist,
    lessons,
  ]);

  const activeLesson = useMemo(
    () => lessons.find((l) => l.id === selectedLessonId) || null,
    [lessons, selectedLessonId]
  );

  const orderedClassroomLessons = useMemo(() => {
    if (activePlaylist) {
      return (activePlaylist.lessonIds || [])
        .map((id) => lessons.find((l) => l.id === id))
        .filter((l): l is Lesson => Boolean(l));
    }
    if (coursePlaylists.length > 0) {
      const ids: string[] = [];
      coursePlaylists.forEach((pl) => {
        pl.lessonIds.forEach((lid) => {
          if (!ids.includes(lid)) ids.push(lid);
        });
      });
      const resolved = ids
        .map((id) => lessons.find((l) => l.id === id))
        .filter((l): l is Lesson => Boolean(l));
      if (resolved.length > 0) return resolved;
    }
    return isBlockedUser ? lessons.filter((l) => l.isFree) : lessons;
  }, [activePlaylist, coursePlaylists, lessons, isBlockedUser]);

  const currentLessonIndex = useMemo(() => {
    if (!activeLesson) return -1;
    return orderedClassroomLessons.findIndex((l) => l.id === activeLesson.id);
  }, [activeLesson, orderedClassroomLessons]);

  const prevLesson = useMemo(() => {
    if (currentLessonIndex > 0) {
      return orderedClassroomLessons[currentLessonIndex - 1];
    }
    return null;
  }, [currentLessonIndex, orderedClassroomLessons]);

  const nextLesson = useMemo(() => {
    if (
      currentLessonIndex !== -1 &&
      currentLessonIndex + 1 < orderedClassroomLessons.length
    ) {
      return orderedClassroomLessons[currentLessonIndex + 1];
    }
    return null;
  }, [currentLessonIndex, orderedClassroomLessons]);

  const filteredTabLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (activeNav === 'free') {
        return l.isFree;
      }
      return isBlockedUser ? l.isFree : true;
    });
  }, [lessons, activeNav, isBlockedUser]);

  // Persist lastWatchedLessonId and watch metadata whenever the student enters or switches a lesson
  useEffect(() => {
    if (!user?.uid || !selectedLessonId) return;
    const resolvedPlId =
      selectedPlaylistId ||
      activePlaylist?.id ||
      lessonWatchMap[selectedLessonId]?.playlistId ||
      playlists.find(
        (p) =>
          p.id !== FREE_PLAYLIST_ID && p.lessonIds?.includes(selectedLessonId)
      )?.id ||
      null;
    const resolvedCourseId =
      selectedCourseId ||
      resolvedCourseForHeader?.id ||
      lessonWatchMap[selectedLessonId]?.courseId ||
      (resolvedPlId
        ? courses.find(
            (c) =>
              c.id !== FREE_COURSE_ID && c.playlistIds?.includes(resolvedPlId)
          )?.id || null
        : null);

    recordWatchActivity(selectedLessonId, resolvedPlId, resolvedCourseId);
  }, [selectedLessonId, selectedPlaylistId, user?.uid]);

  const autoCompletedLessonsRef = useRef<Set<string>>(new Set());

  // Fase 1.4: Store current playback position in a ref and only update React state + localStorage every 15 seconds, on pause, or on video end
  const handleLessonTimeUpdate = (
    lessonId: string,
    currentTimeSec: number,
    durationSec: number,
    forceFlush = false
  ) => {
    if (!user?.uid) return;

    const resolvedPlId =
      selectedPlaylistId ||
      activePlaylist?.id ||
      lessonWatchMap[lessonId]?.playlistId ||
      playlists.find(
        (p) => p.id !== FREE_PLAYLIST_ID && p.lessonIds?.includes(lessonId)
      )?.id ||
      null;
    const resolvedCourseId =
      selectedCourseId ||
      resolvedCourseForHeader?.id ||
      lessonWatchMap[lessonId]?.courseId ||
      (resolvedPlId
        ? courses.find(
            (c) =>
              c.id !== FREE_COURSE_ID && c.playlistIds?.includes(resolvedPlId)
          )?.id || null
        : null);

    // Auto-mark lesson as completed when student watches at least 50% of the player
    if (durationSec > 0) {
      if (currentTimeSec / durationSec >= 0.5) {
        if (!autoCompletedLessonsRef.current.has(lessonId)) {
          autoCompletedLessonsRef.current.add(lessonId);
          if (
            userProgress &&
            !userProgress.completedLessonIds.includes(lessonId)
          ) {
            const nextCompleted = [
              ...userProgress.completedLessonIds,
              lessonId,
            ];
            const nextFavs = buildUpdatedPlaylistTokens(
              userProgress.favoriteLessonIds || [],
              resolvedPlId,
              lessonId
            );
            setUserProgress((prev) =>
              prev
                ? {
                    ...prev,
                    favoriteLessonIds: nextFavs,
                    completedLessonIds: nextCompleted,
                    lastWatchedLessonId: lessonId,
                  }
                : prev
            );
            saveProgressState(nextFavs, nextCompleted, lessonId);
          }
        }
      } else if (currentTimeSec / durationSec < 0.45) {
        autoCompletedLessonsRef.current.delete(lessonId);
      }
    }

    const now = Date.now();
    pendingLessonProgressRef.current[lessonId] = {
      currentTimeSec,
      durationSec:
        durationSec ||
        pendingLessonProgressRef.current[lessonId]?.durationSec ||
        lessonWatchMap[lessonId]?.durationSec ||
        0,
      courseId: resolvedCourseId,
      playlistId: resolvedPlId,
      updatedAt: now,
    };

    const lastFlushed = lastFlushedWatchAtRef.current[lessonId] || 0;
    if (forceFlush || now - lastFlushed >= 15000) {
      flushPendingWatchProgress(lessonId);
    }
  };

  // Resolve the "Continue Watching" card for the top of the Home screen
  const continueWatchingData = useMemo(() => {
    const entries = Object.entries(lessonWatchMap) as [
      string,
      {
        currentTimeSec: number;
        durationSec: number;
        courseId?: string | null;
        playlistId?: string | null;
        updatedAt: number;
      },
    ][];
    const plEntries = Object.entries(playlistWatchMap) as [
      string,
      {
        lessonId: string;
        courseId?: string | null;
        updatedAt: number;
      },
    ][];

    let targetLessonId = '';
    let preferredPlaylistId: string | null = null;

    if (plEntries.length > 0) {
      const sortedPl = [...plEntries].sort(
        (a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)
      );
      preferredPlaylistId = sortedPl[0][0];
      targetLessonId = sortedPl[0][1].lessonId;
    }

    if (entries.length > 0) {
      const sorted = [...entries].sort(
        (a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0)
      );
      const topLessonEntry = sorted[0];
      const topPlTs = preferredPlaylistId
        ? playlistWatchMap[preferredPlaylistId]?.updatedAt || 0
        : 0;
      if ((topLessonEntry[1].updatedAt || 0) >= topPlTs) {
        targetLessonId = topLessonEntry[0];
        if (topLessonEntry[1].playlistId) {
          preferredPlaylistId = topLessonEntry[1].playlistId;
        }
      }
    }

    if (!targetLessonId && parsedFirestorePlaylistHistory.length > 0) {
      preferredPlaylistId = parsedFirestorePlaylistHistory[0].playlistId;
      targetLessonId = parsedFirestorePlaylistHistory[0].lessonId;
    }

    if (!targetLessonId && userProgress?.lastWatchedLessonId) {
      targetLessonId = userProgress.lastWatchedLessonId;
    }
    if (!targetLessonId) return null;

    const lesson = lessons.find((l) => l.id === targetLessonId);
    if (!lesson) return null;

    const meta = lessonWatchMap[targetLessonId];
    const resolvedPlId =
      preferredPlaylistId ||
      meta?.playlistId ||
      parsedFirestorePlaylistHistory[0]?.playlistId ||
      null;

    const parentPlaylist =
      (resolvedPlId && playlists.find((p) => p.id === resolvedPlId)) ||
      playlists.find(
        (p) =>
          p.id !== FREE_PLAYLIST_ID && p.lessonIds?.includes(targetLessonId)
      ) ||
      (lesson.isFree ? freePlaylistCard : null);

    const parentCourse =
      (meta?.courseId && courses.find((c) => c.id === meta.courseId)) ||
      (parentPlaylist &&
        courses.find(
          (c) =>
            c.id !== FREE_COURSE_ID &&
            c.playlistIds?.includes(parentPlaylist.id)
        )) ||
      (lesson.isFree ? freeCourse : null);

    const hasAccess =
      Boolean(lesson.isFree) ||
      (parentCourse ? canAccessCourse(parentCourse.id) : !isBlockedUser);
    if (!hasAccess) return null;

    const currentTimeSec = meta?.currentTimeSec || 0;
    const durationSec = meta?.durationSec || 0;
    const progressPercent =
      durationSec > 0
        ? Math.min(100, Math.max(4, Math.round((currentTimeSec / durationSec) * 100)))
        : currentTimeSec > 0
          ? 25
          : 0;

    const formatSec = (sec: number) => {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${r < 10 ? '0' : ''}${r}`;
    };

    return {
      lesson,
      parentCourse,
      parentPlaylist,
      currentTimeSec,
      durationSec,
      progressPercent,
      formattedTime: currentTimeSec > 0 ? formatSec(currentTimeSec) : null,
      formattedDuration:
        durationSec > 0 ? formatSec(durationSec) : lesson.duration || '',
    };
  }, [
    lessonWatchMap,
    playlistWatchMap,
    parsedFirestorePlaylistHistory,
    userProgress?.lastWatchedLessonId,
    lessons,
    playlists,
    courses,
    freePlaylistCard,
    freeCourse,
    isBlockedUser,
    myStudentRecord,
    myStudentTurma,
    isAdmin,
  ]);

  const initialDataReady =
    (courses.length > 0 && playlists.length > 0) ||
    (configLoaded && coursesLoaded && playlistsLoaded && lessonsLoaded);

  if (!authReady || (user && !initialDataReady)) {
    return (
      <div className="min-h-dvh bg-canvas flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  // --- GOOGLE-ONLY LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="min-h-dvh bg-canvas text-ink relative overflow-hidden flex flex-col items-center justify-center px-4">
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[540px] max-w-[140vw] h-[540px] bg-[radial-gradient(closest-side,rgba(37,99,235,0.25),transparent)]" />
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-canvas to-transparent pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm bg-surface border border-line rounded-3xl p-8 text-center shadow-pop">
          <div className="inline-flex items-center justify-center mb-5">
            <VerticeLogo className="w-14 h-14" />
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-ink uppercase">
            {platformConfig.brandName || 'CURSO VÉRTICE'}
          </h1>
          <p className="mt-1.5 text-xs text-ink-2 text-balance">
            {platformConfig.heroTitle || 'Sua plataforma para Enem e vestibulares'}
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="mt-8 w-full py-3.5 px-5 rounded-full bg-brand hover:bg-brand-hover active:scale-[0.99] text-white text-sm font-bold flex items-center justify-center gap-3 shadow-glow-md transition-all cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#ffffff"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 15.65 5 12c0-3.65 3.36-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
            <span>{isLoggingIn ? 'Conectando...' : 'Entrar com Google'}</span>
          </button>
        </div>
      </div>
    );
  }

  const showFullBleedBackdrop =
    activeNav === 'home' &&
    !activeLesson &&
    !activePdf &&
    !selectedCourseId &&
    !selectedPlaylistId;
  const displayBrandName =
    !platformConfig.brandName || platformConfig.brandName === 'SPORTLOCKER'
      ? 'CURSO VÉRTICE'
      : platformConfig.brandName;
  const displayHeroTitle =
    !platformConfig.heroTitle ||
    platformConfig.heroTitle === 'Arriscado é não arriscar!'
      ? 'Sua plataforma para Enem e vestibulares'
      : platformConfig.heroTitle;
  const displayHeroSubtitle =
    !platformConfig.heroSubtitle ||
    platformConfig.heroSubtitle === 'O melhor do esporte você encontra aqui!'
      ? 'Especialista em física, química e matemática'
      : platformConfig.heroSubtitle;

  return (
    <div className="min-h-dvh bg-canvas text-ink relative flex flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12 overflow-x-hidden">
      {/* FULL-BLEED MEMBERCLASS STAGE BACKGROUND (NO HARD LINES, SMOOTH FADE DOWNWARD) */}
      {showFullBleedBackdrop && (
        <div className="absolute inset-x-0 top-0 h-[560px] md:h-[660px] z-0 pointer-events-none overflow-hidden select-none">
          {platformConfig.heroBgUrl ? (
            <img
              src={platformConfig.heroBgUrl}
              alt={displayHeroTitle}
              fetchPriority="high"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setHeroImgLoaded(true)}
              className={`w-full h-full object-cover object-center scale-[1.02] transition-opacity duration-200 ${
                heroImgLoaded
                  ? theme === 'light'
                    ? 'opacity-30'
                    : 'opacity-70'
                  : 'opacity-0'
              }`}
            />
          ) : (
            <div
              className={`w-full h-full relative ${
                theme === 'light' ? 'bg-[#e0edff]' : 'bg-[#0a1329]'
              }`}
            >
              <div
                className={
                  theme === 'light'
                    ? 'absolute inset-0 bg-[radial-gradient(ellipse_85%_65%_at_50%_15%,rgba(37,99,235,0.22),rgba(59,130,246,0.10)_55%,transparent_100%)]'
                    : 'absolute inset-0 bg-[radial-gradient(ellipse_85%_65%_at_50%_15%,rgba(59,130,246,0.45),rgba(15,23,42,0.32)_55%,transparent_100%)]'
                }
              />
              <div
                className={`pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 w-[540px] max-w-[140vw] h-[240px] ${
                  theme === 'light'
                    ? 'bg-[radial-gradient(closest-side,rgba(59,130,246,0.20),transparent)]'
                    : 'bg-[radial-gradient(closest-side,rgba(59,130,246,0.25),transparent)]'
                }`}
              />
            </div>
          )}

          <div
            className={`absolute inset-0 bg-gradient-to-r ${
              theme === 'light'
                ? 'from-[#f0f5fc]/90 via-[#f0f5fc]/55 to-[#f0f5fc]/70'
                : 'from-[#070b14]/90 via-[#070b14]/45 to-[#070b14]/60'
            }`}
          />
          <div
            className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${
              theme === 'light'
                ? 'from-[#f0f5fc]/85 to-transparent'
                : 'from-[#070b14]/80 to-transparent'
            }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t ${
              theme === 'light'
                ? 'from-[#f0f5fc] via-[#f0f5fc]/85 to-transparent'
                : 'from-[#070b14] via-[#070b14]/85 to-transparent'
            }`}
          />
        </div>
      )}

      {/* TOP BAR CONTRACT */}
      <header
        className={`sticky top-0 z-30 px-5 md:px-12 pb-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between gap-6 transition-colors ${
          showFullBleedBackdrop
            ? theme === 'light'
              ? 'bg-gradient-to-b from-[#f0f5fc]/90 via-[#f0f5fc]/50 to-transparent'
              : 'bg-gradient-to-b from-[#070b14]/85 via-[#070b14]/40 to-transparent'
            : 'bg-canvas/95 backdrop-blur-md border-b border-line-soft'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            exitClassroom();
            setActiveNav('home');
          }}
          className="inline-flex items-center gap-2.5 text-base md:text-lg font-extrabold tracking-wider text-ink uppercase whitespace-nowrap shrink-0 cursor-pointer"
        >
          <VerticeLogo className="w-7 h-7 md:w-8 md:h-8" />
          <span>{displayBrandName}</span>
        </button>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              exitClassroom();
              setActiveNav('home');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'home' && !activeLesson && !activePdf && !isCalendarModalOpen
                ? 'text-ink font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Início
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                exitClassroom();
                setIsCalendarModalOpen(true);
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isCalendarModalOpen
                  ? 'text-ink font-bold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Calendário
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              exitClassroom();
              setActiveNav('simulados');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'simulados' && !activeLesson && !activePdf
                ? 'text-ink font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Simulados
          </button>

          <button
            type="button"
            onClick={() => {
              exitClassroom();
              setActiveNav('duvidas');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'duvidas' && !activeLesson && !activePdf
                ? 'text-ink font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Dúvidas
          </button>

          {hasActiveMentoria && (
            <button
              type="button"
              onClick={() => {
                exitClassroom();
                setActiveNav('mentoria');
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeNav === 'mentoria' && !activeLesson && !activePdf
                  ? 'text-ink font-bold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Mentoria
            </button>
          )}

          {isBlockedUser && (
            <button
              type="button"
              onClick={openFreeModule}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCourseId === FREE_COURSE_ID || activeNav === 'free'
                  ? 'text-ink font-bold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Aulas Grátis
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                exitClassroom();
                setActiveNav('admin');
              }}
              className={`hidden md:flex px-4 py-2 rounded-full text-xs font-bold items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeNav === 'admin' && !activeLesson && !activePdf
                  ? 'bg-contrast text-contrast-ink'
                  : 'bg-brand hover:bg-brand-hover text-white shadow-glow-sm'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Gerenciar
            </button>
          )}

          <div ref={profileDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
              title="Menu do perfil"
              className="flex items-center gap-1.5 p-1 pr-2.5 rounded-full bg-chip hover:bg-chip-hover border border-line text-ink-2 hover:text-ink text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Conta'}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold">
                  {(
                    myStudentRecord?.name ||
                    userProgress?.displayName ||
                    user.displayName ||
                    user.email ||
                    'U'
                  )[0].toUpperCase()}
                </div>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-200 ${
                  isProfileDropdownOpen ? 'rotate-180 text-ink' : ''
                }`}
              />
            </button>

            {isProfileDropdownOpen && (
              <div className="absolute right-0 top-full mt-2.5 w-52 rounded-2xl bg-surface border border-line shadow-pop p-1.5 z-50">
                <button
                  type="button"
                  onClick={openProfileModal}
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-ink-2 hover:text-ink hover:bg-chip-hover transition-all text-left cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-brand/15 border border-brand-soft/30 text-brand-accent group-hover:bg-brand group-hover:border-brand-soft group-hover:text-white flex items-center justify-center shrink-0 transition-all">
                    <UserIcon className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Perfil</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    applyThemeChange((prev) =>
                      prev === 'dark' ? 'light' : 'dark'
                    )
                  }
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-ink-2 hover:text-ink hover:bg-chip-hover transition-all text-left cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-brand/15 border border-brand-soft/30 text-brand-accent group-hover:bg-brand group-hover:border-brand-soft group-hover:text-white flex items-center justify-center shrink-0 transition-all">
                    {theme === 'light' ? (
                      <Moon className="w-3.5 h-3.5" strokeWidth={2} />
                    ) : (
                      <Sun className="w-3.5 h-3.5" strokeWidth={2} />
                    )}
                  </span>
                  <span>
                    {theme === 'light' ? 'Tema Escuro' : 'Tema Claro'}
                  </span>
                </button>

                <div className="my-1 border-t border-line" />

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    handleSignOut();
                  }}
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-ink-2 hover:text-ink hover:bg-chip-hover transition-all text-left cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-chip border border-line text-ink-2 group-hover:bg-rose-500/20 group-hover:border-rose-500/40 group-hover:text-rose-500 flex items-center justify-center shrink-0 transition-all">
                    <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Sair</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* DEDICATED PDF READER WINDOW */}
      {activePdf ? (
        <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-6 md:px-12 py-4 sm:py-6 flex flex-col">
          <React.Suspense fallback={<LazyComponentFallback />}>
            <PdfCanvasViewer
              pdfUrl={activePdf.url}
              title={activePdf.title}
              watermarkInfo={
                isAdmin
                  ? null
                  : {
                      name: currentStudentWatermarkName,
                      cpf: currentStudentWatermarkCpf,
                      email: currentStudentWatermarkEmail,
                    }
              }
              onBack={() => setActivePdf(null)}
            />
          </React.Suspense>
        </main>
      ) : activeCourse && !selectedPlaylistId && !activeLesson ? (
        /* COURSE PLAYLISTS CARD VIEW */
        <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-8 md:px-14 lg:px-20 py-6 space-y-5">
          <div className="flex items-center gap-3.5 pb-4 border-b border-line min-w-0">
            <button
              type="button"
              onClick={exitClassroom}
              className="h-9 px-3.5 rounded-xl bg-surface hover:bg-chip-hover border border-line text-xs font-semibold text-ink-2 hover:text-ink transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-brand-soft" />
              <span>Voltar</span>
            </button>

            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-ink truncate">
                {activeCourse.title}
              </h1>
            </div>
          </div>

          {coursePlaylists.length === 0 ? (
            <div className="p-10 rounded-2xl bg-surface border border-line shadow-card text-center space-y-2">
              <p className="text-sm font-bold text-ink">
                Nenhuma playlist cadastrada neste curso ainda
              </p>
              <p className="text-xs text-ink-muted">
                Assim que novas playlists forem adicionadas a este curso, elas aparecerão aqui em cards.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3.5 sm:gap-4 md:gap-5">
              {coursePlaylists.map((pl) => {
                const plLessonCount = (pl.lessonIds || []).filter((id) =>
                  lessons.some((l) => l.id === id)
                ).length;
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => openPlaylistFromCourse(pl, activeCourse.id)}
                    className="cover-poster-dark group relative w-full aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 hover:border-[#3b82f6]/80 hover:-translate-y-1 text-left transition-all duration-300 shadow-card cursor-pointer"
                  >
                    <CoverArtwork
                      src={pl.coverUrl}
                      title={pl.title}
                      className="w-full h-full"
                      showBottomPurpleBar
                    />

                    <div className="absolute top-2.5 right-2.5 z-10">
                      <span className="px-2 py-0.5 rounded-md bg-black/65 border border-white/15 text-[10px] font-mono font-bold text-white keep-white-text">
                        {plLessonCount} aula{plLessonCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4 z-10">
                      <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-white line-clamp-2 drop-shadow">
                        {pl.title}
                      </h3>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      ) : activePlaylist && !activeLesson ? (
        /* EMPTY PLAYLIST FALLBACK VIEW */
        <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 md:px-10 py-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-line">
            <div className="flex items-center gap-3.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (selectedCourseId && selectedCourseId !== FREE_COURSE_ID) {
                    setSelectedPlaylistId(null);
                    setSelectedLessonId(null);
                  } else {
                    exitClassroom();
                  }
                }}
                className="h-9 px-3.5 rounded-xl bg-surface hover:bg-chip-hover border border-line text-xs font-semibold text-ink-2 hover:text-ink transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-brand-soft" />
                <span>Voltar</span>
              </button>

              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {resolvedCourseForHeader && (
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-brand-accent">
                    {resolvedCourseForHeader.title}
                  </span>
                )}
                {resolvedCourseForHeader && activePlaylist && (
                  <ArrowRight className="w-4 h-4 text-brand-accent shrink-0" />
                )}
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-ink">
                  {activePlaylist.title}
                </h1>
              </div>
            </div>
          </div>

          <div className="p-10 rounded-2xl bg-surface border border-line shadow-card text-center space-y-2">
            <p className="text-sm font-bold text-ink">
              Nenhuma aula cadastrada nesta playlist ainda
            </p>
            <p className="text-xs text-ink-muted">
              Clique em Voltar para selecionar outra playlist do curso.
            </p>
          </div>
        </main>
      ) : activeLesson ? (
        /* CLASSROOM WINDOW */
        <SafeErrorBoundary>
          <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 md:px-10 py-5 min-w-0">
          {isLessonsDropdownOpen && (
            <div
              onClick={() => setIsLessonsDropdownOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 transition-opacity"
              aria-hidden="true"
            />
          )}

          {(resolvedCourseForHeader || activePlaylist) && (
            <div className="mb-3 px-0.5 flex items-center gap-2 min-w-0 overflow-hidden">
              {resolvedCourseForHeader && (
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-brand-accent truncate shrink-0 max-w-[48%]">
                  {resolvedCourseForHeader.title}
                </span>
              )}
              {resolvedCourseForHeader && activePlaylist && (
                <ArrowRight className="w-4 h-4 text-brand-accent shrink-0" />
              )}
              {activePlaylist && (
                <h2 className="text-sm sm:text-base font-extrabold text-ink truncate min-w-0">
                  {activePlaylist.title}
                </h2>
              )}
            </div>
          )}

          {/* TOP BAR ABOVE VIDEO: [Voltar] --- [< 1/2 >] --- [Dropdown Aulas] */}
          <div className="flex items-center justify-between gap-2 mb-3.5 relative z-50 w-full">
            <button
              type="button"
              onClick={() => {
                flushPendingWatchProgress();
                if (selectedCourseId && selectedCourseId !== FREE_COURSE_ID) {
                  setSelectedPlaylistId(null);
                  setSelectedLessonId(null);
                  setIsLessonsDropdownOpen(false);
                } else {
                  exitClassroom();
                }
              }}
              className="h-9 px-3 rounded-xl bg-surface hover:bg-chip-hover border border-line text-xs font-medium text-ink-2 hover:text-ink transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-brand-soft" />
              <span>Voltar</span>
            </button>

            <div className="h-9 inline-flex items-center gap-0.5 p-1 rounded-xl bg-surface border border-line shrink-0">
              <button
                type="button"
                disabled={!prevLesson}
                onClick={() => {
                  if (prevLesson) {
                    flushPendingWatchProgress();
                    setSelectedLessonId(prevLesson.id);
                    setIsLessonsDropdownOpen(false);
                  }
                }}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Aula anterior"
                aria-label="Aula anterior"
              >
                <ChevronLeft className="w-4 h-4 text-brand-soft" />
              </button>

              <span className="px-2 text-[11px] font-mono font-medium text-ink-2 tabular-nums select-none">
                {currentLessonIndex >= 0
                  ? `${currentLessonIndex + 1} / ${orderedClassroomLessons.length}`
                  : '1 / 1'}
              </span>

              <button
                type="button"
                disabled={!nextLesson}
                onClick={() => {
                  if (nextLesson) {
                    flushPendingWatchProgress();
                    setSelectedLessonId(nextLesson.id);
                    setIsLessonsDropdownOpen(false);
                  }
                }}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Próxima aula"
                aria-label="Próxima aula"
              >
                <ChevronRight className="w-4 h-4 text-brand-soft" />
              </button>
            </div>

            <div ref={lessonsDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsLessonsDropdownOpen((prev) => !prev)}
                className={`h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  isLessonsDropdownOpen
                    ? 'bg-brand border-brand-accent text-white shadow-glow-md'
                    : 'bg-surface hover:bg-chip-hover border-line text-ink-2 hover:text-ink'
                }`}
              >
                <ListVideo
                  className={`w-3.5 h-3.5 ${
                    isLessonsDropdownOpen ? 'text-white' : 'text-brand-soft'
                  }`}
                />
                <span>Aulas</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isLessonsDropdownOpen ? 'rotate-180 text-white' : 'text-ink-muted'
                  }`}
                />
              </button>

              {isLessonsDropdownOpen && (
                <div className="absolute right-0 top-full mt-2.5 w-[calc(100vw-2rem)] sm:w-84 max-w-[350px] max-h-[68dvh] overflow-y-auto rounded-2xl bg-surface border border-brand-soft/50 shadow-pop overflow-hidden z-50">
                  <div className="px-4 py-3 bg-surface-2 border-b border-line flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {resolvedCourseForHeader && (
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-accent truncate">
                          {resolvedCourseForHeader.title}
                        </span>
                      )}
                      <h2 className="text-xs font-bold text-ink truncate">
                        {activePlaylist
                          ? activePlaylist.title
                          : resolvedCourseForHeader
                            ? resolvedCourseForHeader.title
                            : 'Selecionar Aula'}
                      </h2>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-chip text-[10px] font-mono font-semibold text-brand-accent shrink-0">
                      {orderedClassroomLessons.length} aula
                      {orderedClassroomLessons.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="p-3.5 space-y-1.5">
                    {orderedClassroomLessons.map((lesson, idx) => (
                      <ClassroomLessonRow
                        key={lesson.id}
                        lesson={lesson}
                        idx={idx}
                        isCurrent={lesson.id === activeLesson.id}
                        isDone={Boolean(
                          userProgress?.completedLessonIds.includes(lesson.id)
                        )}
                        onSelect={handleSelectLessonFromDropdown}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full space-y-6">
            {hasLessonVideo(activeLesson.youtubeId) && (
              <div className="w-full aspect-video relative shrink-0">
                <StealthVideoPlayer
                  youtubeIdOrUrl={activeLesson.youtubeId}
                  title={activeLesson.title}
                  subtitle={activeCourse?.title}
                  thumbnailUrl={activeLesson.thumbnailUrl}
                  watermarkText={
                    isAdmin
                      ? ''
                      : `${currentStudentWatermarkName} • ${currentStudentWatermarkEmail}`
                  }
                  initialTimeSec={
                    pendingLessonProgressRef.current[activeLesson.id]
                      ?.currentTimeSec ??
                    lessonWatchMap[activeLesson.id]?.currentTimeSec ??
                    0
                  }
                  onTimeUpdate={(currentTimeSec, durationSec, forceFlush) =>
                    handleLessonTimeUpdate(
                      activeLesson.id,
                      currentTimeSec,
                      durationSec,
                      forceFlush
                    )
                  }
                  isCompleted={userProgress?.completedLessonIds.includes(
                    activeLesson.id
                  )}
                  onToggleComplete={() => toggleCompletedLesson(activeLesson.id)}
                  hasNextLesson={Boolean(nextLesson)}
                  onNextLesson={() => {
                    if (nextLesson) {
                      flushPendingWatchProgress();
                      setSelectedLessonId(nextLesson.id);
                    }
                  }}
                  theaterMode={theaterMode}
                  onToggleTheaterMode={() => setTheaterMode((prev) => !prev)}
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-line">
              <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">
                {activeLesson.title}
              </h1>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleCompletedLesson(activeLesson.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    userProgress?.completedLessonIds.includes(activeLesson.id)
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-500'
                      : 'bg-brand hover:bg-brand-hover text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {userProgress?.completedLessonIds.includes(activeLesson.id)
                    ? 'Concluída'
                    : 'Concluir Aula'}
                </button>
              </div>
            </div>

            {activeLesson.description && (
              <div className="space-y-1.5">
                <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-line max-w-[68ch]">
                  {activeLesson.description}
                </p>
              </div>
            )}

            {activeLesson.pdfs && activeLesson.pdfs.length > 0 && (
              <div className="space-y-3 pt-2">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-soft" />
                  PDFs da Aula
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeLesson.pdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-line hover:border-brand-soft/40 shadow-card transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 text-brand-accent flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-ink truncate">
                          {pdf.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActivePdf(pdf)}
                          className="px-3 py-1.5 rounded-lg bg-chip hover:bg-chip-hover text-xs font-semibold text-ink transition-colors cursor-pointer"
                        >
                          Ler
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerPdfDownload(pdf.url, pdf.title)}
                          className="p-2 rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors cursor-pointer"
                          title="Baixar PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
        </SafeErrorBoundary>
      ) : activeNav === 'admin' && isAdmin ? (
        /* ADMIN MANAGEMENT WINDOW */
        <main className="relative z-10 flex-1 w-full">
          <React.Suspense fallback={<LazyComponentFallback />}>
            <AdminStudioModal
              lessons={lessons}
              lessonFolders={lessonFolders}
              playlists={playlists}
              courses={courses}
              turmas={turmas}
              students={students}
              simulados={simulados}
              simuladoSubmissions={activeSimuladoSubmissions}
              platformConfig={{
                ...platformConfig,
                brandName: displayBrandName,
                heroTitle: displayHeroTitle,
                heroSubtitle: displayHeroSubtitle,
              }}
              onOpenNewLessonModal={openCreateLessonPopup}
              onOpenEditLessonModal={openEditLessonPopup}
              onDeleteLesson={requestDeleteLesson}
              onSaveLessonFolder={handleSaveLessonFolder}
              onDeleteLessonFolder={requestDeleteLessonFolder}
              onMoveLessonsToFolder={handleMoveLessonsToFolder}
              onReorderLessonFolders={handleReorderLessonFolders}
              onReorderLessons={handleReorderLessons}
              onReorderPlaylists={handleReorderPlaylists}
              onReorderCourses={handleReorderCourses}
              onSavePlaylist={handleSavePlaylist}
              onDeletePlaylist={requestDeletePlaylist}
              onSaveCourse={handleSaveCourse}
              onDeleteCourse={requestDeleteCourse}
              onSaveFreeModule={handleSaveFreeModule}
              onSaveSimulado={handleSaveSimulado}
              onDeleteSimulado={requestDeleteSimulado}
              onToggleReleaseSimulado={handleToggleReleaseSimulado}
              onSaveTurma={handleSaveTurma}
              onDeleteTurma={requestDeleteTurma}
              onSaveStudent={handleSaveStudent}
              onDeleteStudent={requestDeleteStudent}
              onSaveConfig={handleSaveConfig}
              onOpenCalendar={() => setIsCalendarModalOpen(true)}
              currentUserUid={user.uid}
            />
          </React.Suspense>
        </main>
      ) : (
        /* SHOWCASE HOME & FILTERED WINDOWS */
        <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-8 md:px-14 lg:px-20">
          {activeNav === 'home' && (
            <section className="pt-8 pb-8 md:pt-14 md:pb-12 flex flex-col sm:flex-row sm:items-start justify-between gap-5">
              <div className="max-w-2xl space-y-4">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-ink text-balance leading-[1.14]">
                  {displayHeroTitle}
                </h1>
                <p className="text-xs sm:text-sm md:text-base text-ink-2 max-w-lg font-medium leading-relaxed">
                  {displayHeroSubtitle}
                </p>

                {isBlockedUser && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={openFreeModule}
                      className="px-7 py-3 rounded-full bg-brand hover:bg-brand-hover active:scale-95 text-white text-sm font-bold shadow-glow-lg transition-all whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {platformConfig.heroCtaText || 'Confira agora!'}
                    </button>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => setIsCalendarModalOpen(true)}
                    title="Abrir Calendário do Curso (Assuntos da Semana, Eventos e Feriados)"
                    aria-label="Abrir Calendário Acadêmico"
                    className="group relative inline-flex items-center gap-3 p-1.5 pr-4 rounded-full bg-surface hover:bg-surface-2 border border-brand-soft/45 hover:border-brand-accent shadow-glow-sm hover:shadow-glow-md transition-all duration-300 active:scale-95 cursor-pointer"
                  >
                    <span className="relative w-11 h-11 rounded-full bg-gradient-to-tr from-[#2563eb] via-[#2563eb] to-[#93c5fd] text-white flex items-center justify-center shadow-glow-sm group-hover:scale-105 group-hover:rotate-6 transition-all duration-300 keep-white-text">
                      <CalendarIcon className="w-5 h-5" />
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-surface flex items-center justify-center">
                        <Sparkles className="w-2 h-2 text-black" />
                      </span>
                    </span>
                    <div className="text-left">
                      <span className="block text-xs font-extrabold text-ink group-hover:text-brand-accent transition-colors">
                        Calendário
                      </span>
                      <span className="block text-[10px] font-semibold text-brand-accent">
                        Semana & Eventos
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </section>
          )}

          <div className="py-2 space-y-10">
            {activeNav === 'home' && (
              <>
                {continueWatchingData && (
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-brand-accent flex items-center gap-2">
                        <Play className="w-3.5 h-3.5 text-brand-soft fill-current" />
                        <span>Continuar de onde parou</span>
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActivePdf(null);
                        if (continueWatchingData.parentCourse) {
                          setSelectedCourseId(
                            continueWatchingData.parentCourse.id
                          );
                        }
                        if (continueWatchingData.parentPlaylist) {
                          setSelectedPlaylistId(
                            continueWatchingData.parentPlaylist.id
                          );
                        }
                        setSelectedLessonId(continueWatchingData.lesson.id);
                        setIsLessonsDropdownOpen(false);
                      }}
                      className="w-full sm:max-w-xl p-3.5 sm:p-4 rounded-2xl bg-surface hover:bg-surface-2 border border-brand-soft/35 hover:border-brand-soft/80 transition-all flex items-center gap-3.5 sm:gap-4 text-left group shadow-card cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center shadow-glow-sm group-hover:scale-105 transition-transform shrink-0 keep-white-text">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-xs sm:text-sm font-bold text-ink truncate">
                          {continueWatchingData.lesson.title}
                        </p>

                        <div className="w-full h-1.5 rounded-full bg-chip overflow-hidden">
                          <div
                            className="h-full bg-brand-soft rounded-full transition-all"
                            style={{
                              width: `${Math.max(8, continueWatchingData.progressPercent)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="shrink-0 pr-1 text-brand-soft group-hover:translate-x-0.5 transition-transform">
                        <ChevronRight className="w-5 h-5" />
                      </div>
                    </button>
                  </section>
                )}

                {homeCourses.length > 0 && (
                  <section className="space-y-4">
                    <h2 className="text-base md:text-lg font-bold text-ink tracking-tight">
                      Cursos
                    </h2>

                    <div
                      ref={carouselRef}
                      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3.5 sm:gap-4 md:gap-5"
                    >
                      {homeCourses.map((course) => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => openCourse(course)}
                          className="cover-poster-dark group relative w-full aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 hover:border-[#3b82f6]/80 hover:-translate-y-1 text-left transition-all duration-300 shadow-card cursor-pointer"
                        >
                          <CoverArtwork
                            src={course.coverUrl}
                            title={course.title}
                            className="w-full h-full"
                            showBottomPurpleBar
                            locked={false}
                          />

                          <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-4 z-10">
                            <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide line-clamp-2 drop-shadow text-white">
                              {course.title}
                            </h3>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* SIMULADOS TAB */}
            {activeNav === 'simulados' && (
              <React.Suspense fallback={<LazyComponentFallback />}>
                {isSimuladoEditorOpen && isAdmin ? (
                  <div className="py-4">
                    <SimuladoEditorWindow
                      editingSimulado={editingSimuladoDirect}
                      currentUserUid={user.uid}
                      onCancel={() => {
                        setIsSimuladoEditorOpen(false);
                        setEditingSimuladoDirect(null);
                      }}
                      onSaveSimulado={async (data, isNew) => {
                        await handleSaveSimulado(data, isNew);
                        setIsSimuladoEditorOpen(false);
                        setEditingSimuladoDirect(null);
                      }}
                    />
                  </div>
                ) : (
                  <SimuladosWindow
                    simulados={resolvedSimulados}
                    submissions={activeSimuladoSubmissions}
                    currentUserUid={user.uid}
                    currentUserName={
                      myStudentRecord?.name ||
                      userProgress?.displayName ||
                      user.displayName ||
                      user.email?.split('@')[0] ||
                      'Aluno'
                    }
                    currentUserEmail={user.email || ''}
                    isAdmin={isAdmin}
                    isBlockedUser={isBlockedUser}
                    onStartOrUpdateSubmission={handleStartOrUpdateSubmission}
                    onToggleReleaseResults={handleToggleReleaseSimulado}
                    onDeleteSimulado={requestDeleteSimulado}
                    onOpenCreateSimulado={() => {
                      setEditingSimuladoDirect(null);
                      setIsSimuladoEditorOpen(true);
                    }}
                    onOpenEditSimulado={(sim) => {
                      setEditingSimuladoDirect(sim);
                      setIsSimuladoEditorOpen(true);
                    }}
                    onOpenPdfReader={(pdf) => setActivePdf(pdf)}
                  />
                )}
              </React.Suspense>
            )}

            {/* DÚVIDAS SOCIAL Q&A TAB */}
            {activeNav === 'duvidas' && (
              <React.Suspense fallback={<LazyComponentFallback />}>
                <DuvidasWindow
                  doubts={doubts}
                  replies={doubtReplies}
                  currentUserUid={user.uid}
                  currentUserName={
                    myStudentRecord?.name ||
                    userProgress?.displayName ||
                    user.displayName ||
                    user.email?.split('@')[0] ||
                    'Aluno'
                  }
                  currentUserPhotoUrl={user.photoURL || ''}
                  isAdmin={isAdmin}
                  isBlockedUser={isBlockedUser}
                  onCreateDoubt={handleCreateDoubt}
                  onToggleLikeDoubt={handleToggleLikeDoubt}
                  onToggleResolveDoubt={handleToggleResolveDoubt}
                  onDeleteDoubt={requestDeleteDoubt}
                  onCreateReply={handleCreateReply}
                  onDeleteReply={requestDeleteDoubtReply}
                />
              </React.Suspense>
            )}

            {/* MENTORIA STUDENT HUB TAB */}
            {activeNav === 'mentoria' && (
              <React.Suspense fallback={<LazyComponentFallback />}>
                <MentoriaWindow
                  userEmail={user.email || ''}
                  userName={
                    myStudentRecord?.name ||
                    userProgress?.displayName ||
                    user.displayName ||
                    user.email?.split('@')[0] ||
                    'Aluno'
                  }
                  isBlockedUser={!isAdmin && isBlockedUser}
                />
              </React.Suspense>
            )}

            {/* FREE LESSONS TAB */}
            {(activeNav === 'free' || activeNav === 'lessons') && (
              <section className="space-y-5 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        exitClassroom();
                        setActiveNav('home');
                      }}
                      className="h-9 px-3.5 rounded-xl bg-surface hover:bg-chip-hover border border-line text-xs font-semibold text-ink-2 hover:text-ink transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-brand-soft" />
                      <span>Voltar</span>
                    </button>
                    <h2 className="text-xl font-bold text-ink">
                      {activeNav === 'free' && 'Aulas Grátis'}
                      {activeNav === 'lessons' && 'Aulas'}
                    </h2>
                  </div>
                </div>

                {filteredTabLessons.length === 0 ? (
                  <div className="py-16 text-center rounded-2xl bg-surface border border-line-soft shadow-card">
                    <p className="text-sm text-ink-muted">
                      Nenhuma aula disponível.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {filteredTabLessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        onClick={() => openDirectLesson(lesson)}
                        className="cv-auto-row group rounded-2xl bg-surface border border-line hover:border-brand-soft/60 shadow-card overflow-hidden transition-all flex flex-col cursor-pointer"
                      >
                        <div className="relative aspect-video bg-black overflow-hidden">
                          <CoverArtwork
                            src={lesson.thumbnailUrl}
                            title={lesson.title}
                            className="w-full h-full"
                            showBottomPurpleBar={false}
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center shadow-lg">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>
                        </div>

                        <div className="p-3.5">
                          <h3 className="text-xs font-bold text-ink line-clamp-2 group-hover:text-brand-accent transition-colors">
                            {lesson.title}
                          </h3>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </main>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-[80] bg-canvas/95 backdrop-blur-xl border-t border-line px-1.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around ${
          isAdmin && isCalendarModalOpen ? 'hidden' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setIsCalendarModalOpen(false);
            exitClassroom();
            setActiveNav('home');
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
            activeNav === 'home' && !activeLesson && !activePdf && !isCalendarModalOpen
              ? 'text-brand-accent font-bold'
              : 'text-ink-muted'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Início</span>
        </button>

        {!isAdmin && (
          <button
            type="button"
            onClick={() => {
              exitClassroom();
              setIsCalendarModalOpen(true);
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              isCalendarModalOpen
                ? 'text-brand-accent font-bold'
                : 'text-ink-muted'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Calendário</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setIsCalendarModalOpen(false);
            exitClassroom();
            setActiveNav('simulados');
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
            activeNav === 'simulados' && !activeLesson && !activePdf && !isCalendarModalOpen
              ? 'text-brand-accent font-bold'
              : 'text-ink-muted'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Simulados</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setIsCalendarModalOpen(false);
            exitClassroom();
            setActiveNav('duvidas');
          }}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
            activeNav === 'duvidas' && !activeLesson && !activePdf && !isCalendarModalOpen
              ? 'text-brand-accent font-bold'
              : 'text-ink-muted'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>Dúvidas</span>
        </button>

        {hasActiveMentoria && (
          <button
            type="button"
            onClick={() => {
              setIsCalendarModalOpen(false);
              exitClassroom();
              setActiveNav('mentoria');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              activeNav === 'mentoria' && !activeLesson && !activePdf && !isCalendarModalOpen
                ? 'text-brand-accent font-bold'
                : 'text-ink-muted'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Mentoria</span>
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setIsCalendarModalOpen(false);
              exitClassroom();
              setActiveNav('admin');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl text-[10px] sm:text-[11px] font-medium transition-colors cursor-pointer ${
              activeNav === 'admin' && !activeLesson && !activePdf && !isCalendarModalOpen
                ? 'text-brand-accent font-bold'
                : 'text-ink-muted'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Gerenciar</span>
          </button>
        )}
      </nav>

      {/* USER PROFILE MODAL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
          <div className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:max-w-md rounded-none sm:rounded-3xl bg-surface border-0 sm:border border-line shadow-pop overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={profileNameInput || 'Perfil'}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-line shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center text-sm font-extrabold shrink-0">
                    {(profileNameInput || user.email || 'A')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold tracking-tight text-ink truncate">
                    Meu Perfil
                  </h2>
                  <p className="text-xs text-ink-2 font-medium truncate">
                    Dados da sua conta
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="w-10 h-10 rounded-xl text-ink-muted hover:text-ink hover:bg-chip-hover flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Fechar perfil"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={handleSaveUserProfile}
              className="flex-1 overflow-y-auto p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1.5">
                  Aparência da Plataforma
                </label>
                <div
                  role="group"
                  aria-label="Selecionar tema da plataforma"
                  className="relative grid grid-cols-2 p-1 rounded-2xl bg-inset border border-line select-none"
                >
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl bg-brand shadow-glow-sm transition-transform duration-200 ease-out ${
                      theme === 'light' ? 'translate-x-full' : 'translate-x-0'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() => applyThemeChange('dark')}
                    className={`relative z-10 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      theme === 'dark'
                        ? 'text-white keep-white-text'
                        : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Tema Escuro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyThemeChange('light')}
                    className={`relative z-10 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      theme === 'light'
                        ? 'text-white keep-white-text'
                        : 'text-ink-2 hover:text-ink'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Tema Claro</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1.5">
                  Nome
                </label>
                <input
                  ref={profileNameRef}
                  type="text"
                  maxLength={120}
                  value={profileNameInput}
                  onChange={(e) => {
                    setProfileNameInput(e.target.value);
                    if (profileNameError) setProfileNameError(null);
                  }}
                  placeholder="Seu nome completo"
                  className={`w-full px-4 py-2.5 rounded-xl bg-inset border text-sm font-medium text-ink focus:outline-none ${
                    profileNameError
                      ? 'border-danger focus:border-danger'
                      : 'border-line focus:border-brand-soft'
                  }`}
                />
                {profileNameError && (
                  <p className="text-xs font-medium text-danger mt-1">
                    {profileNameError}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1.5">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    maxLength={25}
                    value={profilePhoneInput}
                    onChange={(e) =>
                      setProfilePhoneInput(formatPhoneValue(e.target.value))
                    }
                    placeholder="(00) 00000-0000"
                    className="w-full px-4 py-2.5 rounded-xl bg-inset border border-line text-sm font-medium text-ink tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1.5">
                    Data de Nascimento
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={profileBirthDateInput}
                    onChange={(e) =>
                      setProfileBirthDateInput(
                        formatBirthDateInput(e.target.value)
                      )
                    }
                    placeholder="DD/MM/AAAA"
                    className="w-full px-4 py-2.5 rounded-xl bg-inset border border-line text-sm font-medium text-ink tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-ink-muted">
                    CPF
                  </label>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-faint">
                    <Lock className="w-3 h-3" />
                    Não alterável
                  </span>
                </div>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={
                    myStudentRecord?.cpf ||
                    userProgress?.cpf ||
                    'Não cadastrado'
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-inset/60 border border-line-soft text-sm font-medium text-ink-muted tabular-nums cursor-not-allowed select-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-ink-muted">
                    E-mail
                  </label>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-faint">
                    <Lock className="w-3 h-3" />
                    Não alterável
                  </span>
                </div>
                <input
                  type="email"
                  readOnly
                  disabled
                  value={user.email || ''}
                  className="w-full px-4 py-2.5 rounded-xl bg-inset/60 border border-line-soft text-sm font-medium text-ink-muted cursor-not-allowed select-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-4 py-2.5 rounded-full bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-6 py-2.5 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-glow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingProfile ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CALENDAR MODAL WINDOW */}
      {isCalendarModalOpen && (
        <React.Suspense fallback={null}>
          <CalendarModal
            isOpen={isCalendarModalOpen}
            onClose={() => setIsCalendarModalOpen(false)}
            events={calendarEvents}
            isAdmin={isAdmin}
            currentUserUid={user.uid}
            students={students}
            userProgress={userProgress}
            onSaveEvent={handleSaveCalendarEvent}
            onDeleteEvent={requestDeleteCalendarEvent}
            onVisibleYearChange={setCalendarVisibleYear}
          />
        </React.Suspense>
      )}

      {/* MINIMALIST POPUP FOR CREATING / EDITING A LESSON */}
      {isAdmin && isLessonPopupOpen && (
        <React.Suspense fallback={null}>
          <LessonPopupModal
            isOpen={isLessonPopupOpen}
            editingLesson={editingLesson}
            defaultIsFree={lessonModalDefaultFree}
            defaultFolderId={lessonModalDefaultFolderId}
            folders={lessonFolders}
            currentUserUid={user.uid}
            onClose={() => {
              setIsLessonPopupOpen(false);
              setEditingLesson(null);
            }}
            onSaveLesson={handleSaveLesson}
          />
        </React.Suspense>
      )}

      {/* LOCKED COURSE WHATSAPP POPUP MODAL */}
      {lockedCoursePopup && (
        <div
          onClick={() => setLockedCoursePopup(null)}
          className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-surface border border-line p-6 shadow-pop space-y-5 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto">
              <MessageCircle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-extrabold tracking-tight text-ink">
                {lockedCoursePopup.title}
              </h3>
              <p className="text-xs sm:text-sm text-ink-2 font-medium leading-relaxed">
                Mande um WhatsApp para adquirir o curso.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <a
                href={`https://wa.me/5591980461223?text=${encodeURIComponent(
                  `Olá! Gostaria de adquirir o curso ${lockedCoursePopup.title}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setLockedCoursePopup(null)}
                className="w-full py-2.5 px-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white keep-white-text shadow-[0_6px_24px_rgba(16,185,129,0.4)] transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Mandar WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => setLockedCoursePopup(null)}
                className="w-full py-2.5 px-5 rounded-full bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION POPUP MODAL FOR DELETING */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-surface border border-line p-6 shadow-pop space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-extrabold tracking-tight text-ink">
                Tem certeza da exclusão?
              </h3>
              <p className="text-xs sm:text-sm text-ink-2 font-medium leading-relaxed">
                Deseja realmente excluir {pendingDelete.articleAndType}{' '}
                <span className="font-bold text-ink">
                  &ldquo;{pendingDelete.title}&rdquo;
                </span>
                ? Essa ação não pode ser desfeita.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={() => setPendingDelete(null)}
                className="flex-1 py-2.5 px-4 rounded-full bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={confirmPendingDelete}
                className="flex-1 py-2.5 px-4 rounded-full bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-[0_6px_24px_rgba(225,29,72,0.4)] transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingItem ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
