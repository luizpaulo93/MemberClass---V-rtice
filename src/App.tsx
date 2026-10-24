/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
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
  FREE_COURSE_ID,
  FREE_PLAYLIST_ID,
} from './types';
import { CoverArtwork } from './components/CoverArtwork';
import { StealthVideoPlayer } from './components/StealthVideoPlayer';
import { VerticeLogo } from './components/VerticeLogo';
import { evaluateSimuladoCohort } from './utils/triEngine';
import {
  resolvePdfUrlToViewable,
  triggerPdfDownload,
  setStudentPdfWatermarkInfo,
} from './utils/pdfStorage';

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

const LazyComponentFallback = () => (
  <div className="w-full py-16 flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-[#2563eb] border-t-transparent animate-spin" />
  </div>
);

type NavSection =
  | 'home'
  | 'simulados'
  | 'lessons'
  | 'duvidas'
  | 'free'
  | 'admin';

const CONFIG_CACHE_KEY = 'vertice_platform_config_v1';
const BOOT_CACHE_KEY = 'vertice_fast_boot_v2';
const AUTH_HINT_KEY = 'vertice_auth_hint_v2';
const THEME_STORAGE_KEY = 'vertice_theme_v1';

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
          c.coverUrl && c.coverUrl.length > 20000
            ? 'preset:stadium'
            : c.coverUrl,
        bannerUrl:
          c.bannerUrl && c.bannerUrl.length > 20000 ? '' : c.bannerUrl,
      }));
    }
    if (patch.playlists && merged.playlists) {
      merged.playlists = merged.playlists.map((p) => ({
        ...p,
        coverUrl:
          p.coverUrl && p.coverUrl.length > 20000
            ? 'preset:mastery'
            : p.coverUrl,
      }));
    }
    if (patch.lessons && merged.lessons) {
      merged.lessons = merged.lessons.map((l) => ({
        ...l,
        thumbnailUrl:
          l.thumbnailUrl && l.thumbnailUrl.length > 20000
            ? ''
            : l.thumbnailUrl,
        pdfs: (l.pdfs || []).map((pdf) => ({
          ...pdf,
          url: pdf.url && pdf.url.length > 20000 ? '' : pdf.url,
        })),
      }));
    }
    if (patch.simulados && merged.simulados) {
      merged.simulados = merged.simulados.map((s) => ({
        ...s,
        pdfUrl: s.pdfUrl && s.pdfUrl.length > 20000 ? '' : s.pdfUrl,
      }));
    }
    memoryBootCache = merged;
    localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage quota errors
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
  // Tracks when the real Firebase Auth SDK has verified the token for Firestore queries
  const [verifiedAuthUid, setVerifiedAuthUid] = useState<string | null>(
    () => auth.currentUser?.uid || null
  );
  const [authReady, setAuthReady] = useState<boolean>(
    () => Boolean(auth.currentUser || initialAuthHint)
  );
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Firestore Collections State (hydrated synchronously from local boot cache for 0ms startup)
  const [lessons, setLessons] = useState<Lesson[]>(
    () => initialBootCache?.lessons || []
  );
  const [lessonFolders, setLessonFolders] = useState<LessonFolder[]>(
    () => initialBootCache?.lessonFolders || []
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(
    () => initialBootCache?.playlists || []
  );
  const [courses, setCourses] = useState<Course[]>(
    () => initialBootCache?.courses || []
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

  // Initial Firestore Snapshot Readiness Flags (true immediately if local boot cache exists)
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

  // Controls deferred background subscription to heavy photo collections (Dúvidas)
  const [enableDoubtsSync, setEnableDoubtsSync] = useState(false);

  // Navigation & Window State
  const [activeNav, setActiveNav] = useState<NavSection>('home');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null
  );
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [theaterMode, setTheaterMode] = useState(false);
  const [activePdf, setActivePdf] = useState<PdfAttachment | null>(null);

  // Simulado Editor Window State (when opened directly from Simulados tab)
  const [isSimuladoEditorOpen, setIsSimuladoEditorOpen] = useState(false);
  const [editingSimuladoDirect, setEditingSimuladoDirect] =
    useState<Simulado | null>(null);


  // Popup shown when a student clicks a locked course cover
  const [lockedCoursePopup, setLockedCoursePopup] = useState<Course | null>(
    null
  );

  // Minimalist Lesson Popup Modal State (shared with Gerenciar)
  const [isLessonPopupOpen, setIsLessonPopupOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [lessonModalDefaultFree, setLessonModalDefaultFree] = useState(false);
  const [lessonModalDefaultFolderId, setLessonModalDefaultFolderId] =
    useState<string>('');
  const [isLessonsDropdownOpen, setIsLessonsDropdownOpen] = useState(false);
  const [resolvedActivePdfUrl, setResolvedActivePdfUrl] = useState<string>('');
  const [isLoadingActivePdf, setIsLoadingActivePdf] = useState<boolean>(false);

  // Top-right Profile Dropdown & Profile Modal State
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profilePhoneInput, setProfilePhoneInput] = useState('');
  const [profileBirthDateInput, setProfileBirthDateInput] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Calendar Modal Window State
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);

  // User Theme State ('dark' | 'light') with persistent storage
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'light'
        ? 'light'
        : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('theme-light');
    } else {
      root.classList.remove('theme-light');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  // Deletion Confirmation Popup State (for User/Student, Turma, Lesson, Playlist, Course, Simulado, Doubt, CalendarEvent)
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

  useEffect(() => {
    if (!user?.uid) {
      setLessonWatchMap({});
      setPlaylistWatchMap({});
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

  // Keep PDF edge watermark synced with the current student's Full Name, CPF, and Email
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
    let cancelled = false;
    if (!activePdf) {
      setResolvedActivePdfUrl('');
      setIsLoadingActivePdf(false);
      return;
    }
    setIsLoadingActivePdf(true);
    resolvePdfUrlToViewable(activePdf.url, {
      name: currentStudentWatermarkName,
      cpf: currentStudentWatermarkCpf,
      email: currentStudentWatermarkEmail,
    })
      .then((url) => {
        if (!cancelled) {
          setResolvedActivePdfUrl(url);
          setIsLoadingActivePdf(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar PDF:', err);
        if (!cancelled) {
          setResolvedActivePdfUrl('');
          setIsLoadingActivePdf(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activePdf,
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

  const userUid = user?.uid || null;
  const userEmail = user?.email || null;
  const userEmailVerified = Boolean(user?.emailVerified);

  const isAdmin = useMemo(() => {
    return Boolean(
      userEmail &&
        userEmailVerified &&
        userEmail.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase()
    );
  }, [userEmail, userEmailVerified]);

  // 1. Auth Listener (confirms Firebase Auth session & updates fast-boot hint)
  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 350);
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      window.clearTimeout(fallbackTimer);
      setUser(currentUser);
      setVerifiedAuthUid(currentUser?.uid || null);
      saveAuthHint(currentUser);
      setAuthReady(true);
    });
    return () => {
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  // Ensure initial loading spinner never hangs on new devices/tablets if network or snapshots are slow
  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      setConfigLoaded(true);
      setCoursesLoaded(true);
      setPlaylistsLoaded(true);
      setLessonsLoaded(true);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [user]);

  // Activate Dúvidas subscription when user opens Dúvidas tab
  useEffect(() => {
    if (!verifiedAuthUid) {
      setEnableDoubtsSync(false);
      return;
    }
    if (activeNav === 'duvidas') {
      setEnableDoubtsSync(true);
    }
  }, [verifiedAuthUid, activeNav]);

  // 2. Real-time Firestore Subscriptions (Core Home & Simulados collections)
  useEffect(() => {
    if (!verifiedAuthUid) {
      if (authReady) {
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
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Course, 'id'>),
          id: d.id,
        }));
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
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Playlist, 'id'>),
          id: d.id,
        }));
        setPlaylists(list);
        setPlaylistsLoaded(true);
        saveFastBootCache({ playlists: list });
      },
      (err) => {
        setPlaylistsLoaded(true);
        handleFirestoreError(err, OperationType.LIST, 'playlists');
      }
    );

    const lessonsQuery = query(
      collection(db, 'lessons'),
      where('isPublished', '==', true)
    );
    const unsubLessons = onSnapshot(
      lessonsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Lesson, 'id'>),
          id: d.id,
        }));
        setLessons(list);
        setLessonsLoaded(true);
        saveFastBootCache({ lessons: list });
      },
      (err) => {
        setLessonsLoaded(true);
        handleFirestoreError(err, OperationType.LIST, 'lessons');
      }
    );

    const lessonFoldersQuery = query(
      collection(db, 'lessonFolders'),
      where('isPublished', '==', true)
    );
    const unsubLessonFolders = onSnapshot(
      lessonFoldersQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<LessonFolder, 'id'>),
          id: d.id,
        }));
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
            if (!isAdmin && !autoCreatedSelf && auth.currentUser?.email) {
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
      (err) => handleFirestoreError(err, OperationType.LIST, 'simulados')
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
      (err) =>
        handleFirestoreError(err, OperationType.LIST, 'simuladoSubmissions')
    );

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

    const calendarQuery = collection(db, 'calendarEvents');
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

    let unsubStudentsList = () => {};
    if (isAdmin) {
      const stuQuery = collection(db, 'students');
      unsubStudentsList = onSnapshot(
        stuQuery,
        (snap) => {
          const list = snap.docs.map((d) => ({
            ...(d.data() as Omit<Student, 'id'>),
            id: d.id,
          }));
          setStudents(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'students')
      );
    }

    return () => {
      unsubConfig();
      unsubCourses();
      unsubPlaylists();
      unsubLessons();
      unsubLessonFolders();
      unsubProgress();
      unsubMyStudent();
      unsubSimulados();
      unsubSubmissions();
      unsubTurmas();
      unsubCalendar();
      unsubStudentsList();
    };
  }, [authReady, verifiedAuthUid, userEmail, isAdmin]);

  // 3. Deferred / On-Demand Subscription for Dúvidas & Replies (heavy photo collections)
  useEffect(() => {
    if (!verifiedAuthUid || !enableDoubtsSync) return;

    const unsubDoubts = onSnapshot(
      collection(db, 'doubts'),
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<Doubt, 'id'>),
          id: d.id,
        }));
        setDoubts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'doubts')
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
      (err) => handleFirestoreError(err, OperationType.LIST, 'doubtReplies')
    );

    return () => {
      unsubDoubts();
      unsubDoubtReplies();
    };
  }, [verifiedAuthUid, enableDoubtsSync]);

  // Filter out any orphaned submissions whose simulado was deleted
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
    setSelectedCourseId(null);
    setSelectedPlaylistId(null);
    setSelectedLessonId(null);
    setActivePdf(null);
    setActiveNav('home');
    saveAuthHint(null);
    setUser(null);
    setVerifiedAuthUid(null);
    await signOut(auth);
  };

  // --- ADMIN CRUD OPERATIONS (CLEAN & DETERMINISTIC, NO PHANTOM RE-SEEDS) ---
  const handleSaveLesson = async (
    lessonData: Omit<Lesson, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    if (!user) return;
    const { id, ...payload } = lessonData;
    const ref = doc(db, 'lessons', id);
    const existingLesson = lessons.find((l) => l.id === id);

    try {
      await setDoc(ref, {
        title: payload.title,
        description: payload.description || '',
        youtubeId: payload.youtubeId,
        duration: payload.duration || '15:00',
        thumbnailUrl: payload.thumbnailUrl || '',
        pdfs: payload.pdfs || [],
        folderId: payload.folderId ?? existingLesson?.folderId ?? '',
        isFree: Boolean(payload.isFree),
        isPublished: true,
        authorId: existingLesson?.authorId || payload.authorId || user.uid,
        createdAt: existingLesson?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Keep Free Playlist in sync if lesson's isFree status was toggled
      const existingFreePl = playlists.find((p) => p.id === FREE_PLAYLIST_ID);
      if (payload.isFree) {
        const nextFreeIds = existingFreePl
          ? Array.from(new Set([...existingFreePl.lessonIds, id]))
          : [id];

        await setDoc(doc(db, 'playlists', FREE_PLAYLIST_ID), {
          title: 'Aulas Grátis',
          description: existingFreePl?.description || '',
          coverUrl: existingFreePl?.coverUrl || 'preset:mastery',
          lessonIds: nextFreeIds,
          isPublished: true,
          authorId: existingFreePl?.authorId || user.uid,
          createdAt: existingFreePl?.createdAt || serverTimestamp(),
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
          isPublished: true,
          authorId: existingFreePl.authorId || user.uid,
          createdAt: existingFreePl.createdAt || serverTimestamp(),
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
    try {
      await deleteDoc(doc(db, 'lessons', lessonId));
      if (selectedLessonId === lessonId) {
        setSelectedLessonId(null);
      }

      // Cascade-remove deleted lessonId from all playlists so no ghost references remain
      for (const pl of playlists) {
        if (pl.lessonIds.includes(lessonId)) {
          const cleanedIds = pl.lessonIds.filter((id) => id !== lessonId);
          await setDoc(doc(db, 'playlists', pl.id), {
            title: pl.title,
            description: pl.description || '',
            coverUrl: pl.coverUrl || 'preset:stadium',
            lessonIds: cleanedIds,
            isPublished: true,
            authorId: pl.authorId || user?.uid || '',
            createdAt: pl.createdAt || serverTimestamp(),
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
    if (!user) return;
    const { id, ...payload } = folderData;
    const ref = doc(db, 'lessonFolders', id);
    const existingFolder = lessonFolders.find((f) => f.id === id);

    try {
      await setDoc(ref, {
        name: sanitizeString(payload.name, 120, 'Pasta'),
        isPublished: true,
        authorId: existingFolder?.authorId || payload.authorId || user.uid,
        createdAt: existingFolder?.createdAt || serverTimestamp(),
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
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'lessonFolders', folderId));
      // Clear folderId on lessons that belonged to this folder so they remain accessible
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
          isFree: Boolean(lesson.isFree),
          isPublished: true,
          authorId: lesson.authorId || user.uid,
          createdAt: lesson.createdAt || serverTimestamp(),
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
    if (!user || lessonIds.length === 0) return;
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
          isFree: Boolean(lesson.isFree),
          isPublished: true,
          authorId: lesson.authorId || user.uid,
          createdAt: lesson.createdAt || serverTimestamp(),
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
    if (!user) return;
    const { id, ...payload } = playlistData;
    const ref = doc(db, 'playlists', id);
    const existingPl = playlists.find((p) => p.id === id);

    // Filter out any deleted lesson IDs
    const validLessonIds = new Set(lessons.map((l) => l.id));
    const cleanLessonIds = payload.lessonIds.filter((lid) =>
      validLessonIds.has(lid)
    );

    try {
      await setDoc(ref, {
        title: payload.title,
        description: payload.description || '',
        coverUrl: payload.coverUrl || 'preset:stadium',
        lessonIds: cleanLessonIds,
        isPublished: true,
        authorId: existingPl?.authorId || payload.authorId || user.uid,
        createdAt: existingPl?.createdAt || serverTimestamp(),
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
    try {
      await deleteDoc(doc(db, 'playlists', playlistId));
      if (selectedPlaylistId === playlistId) {
        setSelectedPlaylistId(null);
      }

      // Cascade-remove deleted playlistId from all courses
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
            featured: Boolean(c.featured),
            isPublished: true,
            authorId: c.authorId || user?.uid || '',
            createdAt: c.createdAt || serverTimestamp(),
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
    if (!user) return;
    const { id, ...payload } = courseData;
    const ref = doc(db, 'courses', id);
    const existingCourse = courses.find((c) => c.id === id);

    const validPlaylistIds = new Set(playlists.map((p) => p.id));
    const cleanPlaylistIds = payload.playlistIds.filter((pid) =>
      validPlaylistIds.has(pid)
    );

    try {
      await setDoc(ref, {
        title: payload.title,
        subtitle: payload.subtitle || '',
        description: payload.description || '',
        category: payload.category || 'Destaques',
        coverUrl: payload.coverUrl || 'preset:stadium',
        bannerUrl: payload.bannerUrl || '',
        playlistIds: cleanPlaylistIds,
        featured: Boolean(payload.featured),
        isPublished: true,
        authorId: existingCourse?.authorId || payload.authorId || user.uid,
        createdAt: existingCourse?.createdAt || serverTimestamp(),
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

  // --- SIMULADO ADMIN & STUDENT SUBMISSION HANDLERS ---
  const handleSaveSimulado = async (
    simuladoData: Omit<Simulado, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => {
    if (!user) return;
    const { id, ...payload } = simuladoData;
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
        answerKey: payload.answerKey,
        resultsReleased: Boolean(payload.resultsReleased),
        isPublished: true,
        authorId: existingSim?.authorId || payload.authorId || user.uid,
        createdAt: existingSim?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
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

      // Also delete all submissions associated with this simulado so no remnant data remains
      const subsToDelete = simuladoSubmissions.filter(
        (sub) => sub.simuladoId === simuladoId
      );
      for (const sub of subsToDelete) {
        await deleteDoc(doc(db, 'simuladoSubmissions', sub.id));
      }

      // Clear local draft cache if any
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
        answerKey: simulado.answerKey,
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

      // Sync courses for students belonging to this Turma
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
      // Unlink students from the deleted turma without deleting the students or their simulado data
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

  // --- USER PROGRESS & PROFILE (FAVORITES, COMPLETION, NAME, PHONE & BIRTHDATE) ---
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
    if (!user || !profileNameInput.trim()) return;
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

      // Sync updated name across any existing simulado submissions by this user
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

  const toggleFavoriteLesson = (lessonId: string) => {
    if (!userProgress) return;
    const exists = userProgress.favoriteLessonIds.includes(lessonId);
    const nextFavs = exists
      ? userProgress.favoriteLessonIds.filter((id) => id !== lessonId)
      : [...userProgress.favoriteLessonIds, lessonId];
    saveProgressState(
      nextFavs,
      userProgress.completedLessonIds,
      userProgress.lastWatchedLessonId
    );
  };

  const toggleCompletedLesson = (lessonId: string) => {
    if (!userProgress) return;
    const exists = userProgress.completedLessonIds.includes(lessonId);
    const nextComp = exists
      ? userProgress.completedLessonIds.filter((id) => id !== lessonId)
      : [...userProgress.completedLessonIds, lessonId];
    saveProgressState(userProgress.favoriteLessonIds, nextComp, lessonId);
  };

  // --- ACCESS CONTROL: LIBERATED STUDENT vs BLOCKED STUDENT (COURSES LIBERATED STRICTLY VIA TURMAS) ---
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
    if (!myStudentRecord || !myStudentTurma) return false;
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
      const next = {
        ...prev,
        [lessonId]: {
          currentTimeSec: existing?.currentTimeSec || 0,
          durationSec: existing?.durationSec || 0,
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
    const resolvedCourseId = parentCourse ? parentCourse.id : null;
    const resolvedPlId = parentPl ? parentPl.id : null;
    setSelectedCourseId(resolvedCourseId);
    setSelectedPlaylistId(resolvedPlId);
    setSelectedLessonId(lesson.id);
    recordWatchActivity(lesson.id, resolvedPlId, resolvedCourseId);
  };

  const exitClassroom = () => {
    setSelectedCourseId(null);
    setSelectedPlaylistId(null);
    setSelectedLessonId(null);
    setActivePdf(null);
    setIsLessonsDropdownOpen(false);
    setIsSimuladoEditorOpen(false);
    setEditingSimuladoDirect(null);
  };

  const scrollCarousel = (dir: -1 | 1) => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

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

  // When a playlist is selected, show strictly the lessons of that playlist
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

  const handleLessonTimeUpdate = (
    lessonId: string,
    currentTimeSec: number,
    durationSec: number
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
    setLessonWatchMap((prev) => {
      const existing = prev[lessonId];
      if (
        existing &&
        Math.abs(existing.currentTimeSec - currentTimeSec) < 3 &&
        existing.playlistId === resolvedPlId
      ) {
        return prev;
      }
      const next = {
        ...prev,
        [lessonId]: {
          currentTimeSec,
          durationSec: durationSec || existing?.durationSec || 0,
          courseId: resolvedCourseId,
          playlistId: resolvedPlId,
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

    if (resolvedPlId) {
      setPlaylistWatchMap((prev) => {
        const existingPl = prev[resolvedPlId];
        if (
          existingPl &&
          existingPl.lessonId === lessonId &&
          now - (existingPl.updatedAt || 0) < 10000
        ) {
          return prev;
        }
        const next = {
          ...prev,
          [resolvedPlId]: {
            lessonId,
            courseId: resolvedCourseId,
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

    // Ensure student has access to continue watching this lesson
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
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[#2563eb] border-t-transparent animate-spin" />
      </div>
    );
  }

  // --- GOOGLE-ONLY LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#070b14] text-white relative overflow-hidden flex flex-col items-center justify-center px-4">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[540px] h-[540px] rounded-full bg-[#2563eb]/25 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-[#050a14] to-transparent pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm bg-[#0d1527]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
          <div className="inline-flex items-center justify-center mb-5">
            <VerticeLogo className="w-14 h-14" />
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-white uppercase">
            {platformConfig.brandName || 'CURSO VÉRTICE'}
          </h1>
          <p className="mt-1.5 text-xs text-slate-300 text-balance">
            {platformConfig.heroTitle || 'Sua plataforma para Enem e vestibulares'}
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoggingIn}
            className="mt-8 w-full py-3.5 px-5 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.99] text-white text-sm font-bold flex items-center justify-center gap-3 shadow-[0_8px_28px_rgba(37,99,235,0.45)] transition-all cursor-pointer disabled:opacity-50"
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
    <div className="min-h-screen bg-[#070b14] text-slate-100 relative flex flex-col pb-20 md:pb-12 overflow-x-hidden">
      {/* FULL-BLEED MEMBERCLASS STAGE BACKGROUND (NO HARD LINES, SMOOTH FADE DOWNWARD) */}
      {showFullBleedBackdrop && (
        <div className="absolute inset-x-0 top-0 h-[560px] md:h-[660px] z-0 pointer-events-none overflow-hidden select-none">
          {platformConfig.heroBgUrl ? (
            <img
              src={platformConfig.heroBgUrl}
              alt={displayHeroTitle}
              referrerPolicy="no-referrer"
              className={`w-full h-full object-cover object-center scale-[1.02] ${
                theme === 'light' ? 'opacity-30' : 'opacity-70'
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
                className={`absolute top-12 left-1/2 -translate-x-1/2 w-[540px] h-[240px] rounded-full blur-[110px] ${
                  theme === 'light' ? 'bg-[#3b82f6]/20' : 'bg-[#3b82f6]/25'
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
        className={`sticky top-0 z-30 px-5 md:px-12 py-4 flex items-center justify-between gap-6 transition-colors ${
          showFullBleedBackdrop
            ? theme === 'light'
              ? 'bg-gradient-to-b from-[#f0f5fc]/90 via-[#f0f5fc]/50 to-transparent'
              : 'bg-gradient-to-b from-[#070b14]/85 via-[#070b14]/40 to-transparent'
            : 'bg-[#070b14]/95 backdrop-blur-md border-b border-white/5'
        }`}
      >
        {/* Zone 1: White Transparent Logo + White Course Name */}
        <button
          type="button"
          onClick={() => {
            exitClassroom();
            setActiveNav('home');
          }}
          className="inline-flex items-center gap-2.5 text-base md:text-lg font-extrabold tracking-wider text-white uppercase whitespace-nowrap shrink-0 cursor-pointer"
        >
          <VerticeLogo className="w-7 h-7 md:w-8 md:h-8" />
          <span>{displayBrandName}</span>
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              exitClassroom();
              setActiveNav('home');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeNav === 'home' && !activeLesson && !activePdf && !isCalendarModalOpen
                ? 'text-white font-bold'
                : 'text-slate-300/80 hover:text-white'
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
                  ? 'text-white font-bold'
                  : 'text-slate-300/80 hover:text-white'
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
                ? 'text-white font-bold'
                : 'text-slate-300/80 hover:text-white'
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
                ? 'text-white font-bold'
                : 'text-slate-300/80 hover:text-white'
            }`}
          >
            Dúvidas
          </button>

          {isBlockedUser && (
            <button
              type="button"
              onClick={openFreeModule}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCourseId === FREE_COURSE_ID || activeNav === 'free'
                  ? 'text-white font-bold'
                  : 'text-slate-300/80 hover:text-white'
              }`}
            >
              Aulas Grátis
            </button>
          )}
        </nav>

        {/* Zone 3: Admin Controls + Profile */}
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
                  ? 'bg-white text-[#070b14]'
                  : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-[0_0_20px_rgba(37,99,235,0.35)]'
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
              className="flex items-center gap-1.5 p-1 pr-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 hover:text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Conta'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-xs font-bold">
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
                className={`w-3.5 h-3.5 text-slate-300 transition-transform duration-200 ${
                  isProfileDropdownOpen ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {isProfileDropdownOpen && (
              <div className="absolute right-0 top-full mt-2.5 w-52 rounded-2xl bg-[#0d1527]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-1.5 z-50">
                <button
                  type="button"
                  onClick={openProfileModal}
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/[0.06] transition-all text-left cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-[#2563eb]/15 border border-[#3b82f6]/30 text-[#60a5fa] group-hover:bg-[#2563eb] group-hover:border-[#3b82f6] group-hover:text-white flex items-center justify-center shrink-0 transition-all">
                    <UserIcon className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Perfil</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
                  }
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white hover:bg-white/[0.06] transition-all text-left cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-[#2563eb]/15 border border-[#3b82f6]/30 text-[#60a5fa] group-hover:bg-[#2563eb] group-hover:border-[#3b82f6] group-hover:text-white flex items-center justify-center shrink-0 transition-all">
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

                <div className="my-1 border-t border-white/10" />

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    handleSignOut();
                  }}
                  className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-all text-left cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-slate-300 group-hover:bg-rose-500/20 group-hover:border-rose-500/40 group-hover:text-rose-300 flex items-center justify-center shrink-0 transition-all">
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
        <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-12 py-6 flex flex-col space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setActivePdf(null)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white transition-colors shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-[#3b82f6]" />
                Voltar
              </button>
              <h1 className="text-sm md:text-base font-bold text-white truncate">
                {activePdf.title}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => triggerPdfDownload(activePdf.url, activePdf.title)}
              className="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar PDF
            </button>
          </div>

          <div className="flex-1 min-h-[75vh] rounded-2xl overflow-hidden bg-[#12101b] border border-white/10 flex items-center justify-center">
            {isLoadingActivePdf ? (
              <div className="flex flex-col items-center gap-3 text-slate-400 text-xs">
                <div className="w-8 h-8 rounded-full border-2 border-[#2563eb] border-t-transparent animate-spin" />
                <span>Carregando PDF...</span>
              </div>
            ) : resolvedActivePdfUrl ? (
              <iframe
                src={resolvedActivePdfUrl}
                title={activePdf.title}
                className="w-full h-[75vh] border-0"
              />
            ) : (
              <span className="text-xs text-slate-400">
                Não foi possível exibir o PDF. Clique em Baixar PDF acima.
              </span>
            )}
          </div>
        </main>
      ) : activeCourse && !selectedPlaylistId && !activeLesson ? (
        /* COURSE PLAYLISTS CARD VIEW (SHOWN WHEN STUDENT CLICKS A COURSE) */
        <main className="relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-8 md:px-14 lg:px-20 py-6 space-y-5">
          <div className="flex items-center gap-3.5 pb-4 border-b border-white/10 min-w-0">
            <button
              type="button"
              onClick={exitClassroom}
              className="h-9 px-3.5 rounded-xl bg-[#0d1527] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#3b82f6]" />
              <span>Voltar</span>
            </button>

            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-white truncate">
                {activeCourse.title}
              </h1>
            </div>
          </div>

          {coursePlaylists.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#0d1527] border border-white/10 text-center space-y-2">
              <p className="text-sm font-bold text-white">
                Nenhuma playlist cadastrada neste curso ainda
              </p>
              <p className="text-xs text-slate-400">
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
                    className="cover-poster-dark group relative w-full aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 hover:border-[#3b82f6]/80 hover:-translate-y-1 text-left transition-all duration-300 shadow-lg cursor-pointer"
                  >
                    <CoverArtwork
                      src={pl.coverUrl}
                      title={pl.title}
                      className="w-full h-full"
                      showBottomPurpleBar
                    />

                    <div className="absolute top-2.5 right-2.5 z-10">
                      <span className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-mono font-bold text-white keep-white-text">
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
        /* EMPTY PLAYLIST FALLBACK VIEW (IF PLAYLIST HAS 0 LESSONS YET) */
        <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 md:px-10 py-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
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
                className="h-9 px-3.5 rounded-xl bg-[#0d1527] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#3b82f6]" />
                <span>Voltar</span>
              </button>

              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {resolvedCourseForHeader && (
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-300">
                    {resolvedCourseForHeader.title}
                  </span>
                )}
                {resolvedCourseForHeader && activePlaylist && (
                  <ArrowRight className="w-4 h-4 text-blue-300 shrink-0" />
                )}
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  {activePlaylist.title}
                </h1>
              </div>
            </div>
          </div>

          <div className="p-10 rounded-2xl bg-[#0d1527] border border-white/10 text-center space-y-2">
            <p className="text-sm font-bold text-white">
              Nenhuma aula cadastrada nesta playlist ainda
            </p>
            <p className="text-xs text-slate-400">
              Clique em Voltar para selecionar outra playlist do curso.
            </p>
          </div>
        </main>
      ) : activeLesson ? (
        /* CLASSROOM WINDOW */
        <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 md:px-10 py-5">
          {/* Backdrop overlay when lessons dropdown is open to separate it visually from the video */}
          {isLessonsDropdownOpen && (
            <div
              onClick={() => setIsLessonsDropdownOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 transition-opacity"
              aria-hidden="true"
            />
          )}

          {/* COURSE NAME [ARROW] PLAYLIST NAME PLAIN TEXT AT THE TOP OF THE SCREEN */}
          {(resolvedCourseForHeader || activePlaylist) && (
            <div className="mb-3 px-0.5 flex flex-wrap items-center gap-2 min-w-0">
              {resolvedCourseForHeader && (
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-300">
                  {resolvedCourseForHeader.title}
                </span>
              )}
              {resolvedCourseForHeader && activePlaylist && (
                <ArrowRight className="w-4 h-4 text-blue-300 shrink-0" />
              )}
              {activePlaylist && (
                <h2 className="text-sm sm:text-base font-extrabold text-white">
                  {activePlaylist.title}
                </h2>
              )}
            </div>
          )}

          {/* TOP BAR ABOVE VIDEO: [Voltar] --- [< 1/2 >] --- [Dropdown Aulas] */}
          <div className="flex items-center justify-between gap-2 mb-3.5 relative z-50 w-full">
            {/* 1. Voltar Button (Left): Returns to Course Playlists cards if inside a course, else Home */}
            <button
              type="button"
              onClick={() => {
                if (selectedCourseId && selectedCourseId !== FREE_COURSE_ID) {
                  setSelectedPlaylistId(null);
                  setSelectedLessonId(null);
                  setIsLessonsDropdownOpen(false);
                } else {
                  exitClassroom();
                }
              }}
              className="h-9 px-3 rounded-xl bg-[#0d1527] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 hover:text-white transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#3b82f6]" />
              <span>Voltar</span>
            </button>

            {/* 2. Compact Minimalist Previous / Next Lesson Control (Center) */}
            <div className="h-9 inline-flex items-center gap-0.5 p-1 rounded-xl bg-[#0d1527] border border-white/10 shrink-0">
              <button
                type="button"
                disabled={!prevLesson}
                onClick={() => {
                  if (prevLesson) {
                    setSelectedLessonId(prevLesson.id);
                    setIsLessonsDropdownOpen(false);
                  }
                }}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Aula anterior"
                aria-label="Aula anterior"
              >
                <ChevronLeft className="w-4 h-4 text-[#3b82f6]" />
              </button>

              <span className="px-2 text-[11px] font-mono font-medium text-slate-300 tabular-nums select-none">
                {currentLessonIndex >= 0
                  ? `${currentLessonIndex + 1} / ${orderedClassroomLessons.length}`
                  : '1 / 1'}
              </span>

              <button
                type="button"
                disabled={!nextLesson}
                onClick={() => {
                  if (nextLesson) {
                    setSelectedLessonId(nextLesson.id);
                    setIsLessonsDropdownOpen(false);
                  }
                }}
                className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Próxima aula"
                aria-label="Próxima aula"
              >
                <ChevronRight className="w-4 h-4 text-[#3b82f6]" />
              </button>
            </div>

            {/* 3. Lessons Dropdown Button & Menu (Top-Right Corner above Video) */}
            <div ref={lessonsDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsLessonsDropdownOpen((prev) => !prev)}
                className={`h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  isLessonsDropdownOpen
                    ? 'bg-[#2563eb] border-[#93c5fd] text-white shadow-[0_0_20px_rgba(37,99,235,0.45)]'
                    : 'bg-[#0d1527] hover:bg-white/10 border-white/10 text-slate-200 hover:text-white'
                }`}
              >
                <ListVideo
                  className={`w-3.5 h-3.5 ${
                    isLessonsDropdownOpen ? 'text-white' : 'text-[#3b82f6]'
                  }`}
                />
                <span>Aulas</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isLessonsDropdownOpen ? 'rotate-180 text-white' : 'text-slate-400'
                  }`}
                />
              </button>

              {isLessonsDropdownOpen && (
                <div className="absolute right-0 top-full mt-2.5 w-[calc(100vw-2rem)] sm:w-84 max-w-[350px] max-h-[68vh] overflow-y-auto rounded-2xl bg-[#0f1b33] border border-[#3b82f6]/50 ring-1 ring-white/10 shadow-[0_28px_70px_rgba(0,0,0,0.95),0_0_32px_rgba(37,99,235,0.28)] overflow-hidden z-50">
                  <div className="px-4 py-3 bg-[#231e3a] border-b border-white/10 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {resolvedCourseForHeader && (
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-300 truncate">
                          {resolvedCourseForHeader.title}
                        </span>
                      )}
                      <h2 className="text-xs font-bold text-white truncate">
                        {activePlaylist
                          ? activePlaylist.title
                          : resolvedCourseForHeader
                            ? resolvedCourseForHeader.title
                            : 'Selecionar Aula'}
                      </h2>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-mono font-semibold text-blue-200 shrink-0">
                      {orderedClassroomLessons.length} aula
                      {orderedClassroomLessons.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="p-3.5 space-y-1.5">
                    {orderedClassroomLessons.map((lesson, idx) => {
                      const isCurrent = lesson.id === activeLesson.id;
                      const isDone =
                        userProgress?.completedLessonIds.includes(lesson.id);
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => {
                            setSelectedLessonId(lesson.id);
                            setIsLessonsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2.5 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-[#2563eb] border border-[#93c5fd] text-white shadow-[0_6px_16px_rgba(37,99,235,0.35)]'
                              : 'bg-[#231f3a]/80 hover:bg-[#1a2e56] border border-white/10 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono tabular-nums shrink-0 ${
                                isCurrent
                                  ? 'bg-white text-[#1d4ed8] font-bold'
                                  : isDone
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-white/10 text-slate-300'
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
                                isCurrent
                                  ? 'font-bold text-white'
                                  : 'font-medium text-slate-200'
                              }`}
                            >
                              {lesson.title}
                            </p>
                          </div>

                          {isCurrent && (
                            <Play className="w-3.5 h-3.5 text-white fill-current shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {hasLessonVideo(activeLesson.youtubeId) && (
              <StealthVideoPlayer
                youtubeIdOrUrl={activeLesson.youtubeId}
                title={activeLesson.title}
                subtitle={activeCourse?.title}
                initialTimeSec={
                  lessonWatchMap[activeLesson.id]?.currentTimeSec || 0
                }
                onTimeUpdate={(currentTimeSec, durationSec) =>
                  handleLessonTimeUpdate(
                    activeLesson.id,
                    currentTimeSec,
                    durationSec
                  )
                }
                isCompleted={userProgress?.completedLessonIds.includes(
                  activeLesson.id
                )}
                onToggleComplete={() => toggleCompletedLesson(activeLesson.id)}
                hasNextLesson={Boolean(nextLesson)}
                onNextLesson={() => {
                  if (nextLesson) setSelectedLessonId(nextLesson.id);
                }}
                theaterMode={theaterMode}
                onToggleTheaterMode={() => setTheaterMode((prev) => !prev)}
              />
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                {activeLesson.title}
              </h1>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleCompletedLesson(activeLesson.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    userProgress?.completedLessonIds.includes(activeLesson.id)
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                      : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white'
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
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line max-w-[68ch]">
                  {activeLesson.description}
                </p>
              </div>
            )}

            {activeLesson.pdfs && activeLesson.pdfs.length > 0 && (
              <div className="space-y-3 pt-2">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#3b82f6]" />
                  PDFs da Aula
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeLesson.pdfs.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#0d1527] border border-white/10 hover:border-[#3b82f6]/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#2563eb]/15 border border-[#2563eb]/30 text-blue-300 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-white truncate">
                          {pdf.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActivePdf(pdf)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
                        >
                          Ler
                        </button>
                        <button
                          type="button"
                          onClick={() => triggerPdfDownload(pdf.url, pdf.title)}
                          className="p-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white transition-colors cursor-pointer"
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
          {/* HERO SECTION ON HOME + MINIMALIST INTERACTIVE CIRCULAR CALENDAR ICON */}
          {activeNav === 'home' && (
            <section className="pt-8 pb-8 md:pt-14 md:pb-12 flex flex-col sm:flex-row sm:items-start justify-between gap-5">
              <div className="max-w-2xl space-y-4">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white text-balance leading-[1.14]">
                  {displayHeroTitle}
                </h1>
                <p className="text-xs sm:text-sm md:text-base text-slate-300/90 max-w-lg font-medium leading-relaxed">
                  {displayHeroSubtitle}
                </p>

                {/* "Confira agora!" button ONLY appears for Blocked Students */}
                {isBlockedUser && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={openFreeModule}
                      className="px-7 py-3 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-95 text-white text-sm font-bold shadow-[0_6px_30px_rgba(37,99,235,0.55)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {platformConfig.heroCtaText || 'Confira agora!'}
                    </button>
                  </div>
                )}
              </div>

              {/* MINIMALIST INTERACTIVE CIRCULAR CALENDAR BUTTON (SOMENTE ADMIN NO TOPO DA TELA INICIAL) */}
              {isAdmin && (
                <div className="shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => setIsCalendarModalOpen(true)}
                    title="Abrir Calendário do Curso (Assuntos da Semana, Eventos e Feriados)"
                    aria-label="Abrir Calendário Acadêmico"
                    className="group relative inline-flex items-center gap-3 p-1.5 pr-4 rounded-full bg-[#0a1224]/90 hover:bg-[#162544] border border-[#3b82f6]/45 hover:border-[#60a5fa] shadow-[0_10px_32px_rgba(37,99,235,0.32)] hover:shadow-[0_12px_38px_rgba(96,165,250,0.55)] transition-all duration-300 active:scale-95 cursor-pointer"
                  >
                    <span className="relative w-11 h-11 rounded-full bg-gradient-to-tr from-[#2563eb] via-[#2563eb] to-[#93c5fd] text-white flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.65)] group-hover:scale-105 group-hover:rotate-6 transition-all duration-300 keep-white-text">
                      <CalendarIcon className="w-5 h-5" />
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0a1224] flex items-center justify-center">
                        <Sparkles className="w-2 h-2 text-black" />
                      </span>
                    </span>
                    <div className="text-left">
                      <span className="block text-xs font-extrabold text-white group-hover:text-blue-200 transition-colors">
                        Calendário
                      </span>
                      <span className="block text-[10px] font-semibold text-blue-300/90">
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
                {/* CONTINUE WATCHING LESSON CARD AT THE TOP OF HOME */}
                {continueWatchingData && (
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-blue-300 flex items-center gap-2">
                        <Play className="w-3.5 h-3.5 text-[#3b82f6] fill-current" />
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
                      className="w-full sm:max-w-xl p-3.5 sm:p-4 rounded-2xl bg-[#0d1527]/95 hover:bg-[#132240] border border-[#3b82f6]/35 hover:border-[#3b82f6]/80 transition-all flex items-center gap-3.5 sm:gap-4 text-left group shadow-lg cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-[#2563eb] text-white flex items-center justify-center shadow-[0_4px_16px_rgba(37,99,235,0.45)] group-hover:scale-105 transition-transform shrink-0 keep-white-text">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">
                          {continueWatchingData.lesson.title}
                        </p>

                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-[#3b82f6] rounded-full transition-all"
                            style={{
                              width: `${Math.max(8, continueWatchingData.progressPercent)}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="shrink-0 pr-1 text-[#3b82f6] group-hover:translate-x-0.5 transition-transform">
                        <ChevronRight className="w-5 h-5" />
                      </div>
                    </button>
                  </section>
                )}

                {/* Courses Vertical Portrait Grid (2 on Mobile, 5 on Tablet, 7 on PC) */}
                {homeCourses.length > 0 && (
                  <section className="space-y-4">
                    <h2 className="text-base md:text-lg font-bold text-white tracking-tight">
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
                          className="cover-poster-dark group relative w-full aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 hover:border-[#3b82f6]/80 hover:-translate-y-1 text-left transition-all duration-300 shadow-xl cursor-pointer"
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

            {/* SIMULADOS TAB (REPLACES AULAS IN BOTTOM BAR & NAV) */}
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
                    simulados={simulados}
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

            {/* DÚVIDAS SOCIAL Q&A TAB (REPLACES FAVORITES) */}
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
                  onCreateDoubt={handleCreateDoubt}
                  onToggleLikeDoubt={handleToggleLikeDoubt}
                  onToggleResolveDoubt={handleToggleResolveDoubt}
                  onDeleteDoubt={requestDeleteDoubt}
                  onCreateReply={handleCreateReply}
                  onDeleteReply={requestDeleteDoubtReply}
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
                      className="h-9 px-3.5 rounded-xl bg-[#0d1527] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white transition-colors shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-[#3b82f6]" />
                      <span>Voltar</span>
                    </button>
                    <h2 className="text-xl font-bold text-white">
                      {activeNav === 'free' && 'Aulas Grátis'}
                      {activeNav === 'lessons' && 'Aulas'}
                    </h2>
                  </div>
                </div>

                {(() => {
                  const list = lessons.filter((l) => {
                    if (activeNav === 'free') {
                      return l.isFree;
                    }
                    return isBlockedUser ? l.isFree : true;
                  });

                  if (list.length === 0) {
                    return (
                      <div className="py-16 text-center rounded-2xl bg-[#0d1527]/60 border border-white/5">
                        <p className="text-sm text-slate-400">
                          Nenhuma aula disponível.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {list.map((lesson) => (
                        <div
                          key={lesson.id}
                          onClick={() => openDirectLesson(lesson)}
                          className="group rounded-2xl bg-[#0d1527] border border-white/10 hover:border-[#3b82f6]/60 overflow-hidden transition-all flex flex-col cursor-pointer"
                        >
                          <div className="relative aspect-video bg-black overflow-hidden">
                            <CoverArtwork
                              src={lesson.thumbnailUrl}
                              title={lesson.title}
                              className="w-full h-full"
                              showBottomPurpleBar={false}
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-11 h-11 rounded-full bg-[#2563eb] text-white flex items-center justify-center shadow-lg">
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              </div>
                            </div>
                          </div>

                          <div className="p-3.5">
                            <h3 className="text-xs font-bold text-white line-clamp-2 group-hover:text-blue-300 transition-colors">
                              {lesson.title}
                            </h3>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </section>
            )}
          </div>
        </main>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-[80] bg-[#070b14]/95 backdrop-blur-xl border-t border-white/10 px-2 py-2 flex items-center justify-around ${
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
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
            activeNav === 'home' && !activeLesson && !activePdf && !isCalendarModalOpen
              ? 'text-[#60a5fa] font-bold'
              : 'text-slate-400'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Início</span>
        </button>

        {/* 2º ÍCONE DO MENU INFERIOR: CALENDÁRIO (EXCLUSIVO PARA OS ALUNOS - !isAdmin) */}
        {!isAdmin && (
          <button
            type="button"
            onClick={() => {
              exitClassroom();
              setIsCalendarModalOpen(true);
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
              isCalendarModalOpen
                ? 'text-[#60a5fa] font-bold'
                : 'text-slate-400'
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
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
            activeNav === 'simulados' && !activeLesson && !activePdf && !isCalendarModalOpen
              ? 'text-[#60a5fa] font-bold'
              : 'text-slate-400'
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
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
            activeNav === 'duvidas' && !activeLesson && !activePdf && !isCalendarModalOpen
              ? 'text-[#60a5fa] font-bold'
              : 'text-slate-400'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>Dúvidas</span>
        </button>

        {/* MENU INFERIOR DO ADMIN: MANTIDO COMO ESTAVA ORIGINALMENTE (SEM O CALENDÁRIO) */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setIsCalendarModalOpen(false);
              exitClassroom();
              setActiveNav('admin');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
              activeNav === 'admin' && !activeLesson && !activePdf && !isCalendarModalOpen
                ? 'text-[#60a5fa] font-bold'
                : 'text-slate-400'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Gerenciar</span>
          </button>
        )}
      </nav>

      {/* USER PROFILE MODAL (EDITABLE NAME & PHONE, READ-ONLY CPF & EMAIL) */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#0d1527] border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={profileNameInput || 'Perfil'}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-white/15 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#2563eb] text-white flex items-center justify-center text-sm font-extrabold shrink-0">
                    {(profileNameInput || user.email || 'A')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold tracking-tight text-white truncate">
                    Meu Perfil
                  </h2>
                  <p className="text-xs text-slate-300/90 font-medium truncate">
                    Dados da sua conta
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Fechar perfil"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUserProfile} className="p-6 space-y-4">
              {/* Aparência / Tema Claro & Escuro */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Aparência da Plataforma
                </label>
                <div
                  role="group"
                  aria-label="Selecionar tema da plataforma"
                  className="relative grid grid-cols-2 p-1 rounded-2xl bg-[#070b14] border border-white/10 select-none"
                >
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl bg-[#2563eb] shadow-[0_4px_16px_rgba(37,99,235,0.45)] transition-transform duration-200 ease-out ${
                      theme === 'light' ? 'translate-x-full' : 'translate-x-0'
                    }`}
                  />

                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`relative z-10 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      theme === 'dark'
                        ? 'text-white keep-white-text'
                        : 'text-slate-300/80 hover:text-white'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Tema Escuro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`relative z-10 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      theme === 'light'
                        ? 'text-white keep-white-text'
                        : 'text-slate-300/80 hover:text-white'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Tema Claro</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                  Nome
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={profileNameInput}
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#070b14] border border-white/10 text-sm font-medium text-white focus:outline-none focus:border-[#3b82f6]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
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
                    className="w-full px-4 py-2.5 rounded-xl bg-[#070b14] border border-white/10 text-sm font-medium text-white tabular-nums focus:outline-none focus:border-[#3b82f6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">
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
                    className="w-full px-4 py-2.5 rounded-xl bg-[#070b14] border border-white/10 text-sm font-medium text-white tabular-nums focus:outline-none focus:border-[#3b82f6]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-400">
                    CPF
                  </label>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
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
                  className="w-full px-4 py-2.5 rounded-xl bg-[#070b14]/60 border border-white/5 text-sm font-medium text-slate-400 tabular-nums cursor-not-allowed select-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-400">
                    E-mail
                  </label>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <Lock className="w-3 h-3" />
                    Não alterável
                  </span>
                </div>
                <input
                  type="email"
                  readOnly
                  disabled
                  value={user.email || ''}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#070b14]/60 border border-white/5 text-sm font-medium text-slate-400 cursor-not-allowed select-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-6 py-2.5 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold shadow-[0_6px_24px_rgba(37,99,235,0.45)] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingProfile ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CALENDAR MODAL WINDOW (FULL SCREEN BORDERLESS, PRESENT MONTH, CIRCULAR ICONS & HIGHLIGHTER) */}
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
            className="w-full max-w-sm rounded-3xl bg-[#0d1527] border border-white/10 p-6 shadow-2xl space-y-5 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <MessageCircle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-extrabold tracking-tight text-white">
                {lockedCoursePopup.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300/90 font-medium leading-relaxed">
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
                className="w-full py-2.5 px-5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION POPUP MODAL FOR DELETING USER, LESSON, PLAYLIST, COURSE OR SIMULADO */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#0d1527] border border-white/10 p-6 shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-extrabold tracking-tight text-white">
                Tem certeza da exclusão?
              </h3>
              <p className="text-xs sm:text-sm text-slate-300/90 font-medium leading-relaxed">
                Deseja realmente excluir {pendingDelete.articleAndType}{' '}
                <span className="font-bold text-white">
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
                className="flex-1 py-2.5 px-4 rounded-full bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
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
