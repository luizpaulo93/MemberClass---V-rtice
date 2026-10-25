import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  Upload,
  Check,
  Users,
  BookOpen,
  ListVideo,
  Video,
  Sliders,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  X,
  GraduationCap,
  ArrowRightLeft,
  Folder,
  FolderPlus,
  ChevronRight,
  Search,
  Calendar as CalendarIcon,
  Compass,
  ShieldCheck,
  Database,
  KeyRound,
  Image as ImageIcon,
} from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { updatePdfChunksIsFree } from '../utils/pdfStorage';
import {
  compressImageToDataUrl,
  recompressDataUrlImage,
} from '../utils/imageCompress';
import { AdminMentoriaTab } from './AdminMentoriaTab';
import {
  Course,
  Playlist,
  Lesson,
  LessonFolder,
  Student,
  Turma,
  PlatformConfig,
  Simulado,
  SimuladoSubmission,
  SCHEMA_LIMITS,
  IMAGE_DIMENSIONS,
  sanitizeString,
  formatBirthDateInput,
  formatBirthDateDisplay,
  generateSafeId,
  emailToStudentDocId,
  FREE_COURSE_ID,
  FREE_PLAYLIST_ID,
} from '../types';
import { CoverArtwork } from './CoverArtwork';

export { FREE_COURSE_ID, FREE_PLAYLIST_ID };
const UNASSIGNED_FOLDER_ID = '__UNASSIGNED__';

interface AdminWorkspaceProps {
  lessons: Lesson[];
  lessonFolders: LessonFolder[];
  playlists: Playlist[];
  courses: Course[];
  turmas: Turma[];
  students: Student[];
  simulados: Simulado[];
  simuladoSubmissions: SimuladoSubmission[];
  platformConfig: PlatformConfig;
  onOpenNewLessonModal: (defaultIsFree?: boolean, defaultFolderId?: string) => void;
  onOpenEditLessonModal: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => Promise<void>;
  onSaveLessonFolder: (
    folder: Omit<LessonFolder, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  onDeleteLessonFolder: (folderId: string) => Promise<void>;
  onMoveLessonsToFolder: (
    lessonIds: string[],
    targetFolderId: string
  ) => Promise<void>;
  onSavePlaylist: (
    playlist: Omit<Playlist, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onSaveCourse: (
    course: Omit<Course, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  onDeleteCourse: (courseId: string) => Promise<void>;
  onSaveFreeModule: (coverUrl: string, lessonIds: string[]) => Promise<void>;
  onSaveSimulado: (
    simulado: Omit<Simulado, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  onDeleteSimulado: (simuladoId: string) => Promise<void>;
  onToggleReleaseSimulado: (simulado: Simulado) => Promise<void>;
  onSaveTurma: (
    turma: Omit<Turma, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  onDeleteTurma: (turmaId: string) => Promise<void>;
  onSaveStudent: (
    student: Omit<Student, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  onDeleteStudent: (studentId: string) => Promise<void>;
  onSaveConfig: (config: Omit<PlatformConfig, 'updatedAt'>) => Promise<void>;
  onOpenCalendar?: () => void;
  onReorderLessonFolders?: (orderedFolderIds: string[]) => Promise<void>;
  onReorderLessons?: (orderedLessonIds: string[]) => Promise<void>;
  onReorderPlaylists?: (orderedPlaylistIds: string[]) => Promise<void>;
  onReorderCourses?: (orderedCourseIds: string[]) => Promise<void>;
  currentUserUid: string;
}

type AdminTab =
  | 'lessons'
  | 'playlists'
  | 'courses'
  | 'simulados'
  | 'turmas'
  | 'students'
  | 'mentoria'
  | 'config';

interface CleanCoverInputProps {
  label: string;
  sizeHint: string;
  value: string;
  onChange: (newVal: string) => void;
  targetWidth: number;
  targetHeight: number;
  resetValue?: string;
  unboxed?: boolean;
}

const CleanCoverInput: React.FC<CleanCoverInputProps> = ({
  label,
  sizeHint,
  value,
  onChange,
  targetWidth,
  targetHeight,
  resetValue = '',
  unboxed = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const hasCustomImage = Boolean(value && !value.startsWith('preset:'));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const maxRequestedSide = Math.max(targetWidth, targetHeight);
      const maxSide = maxRequestedSide >= 1500 ? 1280 : 680;
      const quality = maxSide >= 1280 ? 0.78 : 0.8;
      const resizedDataUrl = await compressImageToDataUrl(
        file,
        maxSide,
        quality
      );
      onChange(resizedDataUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div
      className={
        unboxed
          ? 'flex items-center justify-between gap-4 py-2'
          : 'flex items-center justify-between gap-4 p-3.5 rounded-xl bg-inset border border-line'
      }
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden border border-line shrink-0 bg-surface">
          <CoverArtwork
            src={value || 'preset:stadium'}
            title={label}
            className="w-full h-full"
            showBottomPurpleBar={true}
          />
        </div>
        <div className="min-w-0">
          <span className="block text-xs font-medium text-ink">{label}</span>
          <span className="block text-xs text-ink-muted mt-0.5">
            {sizeHint}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {hasCustomImage && (
          <button
            type="button"
            onClick={() => onChange(resetValue)}
            className="p-2 rounded-xl bg-chip hover:bg-rose-500/15 text-ink-muted hover:text-rose-500 transition-colors cursor-pointer"
            title="Remover imagem"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        <label className="px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors shrink-0">
          <Upload className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">
            {uploading ? 'Carregando...' : 'Enviar Imagem'}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
};

interface SortableItem {
  id: string;
  title: string;
}

interface SortableSelectionBoxProps {
  availableLabel: string;
  selectedLabel: string;
  allItems: SortableItem[];
  selectedIds: string[];
  onChangeSelectedIds: (nextIds: string[]) => void;
  maxItems: number;
}

const SortableSelectionBox: React.FC<SortableSelectionBoxProps> = ({
  availableLabel,
  selectedLabel,
  allItems,
  selectedIds,
  onChangeSelectedIds,
  maxItems,
}) => {
  const unselectedItems = allItems.filter((item) => !selectedIds.includes(item.id));
  const selectedItems = selectedIds
    .map((id) => allItems.find((item) => item.id === id))
    .filter((item): item is SortableItem => Boolean(item));

  const addItem = (id: string) => {
    if (selectedIds.includes(id) || selectedIds.length >= maxItems) return;
    onChangeSelectedIds([...selectedIds, id]);
  };

  const removeItem = (id: string) => {
    onChangeSelectedIds(selectedIds.filter((item) => item !== id));
  };

  const moveSelectedItem = (index: number, direction: 'up' | 'down') => {
    const currentIds = selectedItems.map((i) => i.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentIds.length) return;
    const nextIds = [...currentIds];
    const [moved] = nextIds.splice(index, 1);
    nextIds.splice(targetIndex, 0, moved);
    onChangeSelectedIds(nextIds);
  };

  return (
    <div className="p-4 rounded-xl bg-inset border border-line space-y-4">
      <div className="space-y-2">
        <span className="block text-xs font-medium text-ink-muted">
          {availableLabel} ({unselectedItems.length})
        </span>

        {unselectedItems.length > 0 && (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {unselectedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs bg-surface border border-line-soft text-ink-2 hover:text-ink hover:border-brand-soft/50 transition-colors cursor-pointer"
              >
                <span className="truncate">{item.title}</span>
                <Plus className="w-3.5 h-3.5 text-brand-accent shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-line space-y-2">
        <span className="block text-xs font-medium text-ink">
          {selectedLabel} ({selectedItems.length})
        </span>

        {selectedItems.length > 0 && (
          <div className="space-y-1.5">
            {selectedItems.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs bg-brand/15 border-brand/40 text-ink transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="font-mono tabular-nums text-brand-accent shrink-0">
                    {idx + 1}.
                  </span>
                  <span className="truncate font-medium">{item.title}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {selectedItems.length > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveSelectedItem(idx, 'up')}
                        className="p-1 rounded hover:bg-chip-hover text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        title="Subir"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === selectedItems.length - 1}
                        onClick={() => moveSelectedItem(idx, 'down')}
                        className="p-1 rounded hover:bg-chip-hover text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        title="Descer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1 rounded hover:bg-chip-hover text-ink-2 hover:text-rose-500 transition-colors shrink-0 cursor-pointer"
                    title="Remover"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface FolderLessonPickerManagerProps {
  selectedLabel: string;
  lessons: Lesson[];
  lessonFolders: LessonFolder[];
  selectedIds: string[];
  onChangeSelectedIds: (nextIds: string[]) => void;
  maxItems: number;
}

const FolderLessonPickerManager: React.FC<FolderLessonPickerManagerProps> = ({
  selectedLabel,
  lessons,
  lessonFolders,
  selectedIds,
  onChangeSelectedIds,
  maxItems,
}) => {
  const [isAddPopupOpen, setIsAddPopupOpen] = useState(false);
  const [popupFolderId, setPopupFolderId] = useState<string | null>(null);

  const selectedLessons = selectedIds
    .map((id) => lessons.find((l) => l.id === id))
    .filter((l): l is Lesson => Boolean(l));

  const validFolderIdSet = new Set(lessonFolders.map((f) => f.id));

  const getLessonsInFolder = (fId: string): Lesson[] => {
    if (fId === UNASSIGNED_FOLDER_ID) {
      return lessons.filter(
        (l) => !l.folderId || !validFolderIdSet.has(l.folderId)
      );
    }
    return lessons.filter((l) => l.folderId === fId);
  };

  const getAvailableLessonsInFolder = (fId: string): Lesson[] => {
    return getLessonsInFolder(fId).filter((l) => !selectedIds.includes(l.id));
  };

  const unassignedAvailable = getAvailableLessonsInFolder(UNASSIGNED_FOLDER_ID);

  const addLesson = (id: string) => {
    if (selectedIds.includes(id) || selectedIds.length >= maxItems) return;
    onChangeSelectedIds([...selectedIds, id]);
  };

  const removeLesson = (id: string) => {
    onChangeSelectedIds(selectedIds.filter((item) => item !== id));
  };

  const moveSelectedLesson = (index: number, direction: 'up' | 'down') => {
    const currentIds = selectedLessons.map((l) => l.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentIds.length) return;
    const nextIds = [...currentIds];
    const [moved] = nextIds.splice(index, 1);
    nextIds.splice(targetIndex, 0, moved);
    onChangeSelectedIds(nextIds);
  };

  const activePopupFolderName =
    popupFolderId === UNASSIGNED_FOLDER_ID
      ? 'Sem pasta'
      : lessonFolders.find((f) => f.id === popupFolderId)?.name || 'Pasta';

  const activePopupAvailableLessons = popupFolderId
    ? getAvailableLessonsInFolder(popupFolderId)
    : [];

  return (
    <div className="pt-3 border-t border-line space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-ink">
          {selectedLabel} ({selectedLessons.length})
        </span>

        <button
          type="button"
          onClick={() => {
            setPopupFolderId(null);
            setIsAddPopupOpen(true);
          }}
          className="px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Adicionar</span>
        </button>
      </div>

      {selectedLessons.length === 0 ? (
        <p className="text-xs text-ink-muted py-2">
          Nenhuma aula adicionada ainda. Clique em Adicionar para escolher aulas das pastas.
        </p>
      ) : (
        <div className="space-y-2">
          {selectedLessons.map((lesson, idx) => (
            <div
              key={lesson.id}
              className="flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl border text-xs bg-surface-2 border-brand/40 text-ink transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="font-mono tabular-nums text-brand-accent shrink-0">
                  {idx + 1}.
                </span>
                <span className="truncate font-medium">{lesson.title}</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {selectedLessons.length > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveSelectedLesson(idx, 'up')}
                      className="p-1 rounded-lg hover:bg-chip-hover text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      title="Subir aula"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === selectedLessons.length - 1}
                      onClick={() => moveSelectedLesson(idx, 'down')}
                      className="p-1 rounded-lg hover:bg-chip-hover text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      title="Descer aula"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeLesson(lesson.id)}
                  className="p-1 rounded-lg hover:bg-chip-hover text-ink-2 hover:text-rose-500 transition-colors shrink-0 cursor-pointer"
                  title="Remover da playlist"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isAddPopupOpen && (
        <div
          onClick={() => {
            setIsAddPopupOpen(false);
            setPopupFolderId(null);
          }}
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[82dvh] sm:rounded-2xl max-w-md bg-surface border-0 sm:border border-line shadow-pop overflow-hidden flex flex-col"
          >
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
              {popupFolderId === null ? (
                <h4 className="text-sm font-bold text-ink truncate">
                  Pastas de Aulas
                </h4>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setPopupFolderId(null)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent hover:text-ink transition-colors shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Pastas</span>
                  </button>
                  <span className="text-ink-faint">/</span>
                  <h4 className="text-sm font-bold text-ink truncate">
                    {activePopupFolderName}
                  </h4>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsAddPopupOpen(false);
                  setPopupFolderId(null);
                }}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {popupFolderId === null ? (
                lessonFolders.length === 0 && unassignedAvailable.length === 0 ? (
                  <p className="text-xs text-ink-muted text-center py-8">
                    Nenhuma pasta ou aula disponível para adicionar.
                  </p>
                ) : (
                  <>
                    {lessonFolders.map((folder) => {
                      const availableCount = getAvailableLessonsInFolder(
                        folder.id
                      ).length;
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => setPopupFolderId(folder.id)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-inset hover:bg-chip-hover border border-line hover:border-brand-soft/50 text-left transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Folder className="w-4 h-4 text-brand-soft shrink-0" />
                            <span className="text-xs font-bold text-ink truncate">
                              {folder.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono tabular-nums text-ink-muted">
                              {availableCount} disponíve{availableCount === 1 ? 'l' : 'is'}
                            </span>
                            <ChevronRight className="w-4 h-4 text-ink-muted" />
                          </div>
                        </button>
                      );
                    })}

                    {unassignedAvailable.length > 0 && (
                      <div className="pt-2 space-y-2">
                        {lessonFolders.length > 0 && (
                          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                            Aulas sem pasta
                          </p>
                        )}
                        {unassignedAvailable.map((lesson) => (
                          <button
                            key={lesson.id}
                            type="button"
                            onClick={() => addLesson(lesson.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-inset hover:bg-brand/15 border border-line hover:border-brand-soft/60 text-left transition-colors cursor-pointer"
                          >
                            <span className="text-xs font-medium text-ink truncate">
                              {lesson.title}
                            </span>
                            <Plus className="w-4 h-4 text-brand-accent shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )
              ) : activePopupAvailableLessons.length === 0 ? (
                <p className="text-xs text-ink-muted text-center py-8">
                  Nenhuma aula disponível para adicionar nesta pasta.
                </p>
              ) : (
                activePopupAvailableLessons.map((lesson) => (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => addLesson(lesson.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-inset hover:bg-brand/15 border border-line hover:border-brand-soft/60 text-left transition-colors cursor-pointer"
                  >
                    <span className="text-xs font-medium text-ink truncate">
                      {lesson.title}
                    </span>
                    <Plus className="w-4 h-4 text-brand-accent shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminStudioModal: React.FC<AdminWorkspaceProps> = ({
  lessons,
  lessonFolders,
  playlists,
  courses,
  turmas,
  students,
  simulados,
  simuladoSubmissions,
  platformConfig,
  onOpenNewLessonModal,
  onOpenEditLessonModal,
  onDeleteLesson,
  onSaveLessonFolder,
  onDeleteLessonFolder,
  onMoveLessonsToFolder,
  onSavePlaylist,
  onDeletePlaylist,
  onSaveCourse,
  onDeleteCourse,
  onSaveFreeModule,
  onSaveTurma,
  onDeleteTurma,
  onSaveStudent,
  onDeleteStudent,
  onSaveConfig,
  onOpenCalendar,
  onReorderLessonFolders,
  onReorderLessons,
  onReorderPlaylists,
  onReorderCourses,
  currentUserUid,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('lessons');
  const [isSaving, setIsSaving] = useState(false);

  // Lesson Folders Navigation, Selection & Transfer State
  const [selectedLessonFolderId, setSelectedLessonFolderId] = useState<
    string | null
  >(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [selectedMoveLessonIds, setSelectedMoveLessonIds] = useState<string[]>(
    []
  );
  const [moveModalLessonIds, setMoveModalLessonIds] = useState<string[]>([]);
  const [moveModalNewFolderName, setMoveModalNewFolderName] = useState('');
  const [isCreatingFolderInMoveModal, setIsCreatingFolderInMoveModal] =
    useState(false);

  const existingLessonIdSet = new Set(lessons.map((l) => l.id));
  const validFolderIdSet = new Set(lessonFolders.map((f) => f.id));
  const unassignedLessons = lessons.filter(
    (l) => !l.folderId || !validFolderIdSet.has(l.folderId)
  );
  const activeFolderLessons = selectedLessonFolderId
    ? lessons.filter((l) => l.folderId === selectedLessonFolderId)
    : [];

  const regularPlaylists = playlists
    .filter((p) => p.id !== FREE_PLAYLIST_ID)
    .map((p) => ({
      ...p,
      lessonIds: (p.lessonIds || []).filter((id) => existingLessonIdSet.has(id)),
    }));
  const existingPlaylistIdSet = new Set(regularPlaylists.map((p) => p.id));
  const regularCourses = courses
    .filter((c) => c.id !== FREE_COURSE_ID)
    .map((c) => ({
      ...c,
      playlistIds: (c.playlistIds || []).filter((id) =>
        existingPlaylistIdSet.has(id)
      ),
    }));
  const freeCourse = courses.find((c) => c.id === FREE_COURSE_ID);
  const freePlaylist = playlists.find((p) => p.id === FREE_PLAYLIST_ID);

  const moveItemByIndex = <T extends { id: string }>(
    list: T[],
    index: number,
    direction: 'up' | 'down',
    cb?: (orderedIds: string[]) => void | Promise<void>
  ) => {
    if (!cb) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    void cb(next.map((item) => item.id));
  };

  const resolvedFreeLessonIds = (
    freePlaylist
      ? freePlaylist.lessonIds || []
      : lessons.filter((l) => l.isFree).map((l) => l.id)
  ).filter((id) => existingLessonIdSet.has(id));

  // Playlist View State
  const [isPlaylistFormOpen, setIsPlaylistFormOpen] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [playlistTitleError, setPlaylistTitleError] = useState<string | null>(
    null
  );
  const playlistTitleRef = useRef<HTMLInputElement>(null);
  const [playlistCover, setPlaylistCover] = useState('preset:trophy');
  const [playlistLessonIds, setPlaylistLessonIds] = useState<string[]>([]);

  // Course View State
  const [isCourseFormOpen, setIsCourseFormOpen] = useState(false);
  const [isFreeModuleFormOpen, setIsFreeModuleFormOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseTitleError, setCourseTitleError] = useState<string | null>(null);
  const courseTitleRef = useRef<HTMLInputElement>(null);
  const [courseCover, setCourseCover] = useState('preset:stadium');
  const [coursePlaylistIds, setCoursePlaylistIds] = useState<string[]>([]);

  // Free Module Form State
  const [freeCover, setFreeCover] = useState(
    freeCourse?.coverUrl || 'preset:mastery'
  );
  const [freeLessonIds, setFreeLessonIds] = useState<string[]>(resolvedFreeLessonIds);
  const knownLessonIdsRef = useRef<Set<string>>(new Set(lessons.map((l) => l.id)));

  useEffect(() => {
    const currentIdSet = new Set(lessons.map((l) => l.id));
    const newlyCreatedFreeIds = lessons
      .filter((l) => l.isFree && !knownLessonIdsRef.current.has(l.id))
      .map((l) => l.id);

    knownLessonIdsRef.current = currentIdSet;

    setFreeLessonIds((prev) => {
      const validPrev = prev.filter((id) => currentIdSet.has(id));
      const toAdd = newlyCreatedFreeIds.filter((id) => !validPrev.includes(id));
      if (toAdd.length === 0 && validPrev.length === prev.length) {
        return prev;
      }
      return [...validPrev, ...toAdd];
    });
  }, [lessons]);

  // Turma Management State
  const [selectedTurmaId, setSelectedTurmaId] = useState<string | null>(null);
  const [isTurmaFormOpen, setIsTurmaFormOpen] = useState(false);
  const [editingTurmaId, setEditingTurmaId] = useState<string | null>(null);
  const [turmaName, setTurmaName] = useState('');
  const [turmaNameError, setTurmaNameError] = useState<string | null>(null);
  const turmaNameRef = useRef<HTMLInputElement>(null);
  const [turmaDescription, setTurmaDescription] = useState('');
  const [turmaAccessAll, setTurmaAccessAll] = useState(false);
  const [turmaCourseIds, setTurmaCourseIds] = useState<string[]>([]);

  // Popup to Transfer a Student to Another Turma
  const [transferringStudent, setTransferringStudent] =
    useState<Student | null>(null);
  const [transferTargetTurmaId, setTransferTargetTurmaId] =
    useState<string>('');

  // Student Filter by Turma in Alunos Tab
  const [studentTurmaFilter, setStudentTurmaFilter] = useState<string>('ALL');

  // Student Window State
  const [isStudentPopupOpen, setIsStudentPopupOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const studentEmailRef = useRef<HTMLInputElement>(null);
  const studentNameRef = useRef<HTMLInputElement>(null);
  const [studentCpf, setStudentCpf] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [studentBirthDate, setStudentBirthDate] = useState('');
  const [studentTurmaId, setStudentTurmaId] = useState('');
  const [studentAccessAll, setStudentAccessAll] = useState(false);
  const [studentCourseIds, setStudentCourseIds] = useState<string[]>([]);

  const knownPlatformEntries = React.useMemo(() => {
    const map = new Map<
      string,
      {
        email: string;
        name: string;
        cpf: string;
        phone: string;
        birthDate: string;
        turmaId: string;
        studentObj?: Student;
      }
    >();

    for (const stu of students) {
      const cleanEmail = (stu.email || '').trim().toLowerCase();
      if (!cleanEmail) continue;
      map.set(cleanEmail, {
        email: cleanEmail,
        name: stu.name || cleanEmail.split('@')[0] || 'Aluno',
        cpf: stu.cpf || '',
        phone: stu.phone || '',
        birthDate: stu.birthDate || '',
        turmaId: stu.turmaId || '',
        studentObj: stu,
      });
    }

    for (const sub of simuladoSubmissions) {
      const cleanEmail = (sub.userEmail || '').trim().toLowerCase();
      if (!cleanEmail || map.has(cleanEmail)) continue;
      map.set(cleanEmail, {
        email: cleanEmail,
        name: sub.userName || cleanEmail.split('@')[0] || 'Aluno',
        cpf: '',
        phone: '',
        birthDate: '',
        turmaId: '',
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.email.localeCompare(b.email)
    );
  }, [students, simuladoSubmissions]);

  // Student Edit & Course Liberation Popup State
  const [editingStudentCourses, setEditingStudentCourses] =
    useState<Student | null>(null);
  const [editStuName, setEditStuName] = useState('');
  const [editStuNameError, setEditStuNameError] = useState<string | null>(null);
  const editStuNameRef = useRef<HTMLInputElement>(null);
  const [editStuCpf, setEditStuCpf] = useState('');
  const [editStuPhone, setEditStuPhone] = useState('');
  const [editStuBirthDate, setEditStuBirthDate] = useState('');
  const [editStuTurmaId, setEditStuTurmaId] = useState('');
  const [editStuAccessAll, setEditStuAccessAll] = useState(false);
  const [editStuCourseIds, setEditStuCourseIds] = useState<string[]>([]);

  // Platform Config Window State
  const [brandName, setBrandName] = useState(platformConfig.brandName);
  const [heroTitle, setHeroTitle] = useState(platformConfig.heroTitle);
  const [heroSubtitle, setHeroSubtitle] = useState(platformConfig.heroSubtitle);
  const [heroCtaText, setHeroCtaText] = useState(platformConfig.heroCtaText);
  const [heroBgUrl, setHeroBgUrl] = useState(platformConfig.heroBgUrl || '');
  const [restrictToStudentList, setRestrictToStudentList] = useState(
    platformConfig.restrictToStudentList
  );

  useEffect(() => {
    setBrandName(platformConfig.brandName);
    setHeroTitle(platformConfig.heroTitle);
    setHeroSubtitle(platformConfig.heroSubtitle);
    setHeroCtaText(platformConfig.heroCtaText);
    setHeroBgUrl(platformConfig.heroBgUrl || '');
    setRestrictToStudentList(platformConfig.restrictToStudentList);
  }, [
    platformConfig.brandName,
    platformConfig.heroTitle,
    platformConfig.heroSubtitle,
    platformConfig.heroCtaText,
    platformConfig.heroBgUrl,
    platformConfig.restrictToStudentList,
  ]);

  // --- PLAYLIST HANDLERS ---
  const openNewPlaylistWindow = () => {
    setEditingPlaylistId(null);
    setPlaylistTitle('');
    setPlaylistTitleError(null);
    setPlaylistCover('preset:trophy');
    setPlaylistLessonIds([]);
    setIsPlaylistFormOpen(true);
  };

  const openEditPlaylistWindow = (p: Playlist) => {
    setEditingPlaylistId(p.id);
    setPlaylistTitle(p.title);
    setPlaylistTitleError(null);
    setPlaylistCover(p.coverUrl || 'preset:trophy');
    setPlaylistLessonIds(
      (p.lessonIds || []).filter((id) => existingLessonIdSet.has(id))
    );
    setIsPlaylistFormOpen(true);
  };

  const closePlaylistWindow = () => {
    setIsPlaylistFormOpen(false);
    setEditingPlaylistId(null);
    setPlaylistTitleError(null);
  };

  const handlePlaylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistTitle.trim()) {
      setPlaylistTitleError('Informe o nome da playlist.');
      playlistTitleRef.current?.focus();
      return;
    }
    setPlaylistTitleError(null);
    setIsSaving(true);
    try {
      const isNew = !editingPlaylistId;
      const id = editingPlaylistId || generateSafeId('playlist');
      const existingPl = playlists.find((x) => x.id === id);
      const validIds = playlistLessonIds
        .filter((lid) => existingLessonIdSet.has(lid))
        .slice(0, SCHEMA_LIMITS.MAX_LESSON_IDS);

      await onSavePlaylist(
        {
          id,
          title: sanitizeString(playlistTitle, SCHEMA_LIMITS.TITLE_MAX, 'Playlist'),
          description: existingPl?.description || '',
          coverUrl: sanitizeString(
            playlistCover.trim() || 'preset:trophy',
            SCHEMA_LIMITS.URL_MAX,
            'preset:trophy'
          ),
          lessonIds: validIds,
          ...(typeof existingPl?.order === 'number'
            ? { order: existingPl.order }
            : {}),
          isPublished: true,
          authorId: currentUserUid,
        },
        isNew
      );
      closePlaylistWindow();
    } finally {
      setIsSaving(false);
    }
  };

  // --- COURSE & AULAS GRÁTIS HANDLERS ---
  const openNewCourseWindow = () => {
    setEditingCourseId(null);
    setCourseTitle('');
    setCourseTitleError(null);
    setCourseCover('preset:stadium');
    setCoursePlaylistIds([]);
    setIsFreeModuleFormOpen(false);
    setIsCourseFormOpen(true);
  };

  const openEditCourseWindow = (c: Course) => {
    setEditingCourseId(c.id);
    setCourseTitle(c.title);
    setCourseTitleError(null);
    setCourseCover(c.coverUrl || 'preset:stadium');
    setCoursePlaylistIds(
      (c.playlistIds || []).filter((pid) => existingPlaylistIdSet.has(pid))
    );
    setIsFreeModuleFormOpen(false);
    setIsCourseFormOpen(true);
  };

  const openFreeModuleWindow = () => {
    setFreeCover(freeCourse?.coverUrl || 'preset:mastery');
    setFreeLessonIds(resolvedFreeLessonIds);
    setIsCourseFormOpen(false);
    setIsFreeModuleFormOpen(true);
  };

  const closeCourseWindow = () => {
    setIsCourseFormOpen(false);
    setIsFreeModuleFormOpen(false);
    setEditingCourseId(null);
    setCourseTitleError(null);
  };

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim()) {
      setCourseTitleError('Informe o nome do curso.');
      courseTitleRef.current?.focus();
      return;
    }
    setCourseTitleError(null);
    setIsSaving(true);
    try {
      const isNew = !editingCourseId;
      const id = editingCourseId || generateSafeId('course');
      const existingCourse = courses.find((x) => x.id === id);
      const validPlIds = coursePlaylistIds
        .filter((pid) => existingPlaylistIdSet.has(pid))
        .slice(0, SCHEMA_LIMITS.MAX_PLAYLIST_IDS);

      await onSaveCourse(
        {
          id,
          title: sanitizeString(courseTitle, SCHEMA_LIMITS.TITLE_MAX, 'Curso'),
          subtitle: existingCourse?.subtitle || '',
          description: existingCourse?.description || '',
          category: existingCourse?.category || 'Cursos',
          coverUrl: sanitizeString(
            courseCover.trim() || 'preset:stadium',
            SCHEMA_LIMITS.URL_MAX,
            'preset:stadium'
          ),
          bannerUrl: existingCourse?.bannerUrl || '',
          playlistIds: validPlIds,
          ...(typeof existingCourse?.order === 'number'
            ? { order: existingCourse.order }
            : {}),
          featured: existingCourse?.featured ?? true,
          isPublished: true,
          authorId: currentUserUid,
        },
        isNew
      );
      closeCourseWindow();
    } finally {
      setIsSaving(false);
    }
  };

  const handleFreeModuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const validIds = freeLessonIds
        .filter((lid) => existingLessonIdSet.has(lid))
        .slice(0, SCHEMA_LIMITS.MAX_LESSON_IDS);

      await onSaveFreeModule(
        sanitizeString(
          freeCover.trim() || 'preset:mastery',
          SCHEMA_LIMITS.URL_MAX,
          'preset:mastery'
        ),
        validIds
      );
      closeCourseWindow();
    } finally {
      setIsSaving(false);
    }
  };

  // --- TURMA HANDLERS ---
  const getStudentSimuladoCount = (stu: Student): number => {
    const cleanEmail = (stu.email || '').trim().toLowerCase();
    return simuladoSubmissions.filter(
      (sub) =>
        (sub.userEmail || '').trim().toLowerCase() === cleanEmail &&
        sub.status === 'completed'
    ).length;
  };

  const getStudentEffectiveCourses = (stu: Student): Course[] => {
    const stuTurma = stu.turmaId
      ? turmas.find((t) => t.id === stu.turmaId)
      : null;
    if (!stuTurma) return [];
    if (stuTurma.accessAll) return regularCourses;
    const turmaCourseIdSet = new Set(stuTurma.courseIds || []);
    return regularCourses.filter((c) => turmaCourseIdSet.has(c.id));
  };

  const openNewTurmaForm = () => {
    setEditingTurmaId(null);
    setTurmaName('');
    setTurmaNameError(null);
    setTurmaDescription('');
    setTurmaAccessAll(false);
    setTurmaCourseIds([]);
    setIsTurmaFormOpen(true);
  };

  const openEditTurmaForm = (turma: Turma) => {
    const validRegularIds = regularCourses.map((c) => c.id);
    const existingCourseIds = (turma.courseIds || []).filter((id) =>
      validRegularIds.includes(id)
    );
    setEditingTurmaId(turma.id);
    setTurmaName(turma.name);
    setTurmaNameError(null);
    setTurmaDescription(turma.description || '');
    setTurmaAccessAll(Boolean(turma.accessAll));
    setTurmaCourseIds(turma.accessAll ? validRegularIds : existingCourseIds);
    setIsTurmaFormOpen(true);
  };

  const closeTurmaForm = () => {
    setIsTurmaFormOpen(false);
    setEditingTurmaId(null);
    setTurmaNameError(null);
  };

  const handleTurmaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turmaName.trim()) {
      setTurmaNameError('Informe o nome da turma.');
      turmaNameRef.current?.focus();
      return;
    }
    setTurmaNameError(null);
    setIsSaving(true);
    try {
      const isNew = !editingTurmaId;
      const id = editingTurmaId || generateSafeId('turma');
      const validRegularIds = regularCourses.map((c) => c.id);
      const filteredIds = turmaCourseIds
        .filter((cid) => validRegularIds.includes(cid))
        .slice(0, 50);

      await onSaveTurma(
        {
          id,
          name: sanitizeString(turmaName, 120, 'Turma'),
          description: sanitizeString(turmaDescription, 500, ''),
          accessAll: Boolean(turmaAccessAll),
          courseIds: turmaAccessAll
            ? validRegularIds.slice(0, 50)
            : filteredIds,
          isPublished: true,
          authorId: currentUserUid,
        },
        isNew
      );
      closeTurmaForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignStudentToTurma = async (
    stu: Student,
    targetTurmaId: string
  ) => {
    setIsSaving(true);
    try {
      const targetTurma = targetTurmaId
        ? turmas.find((t) => t.id === targetTurmaId)
        : null;
      const validRegularIds = regularCourses.map((c) => c.id);
      const nextAccessAll = targetTurma ? Boolean(targetTurma.accessAll) : false;
      const nextCourseIds = targetTurma
        ? targetTurma.accessAll
          ? validRegularIds.slice(0, 50)
          : (targetTurma.courseIds || []).filter((id) =>
              validRegularIds.includes(id)
            )
        : [];
      const nextStatus: 'active' | 'blocked' =
        nextAccessAll || nextCourseIds.length > 0 ? 'active' : 'blocked';

      await onSaveStudent(
        {
          ...stu,
          turmaId: targetTurmaId,
          accessAll: nextAccessAll,
          courseIds: nextCourseIds,
          status: nextStatus,
          addedBy: stu.addedBy || currentUserUid,
        },
        false
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openTransferStudentModal = (stu: Student) => {
    setTransferringStudent(stu);
    setTransferTargetTurmaId(stu.turmaId || '');
  };

  const handleConfirmTransferStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferringStudent) return;
    await handleAssignStudentToTurma(
      transferringStudent,
      transferTargetTurmaId
    );
    setTransferringStudent(null);
  };

  // --- STUDENT HANDLERS ---
  const openNewStudentPopup = () => {
    setStudentSearchQuery('');
    setStudentName('');
    setStudentEmail('');
    setStudentFormError(null);
    setStudentCpf('');
    setStudentPhone('');
    setStudentBirthDate('');
    setStudentTurmaId('');
    setStudentAccessAll(false);
    setStudentCourseIds([]);
    setIsStudentPopupOpen(true);
  };

  const selectPlatformEntryForRegistration = (entry: {
    email: string;
    name: string;
    cpf: string;
    phone: string;
    birthDate: string;
    turmaId: string;
  }) => {
    setStudentEmail(entry.email);
    setStudentName(entry.name || entry.email.split('@')[0] || 'Aluno');
    setStudentFormError(null);
    setStudentCpf(entry.cpf || '');
    setStudentPhone(entry.phone || '');
    setStudentBirthDate(entry.birthDate || '');
    const nextTurmaId = studentTurmaId || entry.turmaId || '';
    setStudentTurmaId(nextTurmaId);
    const chosenTurma = turmas.find((t) => t.id === nextTurmaId);
    if (chosenTurma) {
      const validRegularIds = regularCourses.map((c) => c.id);
      const isAll = Boolean(chosenTurma.accessAll);
      setStudentAccessAll(isAll);
      setStudentCourseIds(
        isAll
          ? validRegularIds
          : (chosenTurma.courseIds || []).filter((id) =>
              validRegularIds.includes(id)
            )
      );
    } else {
      setStudentAccessAll(false);
      setStudentCourseIds([]);
    }
  };

  const openEditStudentCoursesPopup = (stu: Student) => {
    const validRegularIds = regularCourses.map((c) => c.id);
    const stuTurma = stu.turmaId
      ? turmas.find((t) => t.id === stu.turmaId)
      : null;
    const rawIds = stuTurma ? stuTurma.courseIds || [] : [];
    const existingIds = rawIds.filter((id) => validRegularIds.includes(id));
    const isAll = Boolean(stuTurma && stuTurma.accessAll);
    setEditingStudentCourses(stu);
    setEditStuName(stu.name || '');
    setEditStuNameError(null);
    setEditStuCpf(stu.cpf || '');
    setEditStuPhone(stu.phone || '');
    setEditStuBirthDate(formatBirthDateDisplay(stu.birthDate));
    setEditStuTurmaId(stuTurma ? stuTurma.id : '');
    setEditStuAccessAll(isAll);
    setEditStuCourseIds(isAll ? validRegularIds : existingIds);
  };

  const handleSaveStudentCourses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudentCourses) return;
    if (!editStuName.trim()) {
      setEditStuNameError('Informe o nome do aluno.');
      editStuNameRef.current?.focus();
      return;
    }
    setEditStuNameError(null);
    setIsSaving(true);
    try {
      const validRegularIds = regularCourses.map((c) => c.id);
      const chosenTurma = editStuTurmaId
        ? turmas.find((t) => t.id === editStuTurmaId)
        : null;
      const nextAccessAll = chosenTurma
        ? Boolean(chosenTurma.accessAll)
        : false;
      const nextCourseIds = chosenTurma
        ? chosenTurma.accessAll
          ? validRegularIds.slice(0, 50)
          : (chosenTurma.courseIds || [])
              .filter((id) => validRegularIds.includes(id))
              .slice(0, 50)
        : [];
      const hasAnyLiberated = Boolean(
        chosenTurma && (nextAccessAll || nextCourseIds.length > 0)
      );
      await onSaveStudent(
        {
          ...editingStudentCourses,
          name: sanitizeString(
            editStuName || editingStudentCourses.name,
            120,
            'Aluno'
          ),
          cpf: sanitizeString(editStuCpf.trim(), 30),
          phone: sanitizeString(editStuPhone.trim(), 40),
          birthDate: sanitizeString(editStuBirthDate.trim(), 30),
          turmaId: chosenTurma ? chosenTurma.id : '',
          status: hasAnyLiberated ? 'active' : 'blocked',
          accessAll: nextAccessAll,
          courseIds: nextCourseIds,
          addedBy: editingStudentCourses.addedBy || currentUserUid,
        },
        false
      );
      setEditingStudentCourses(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = studentEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setStudentFormError('Informe um e-mail Google válido.');
      studentEmailRef.current?.focus();
      return;
    }
    if (!studentName.trim()) {
      setStudentFormError('Informe o nome do aluno.');
      studentNameRef.current?.focus();
      return;
    }
    setStudentFormError(null);
    setIsSaving(true);
    try {
      const docId = emailToStudentDocId(cleanEmail);
      const existingStu = students.find((s) => s.id === docId);
      const validRegularIds = regularCourses.map((c) => c.id);
      const chosenTurma = studentTurmaId
        ? turmas.find((t) => t.id === studentTurmaId)
        : null;
      const nextAccessAll = chosenTurma
        ? Boolean(chosenTurma.accessAll)
        : false;
      const nextCourseIds = chosenTurma
        ? chosenTurma.accessAll
          ? validRegularIds.slice(0, 50)
          : (chosenTurma.courseIds || [])
              .filter((id) => validRegularIds.includes(id))
              .slice(0, 50)
        : [];
      const hasAnyLiberated = Boolean(
        chosenTurma && (nextAccessAll || nextCourseIds.length > 0)
      );
      await onSaveStudent(
        {
          id: docId,
          name: sanitizeString(studentName, 120, 'Aluno'),
          email: sanitizeString(cleanEmail, 180),
          cpf: sanitizeString(studentCpf.trim() || existingStu?.cpf || '', 30),
          phone: sanitizeString(
            studentPhone.trim() || existingStu?.phone || '',
            40
          ),
          birthDate: sanitizeString(
            studentBirthDate.trim() || existingStu?.birthDate || '',
            30
          ),
          turmaId: chosenTurma ? chosenTurma.id : '',
          status: hasAnyLiberated ? 'active' : 'blocked',
          courseIds: nextCourseIds,
          accessAll: nextAccessAll,
          addedBy: currentUserUid,
        },
        !existingStu
      );
      setStudentName('');
      setStudentEmail('');
      setStudentCpf('');
      setStudentPhone('');
      setStudentBirthDate('');
      setStudentTurmaId('');
      setStudentAccessAll(false);
      setStudentCourseIds([]);
      setIsStudentPopupOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  // --- CONFIG HANDLER ---
  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig({
        brandName: sanitizeString(brandName, 60, 'CURSO VÉRTICE'),
        heroTitle: sanitizeString(
          heroTitle,
          140,
          'Sua plataforma de cursos para Enem e vestibulares'
        ),
        heroSubtitle: sanitizeString(
          heroSubtitle,
          240,
          'Especialista em física, química e matemática'
        ),
        heroCtaText: sanitizeString(heroCtaText, 60, 'Confira agora!'),
        heroBgUrl: sanitizeString(heroBgUrl, SCHEMA_LIMITS.URL_MAX, ''),
        restrictToStudentList: Boolean(restrictToStudentList),
        updatedBy: currentUserUid,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- MIGRATION HANDLERS (A4.1, A4.2 & Fase 1.6 Image Optimization) ---
  const [migratingKeys, setMigratingKeys] = useState(false);
  const [migrationKeysMsg, setMigrationKeysMsg] = useState<string | null>(null);
  const [migratingPdfs, setMigratingPdfs] = useState(false);
  const [migrationPdfsMsg, setMigrationPdfsMsg] = useState<string | null>(null);
  const [optimizingImages, setOptimizingImages] = useState(false);
  const [optimizeImagesMsg, setOptimizeImagesMsg] = useState<string | null>(
    null
  );

  const simuladosWithInlineKey = simulados.filter((s) => Boolean(s.answerKey));

  const handleMigrateGabaritos = async () => {
    if (migratingKeys) return;
    setMigratingKeys(true);
    setMigrationKeysMsg(null);
    try {
      let count = 0;
      for (const sim of simulados) {
        if (!sim.answerKey) continue;
        const keyRef = doc(db, 'simuladoKeys', sim.id);
        const existingKeySnap = await getDoc(keyRef).catch(() => null);
        const existingKeyData = existingKeySnap?.exists()
          ? existingKeySnap.data()
          : null;

        await setDoc(keyRef, {
          answerKey: sim.answerKey.replace(/[^ABCDE]/g, 'A'),
          authorId: existingKeyData?.authorId || sim.authorId || currentUserUid,
          createdAt:
            existingKeyData?.createdAt || sim.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const simRef = doc(db, 'simulados', sim.id);
        await setDoc(simRef, {
          title: sim.title,
          area: sim.area,
          questionCount: sim.questionCount,
          timeLimitMinutes: sim.timeLimitMinutes || 0,
          pdfUrl: sim.pdfUrl || '',
          pdfTitle: sim.pdfTitle || '',
          resultsReleased: Boolean(sim.resultsReleased),
          isPublished: true,
          authorId: sim.authorId || currentUserUid,
          createdAt: sim.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        count++;
      }
      setMigrationKeysMsg(
        `Sucesso: ${count} gabarito(s) migrado(s) para a coleção simuladoKeys!`
      );
    } catch (err) {
      console.error('Erro ao migrar gabaritos:', err);
      setMigrationKeysMsg('Erro durante a migração de gabaritos. Veja o console.');
    } finally {
      setMigratingKeys(false);
    }
  };

  const handleMigrateFreePdfs = async () => {
    if (migratingPdfs) return;
    setMigratingPdfs(true);
    setMigrationPdfsMsg(null);
    try {
      const freeLessons = lessons.filter((l) => l.isFree);
      let pdfCount = 0;
      for (const lesson of freeLessons) {
        if (!lesson.pdfs) continue;
        for (const pdf of lesson.pdfs) {
          if (pdf.url && pdf.url.startsWith('chunked:')) {
            await updatePdfChunksIsFree(pdf.url, true);
            pdfCount++;
          }
        }
      }
      setMigrationPdfsMsg(
        `Sucesso: partes de ${pdfCount} PDF(s) de aulas grátis marcadas com isFree: true!`
      );
    } catch (err) {
      console.error('Erro ao marcar PDFs grátis:', err);
      setMigrationPdfsMsg('Erro durante a atualização dos PDFs grátis.');
    } finally {
      setMigratingPdfs(false);
    }
  };

  const handleOptimizeExistingImages = async () => {
    if (optimizingImages) return;
    setOptimizingImages(true);
    setOptimizeImagesMsg(null);
    const MIN_BYTES = 150 * 1024;
    let optimizedCount = 0;
    let savedBytes = 0;

    try {
      // 1. Courses (coverUrl -> 900, bannerUrl -> 1920)
      for (const course of courses) {
        let nextCover = course.coverUrl || '';
        let nextBanner = course.bannerUrl || '';
        let changed = false;

        if (nextCover.startsWith('data:image/') && nextCover.length > MIN_BYTES) {
          const compressed = await recompressDataUrlImage(nextCover, 900, 0.85);
          if (compressed.length < nextCover.length) {
            savedBytes += nextCover.length - compressed.length;
            nextCover = compressed;
            changed = true;
            optimizedCount++;
          }
        }

        if (
          nextBanner.startsWith('data:image/') &&
          nextBanner.length > MIN_BYTES
        ) {
          const compressed = await recompressDataUrlImage(
            nextBanner,
            1920,
            0.82
          );
          if (compressed.length < nextBanner.length) {
            savedBytes += nextBanner.length - compressed.length;
            nextBanner = compressed;
            changed = true;
            optimizedCount++;
          }
        }

        if (changed) {
          await setDoc(doc(db, 'courses', course.id), {
            title: course.title,
            subtitle: course.subtitle || '',
            description: course.description || '',
            category: course.category || 'Cursos',
            coverUrl: nextCover,
            bannerUrl: nextBanner,
            playlistIds: course.playlistIds || [],
            featured: Boolean(course.featured),
            isPublished: true,
            authorId: course.authorId || currentUserUid,
            createdAt: course.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      // 2. Playlists (coverUrl -> 900)
      for (const pl of playlists) {
        const origCover = pl.coverUrl || '';
        if (origCover.startsWith('data:image/') && origCover.length > MIN_BYTES) {
          const compressed = await recompressDataUrlImage(origCover, 900, 0.85);
          if (compressed.length < origCover.length) {
            savedBytes += origCover.length - compressed.length;
            optimizedCount++;
            await setDoc(doc(db, 'playlists', pl.id), {
              title: pl.title,
              description: pl.description || '',
              coverUrl: compressed,
              lessonIds: pl.lessonIds || [],
              isPublished: true,
              authorId: pl.authorId || currentUserUid,
              createdAt: pl.createdAt || serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      // 3. Lessons (thumbnailUrl -> 720)
      for (const lesson of lessons) {
        const origThumb = lesson.thumbnailUrl || '';
        if (origThumb.startsWith('data:image/') && origThumb.length > MIN_BYTES) {
          const compressed = await recompressDataUrlImage(origThumb, 720, 0.85);
          if (compressed.length < origThumb.length) {
            savedBytes += origThumb.length - compressed.length;
            optimizedCount++;
            await setDoc(doc(db, 'lessons', lesson.id), {
              title: lesson.title,
              description: lesson.description || '',
              youtubeId: lesson.youtubeId,
              duration: lesson.duration || '15:00',
              thumbnailUrl: compressed,
              pdfs: lesson.pdfs || [],
              folderId: lesson.folderId || '',
              isFree: Boolean(lesson.isFree),
              isPublished: true,
              authorId: lesson.authorId || currentUserUid,
              createdAt: lesson.createdAt || serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      // 4. Platform Config (heroBgUrl -> 1920)
      const origHero = platformConfig.heroBgUrl || '';
      if (origHero.startsWith('data:image/') && origHero.length > MIN_BYTES) {
        const compressed = await recompressDataUrlImage(origHero, 1920, 0.82);
        if (compressed.length < origHero.length) {
          savedBytes += origHero.length - compressed.length;
          optimizedCount++;
          setHeroBgUrl(compressed);
          await onSaveConfig({
            brandName: sanitizeString(brandName, 60, 'CURSO VÉRTICE'),
            heroTitle: sanitizeString(
              heroTitle,
              140,
              'Sua plataforma de cursos para Enem e vestibulares'
            ),
            heroSubtitle: sanitizeString(
              heroSubtitle,
              240,
              'Especialista em física, química e matemática'
            ),
            heroCtaText: sanitizeString(heroCtaText, 60, 'Confira agora!'),
            heroBgUrl: compressed,
            restrictToStudentList: Boolean(restrictToStudentList),
            updatedBy: currentUserUid,
          });
        }
      }

      const savedKb = Math.max(0, Math.round(savedBytes / 1024));
      if (optimizedCount === 0) {
        setOptimizeImagesMsg(
          'Todas as imagens já estão otimizadas (nenhuma acima de 150 KB precisou de redução).'
        );
      } else {
        setOptimizeImagesMsg(
          `Sucesso: ${optimizedCount} imagem(ns) otimizada(s), economizando ${savedKb} KB!`
        );
      }
    } catch (err) {
      console.error('Erro ao otimizar imagens:', err);
      setOptimizeImagesMsg('Erro ao otimizar imagens. Veja o console.');
    } finally {
      setOptimizingImages(false);
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-5 md:px-10 py-6 pb-24 sm:pb-6 space-y-6">
      {/* Minimalist Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-line">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('lessons');
              setSelectedLessonFolderId(null);
              setIsCreatingFolder(false);
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'lessons'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-line text-ink-muted hover:text-ink'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            Aulas ({lessons.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('playlists');
              setIsPlaylistFormOpen(false);
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'playlists'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-line text-ink-muted hover:text-ink'
            }`}
          >
            <ListVideo className="w-3.5 h-3.5" />
            Playlists ({regularPlaylists.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('courses');
              setIsCourseFormOpen(false);
              setIsFreeModuleFormOpen(false);
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'courses'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-line text-ink-muted hover:text-ink'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Cursos ({regularCourses.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('turmas');
              setIsTurmaFormOpen(false);
              setSelectedTurmaId(null);
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'turmas'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-line text-ink-muted hover:text-ink'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Turmas ({turmas.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'students'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-line text-ink-muted hover:text-ink'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Alunos ({students.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mentoria')}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'mentoria'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-line text-ink-muted hover:text-ink'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Mentoria
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'config'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-line text-ink-muted hover:text-ink'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Fundo & Marca
          </button>

          {onOpenCalendar && (
            <button
              type="button"
              onClick={onOpenCalendar}
              className="px-3.5 py-2 rounded-full bg-brand/15 hover:bg-brand border border-brand-soft/50 text-brand-accent hover:text-white text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 shadow-glow-sm cursor-pointer"
              title="Abrir Calendário do Curso"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendário</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: AULAS */}
      {activeTab === 'lessons' && (
        <div className="space-y-6">
          {selectedLessonFolderId === null ? (
            <>
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-ink">Pastas</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingFolder(true);
                        setNewFolderName('');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-chip hover:bg-chip-hover border border-line text-ink text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4 text-brand-accent" />
                      Nova Pasta
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenNewLessonModal(false, '')}
                      className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Criar Aula
                    </button>
                  </div>
                </div>

                {isCreatingFolder && (
                  <form
                    noValidate
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newFolderName.trim() || isSaving) return;
                      setIsSaving(true);
                      try {
                        const folderId = generateSafeId('folder');
                        await onSaveLessonFolder(
                          {
                            id: folderId,
                            name: sanitizeString(newFolderName, 120, 'Pasta'),
                            isPublished: true,
                            authorId: currentUserUid,
                          },
                          true
                        );
                        setNewFolderName('');
                        setIsCreatingFolder(false);
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 pt-1"
                  >
                    <input
                      type="text"
                      autoFocus
                      maxLength={120}
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Digite o nome da pasta"
                      className="flex-1 min-w-[200px] px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Criar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingFolder(false);
                          setNewFolderName('');
                        }}
                        className="px-3.5 py-2.5 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}

                {lessonFolders.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {lessonFolders.map((folder, idx) => {
                      const folderLessonCount = lessons.filter(
                        (l) => l.folderId === folder.id
                      ).length;
                      const isEditingThis = editingFolderId === folder.id;

                      if (isEditingThis) {
                        return (
                          <form
                            key={folder.id}
                            noValidate
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!editingFolderName.trim() || isSaving) return;
                              setIsSaving(true);
                              try {
                                await onSaveLessonFolder(
                                  {
                                    id: folder.id,
                                    name: sanitizeString(
                                      editingFolderName,
                                      120,
                                      folder.name
                                    ),
                                    ...(typeof folder.order === 'number'
                                      ? { order: folder.order }
                                      : {}),
                                    isPublished: true,
                                    authorId: folder.authorId || currentUserUid,
                                  },
                                  false
                                );
                                setEditingFolderId(null);
                                setEditingFolderName('');
                              } finally {
                                setIsSaving(false);
                              }
                            }}
                            className="flex items-center gap-2 p-3.5 rounded-2xl bg-surface border border-brand-soft"
                          >
                            <input
                              type="text"
                              autoFocus
                              maxLength={120}
                              value={editingFolderName}
                              onChange={(e) =>
                                setEditingFolderName(e.target.value)
                              }
                              className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-inset border border-line text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                            />
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-bold shrink-0 cursor-pointer"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolderId(null);
                                setEditingFolderName('');
                              }}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-ink shrink-0 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </form>
                        );
                      }

                      return (
                        <div
                          key={folder.id}
                          onClick={() => {
                            setSelectedLessonFolderId(folder.id);
                            setSelectedMoveLessonIds([]);
                          }}
                          className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-line hover:border-brand-soft/60 shadow-card transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand-accent flex items-center justify-center shrink-0">
                              <Folder className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-ink truncate">
                                {folder.name}
                              </h3>
                              <p className="text-xs text-ink-muted font-mono tabular-nums mt-0.5">
                                {folderLessonCount} aula
                                {folderLessonCount !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {lessonFolders.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() =>
                                    moveItemByIndex(
                                      lessonFolders,
                                      idx,
                                      'up',
                                      onReorderLessonFolders
                                    )
                                  }
                                  className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                  title="Subir pasta"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === lessonFolders.length - 1}
                                  onClick={() =>
                                    moveItemByIndex(
                                      lessonFolders,
                                      idx,
                                      'down',
                                      onReorderLessonFolders
                                    )
                                  }
                                  className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                  title="Descer pasta"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}
                              className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                              title="Renomear pasta"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteLessonFolder(folder.id)}
                              className="p-2 rounded-lg text-ink-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Excluir pasta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {(() => {
                const unassignedIds = unassignedLessons.map((l) => l.id);
                const selectedUnassignedIds = selectedMoveLessonIds.filter(
                  (id) => unassignedIds.includes(id)
                );
                const allUnassignedSelected =
                  unassignedIds.length > 0 &&
                  selectedUnassignedIds.length === unassignedIds.length;

                return (
                  <div className="space-y-3.5">
                    {unassignedLessons.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-bold text-ink">
                            {lessonFolders.length > 0
                              ? `Aulas sem pasta (${unassignedLessons.length})`
                              : `Aulas (${unassignedLessons.length})`}
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              if (allUnassignedSelected) {
                                setSelectedMoveLessonIds([]);
                              } else {
                                setSelectedMoveLessonIds(unassignedIds);
                              }
                            }}
                            className="text-xs font-semibold text-brand-accent hover:text-ink transition-colors cursor-pointer"
                          >
                            {allUnassignedSelected
                              ? 'Desmarcar todas'
                              : 'Selecionar todas'}
                          </button>
                        </div>

                        {selectedUnassignedIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setMoveModalLessonIds(selectedUnassignedIds);
                              setIsCreatingFolderInMoveModal(false);
                              setMoveModalNewFolderName('');
                            }}
                            className="px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer shadow-glow-sm"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>
                              Transferir para pasta ({selectedUnassignedIds.length})
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {unassignedLessons.length === 0 &&
                    lessonFolders.length === 0 ? (
                      <p className="text-xs text-ink-muted py-6">
                        Nenhuma pasta ou aula criada ainda. Clique em Nova Pasta ou Criar Aula acima.
                      </p>
                    ) : (
                      unassignedLessons.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {unassignedLessons.map((lesson, idx) => {
                            const isSelected = selectedMoveLessonIds.includes(
                              lesson.id
                            );
                            return (
                              <div
                                key={lesson.id}
                                onClick={() => {
                                  setSelectedMoveLessonIds((prev) =>
                                    prev.includes(lesson.id)
                                      ? prev.filter((id) => id !== lesson.id)
                                      : [...prev, lesson.id]
                                  );
                                }}
                                className={`cv-auto-row flex items-center gap-3 p-3.5 rounded-2xl border shadow-card transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-surface-2 border-brand-soft'
                                    : 'bg-surface border-line hover:border-line-strong'
                                }`}
                              >
                                <div
                                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected
                                      ? 'bg-brand border-brand text-white'
                                      : 'border-line-strong bg-inset text-transparent'
                                  }`}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </div>

                                <div className="w-12 aspect-[3/4] rounded-xl overflow-hidden shrink-0 border border-line">
                                  <CoverArtwork
                                    src={lesson.thumbnailUrl}
                                    title={lesson.title}
                                    className="w-full h-full"
                                    showBottomPurpleBar={true}
                                  />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-bold text-ink truncate">
                                    {lesson.title}
                                  </h3>
                                  {lesson.pdfs?.length > 0 && (
                                    <p className="text-xs text-ink-muted mt-0.5 font-mono tabular-nums">
                                      {lesson.pdfs.length} PDF
                                      {lesson.pdfs.length > 1 ? 's' : ''}
                                    </p>
                                  )}
                                </div>

                                <div
                                  className="flex items-center gap-1 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {unassignedLessons.length > 1 && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() =>
                                          moveItemByIndex(
                                            unassignedLessons,
                                            idx,
                                            'up',
                                            onReorderLessons
                                          )
                                        }
                                        className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                        title="Subir aula"
                                      >
                                        <ArrowUp className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          idx === unassignedLessons.length - 1
                                        }
                                        onClick={() =>
                                          moveItemByIndex(
                                            unassignedLessons,
                                            idx,
                                            'down',
                                            onReorderLessons
                                          )
                                        }
                                        className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                        title="Descer aula"
                                      >
                                        <ArrowDown className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMoveModalLessonIds([lesson.id]);
                                      setIsCreatingFolderInMoveModal(false);
                                      setMoveModalNewFolderName('');
                                    }}
                                    className="p-2 rounded-lg text-brand-accent hover:text-ink hover:bg-brand/15 transition-colors cursor-pointer"
                                    title="Transferir para uma pasta"
                                  >
                                    <ArrowRightLeft className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenEditLessonModal(lesson)}
                                    className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                                    title="Editar aula"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteLesson(lesson.id)}
                                    className="p-2 rounded-lg text-ink-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                    title="Excluir aula"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            (() => {
              const currentFolder =
                lessonFolders.find((f) => f.id === selectedLessonFolderId) ||
                null;
              const folderLessons = lessons.filter(
                (l) => l.folderId === selectedLessonFolderId
              );
              const folderLessonIds = folderLessons.map((l) => l.id);
              const selectedInFolderIds = selectedMoveLessonIds.filter((id) =>
                folderLessonIds.includes(id)
              );
              const allInFolderSelected =
                folderLessonIds.length > 0 &&
                selectedInFolderIds.length === folderLessonIds.length;
              const folderDisplayName = currentFolder?.name || 'Pasta';

              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLessonFolderId(null);
                          setSelectedMoveLessonIds([]);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink cursor-pointer shrink-0"
                      >
                        <ArrowLeft className="w-4 h-4 text-brand-soft" />
                        <span>Voltar</span>
                      </button>
                      <span className="text-ink-faint">/</span>
                      <h2 className="text-base font-bold text-ink truncate">
                        {folderDisplayName}
                      </h2>

                      {folderLessons.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (allInFolderSelected) {
                              setSelectedMoveLessonIds([]);
                            } else {
                              setSelectedMoveLessonIds(folderLessonIds);
                            }
                          }}
                          className="text-xs font-semibold text-brand-accent hover:text-ink transition-colors cursor-pointer ml-1 shrink-0"
                        >
                          {allInFolderSelected
                            ? 'Desmarcar todas'
                            : 'Selecionar todas'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedInFolderIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setMoveModalLessonIds(selectedInFolderIds);
                            setIsCreatingFolderInMoveModal(false);
                            setMoveModalNewFolderName('');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-chip hover:bg-chip-hover border border-line text-ink text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-brand-accent" />
                          <span>
                            Trocar de pasta ({selectedInFolderIds.length})
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          onOpenNewLessonModal(false, selectedLessonFolderId)
                        }
                        className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Criar Aula
                      </button>
                    </div>
                  </div>

                  {folderLessons.length === 0 ? (
                    <p className="text-xs text-ink-muted py-8">
                      Nenhuma aula nesta pasta ainda. Clique em Criar Aula acima para adicionar.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {folderLessons.map((lesson, idx) => {
                        const isSelected = selectedMoveLessonIds.includes(
                          lesson.id
                        );
                        return (
                          <div
                            key={lesson.id}
                            onClick={() => {
                              setSelectedMoveLessonIds((prev) =>
                                prev.includes(lesson.id)
                                  ? prev.filter((id) => id !== lesson.id)
                                  : [...prev, lesson.id]
                              );
                            }}
                            className={`cv-auto-row flex items-center gap-3 p-3.5 rounded-2xl border shadow-card transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-surface-2 border-brand-soft'
                                : 'bg-surface border-line hover:border-line-strong'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? 'bg-brand border-brand text-white'
                                  : 'border-line-strong bg-inset text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </div>

                            <div className="w-12 aspect-[3/4] rounded-xl overflow-hidden shrink-0 border border-line">
                              <CoverArtwork
                                src={lesson.thumbnailUrl}
                                title={lesson.title}
                                className="w-full h-full"
                                showBottomPurpleBar={true}
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-ink truncate">
                                {lesson.title}
                              </h3>
                              {lesson.pdfs?.length > 0 && (
                                <p className="text-xs text-ink-muted mt-0.5 font-mono tabular-nums">
                                  {lesson.pdfs.length} PDF
                                  {lesson.pdfs.length > 1 ? 's' : ''}
                                </p>
                              )}
                            </div>

                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {folderLessons.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() =>
                                      moveItemByIndex(
                                        folderLessons,
                                        idx,
                                        'up',
                                        onReorderLessons
                                      )
                                    }
                                    className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                    title="Subir aula"
                                  >
                                    <ArrowUp className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === folderLessons.length - 1}
                                    onClick={() =>
                                      moveItemByIndex(
                                        folderLessons,
                                        idx,
                                        'down',
                                        onReorderLessons
                                      )
                                    }
                                    className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                                    title="Descer aula"
                                  >
                                    <ArrowDown className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setMoveModalLessonIds([lesson.id]);
                                  setIsCreatingFolderInMoveModal(false);
                                  setMoveModalNewFolderName('');
                                }}
                                className="p-2 rounded-lg text-brand-accent hover:text-ink hover:bg-brand/15 transition-colors cursor-pointer"
                                title="Trocar de pasta"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenEditLessonModal(lesson)}
                                className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                                title="Editar aula"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteLesson(lesson.id)}
                                className="p-2 rounded-lg text-ink-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Excluir aula"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()
          )}

          {moveModalLessonIds.length > 0 && (
            <div
              onClick={() => setMoveModalLessonIds([])}
              className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[82dvh] sm:rounded-2xl max-w-md bg-surface border-0 sm:border border-line shadow-pop overflow-hidden flex flex-col"
              >
                <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-ink">
                      {moveModalLessonIds.length === 1
                        ? 'Transferir aula para pasta'
                        : `Transferir ${moveModalLessonIds.length} aulas para pasta`}
                    </h4>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMoveModalLessonIds([])}
                    className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 overflow-y-auto space-y-2 flex-1">
                  {lessonFolders.map((folder) => {
                    const isCurrentFolder =
                      selectedLessonFolderId === folder.id;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        disabled={isSaving || isCurrentFolder}
                        onClick={async () => {
                          if (isSaving) return;
                          setIsSaving(true);
                          try {
                            await onMoveLessonsToFolder(
                              moveModalLessonIds,
                              folder.id
                            );
                            setSelectedMoveLessonIds((prev) =>
                              prev.filter(
                                (id) => !moveModalLessonIds.includes(id)
                              )
                            );
                            setMoveModalLessonIds([]);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                          isCurrentFolder
                            ? 'bg-chip border-line-soft text-ink-muted cursor-default'
                            : 'bg-inset hover:bg-brand/15 border-line hover:border-brand-soft/60 text-ink cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Folder className="w-4 h-4 text-brand-soft shrink-0" />
                          <span className="text-xs font-bold truncate">
                            {folder.name}
                          </span>
                        </div>
                        {isCurrentFolder ? (
                          <span className="text-[11px] text-ink-muted">
                            Pasta atual
                          </span>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-brand-accent shrink-0" />
                        )}
                      </button>
                    );
                  })}

                  {selectedLessonFolderId !== null && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={async () => {
                        if (isSaving) return;
                        setIsSaving(true);
                        try {
                          await onMoveLessonsToFolder(moveModalLessonIds, '');
                          setSelectedMoveLessonIds((prev) =>
                            prev.filter(
                              (id) => !moveModalLessonIds.includes(id)
                            )
                          );
                          setMoveModalLessonIds([]);
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-inset hover:bg-chip-hover border border-line text-left text-ink-2 transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-semibold truncate">
                        Deixar sem pasta (na tela de Aulas)
                      </span>
                      <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />
                    </button>
                  )}

                  {!isCreatingFolderInMoveModal ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingFolderInMoveModal(true);
                        setMoveModalNewFolderName('');
                      }}
                      className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-chip hover:bg-chip-hover border border-dashed border-line-strong text-xs font-bold text-brand-accent hover:text-ink transition-colors cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4" />
                      <span>Criar nova pasta e mover para cá</span>
                    </button>
                  ) : (
                    <form
                      noValidate
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!moveModalNewFolderName.trim() || isSaving) return;
                        setIsSaving(true);
                        try {
                          const newFolderId = generateSafeId('folder');
                          await onSaveLessonFolder(
                            {
                              id: newFolderId,
                              name: sanitizeString(
                                moveModalNewFolderName,
                                120,
                                'Pasta'
                              ),
                              isPublished: true,
                              authorId: currentUserUid,
                            },
                            true
                          );
                          await onMoveLessonsToFolder(
                            moveModalLessonIds,
                            newFolderId
                          );
                          setSelectedMoveLessonIds((prev) =>
                            prev.filter(
                              (id) => !moveModalLessonIds.includes(id)
                            )
                          );
                          setMoveModalLessonIds([]);
                          setIsCreatingFolderInMoveModal(false);
                          setMoveModalNewFolderName('');
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      className="pt-2 space-y-2"
                    >
                      <input
                        type="text"
                        autoFocus
                        maxLength={120}
                        value={moveModalNewFolderName}
                        onChange={(e) =>
                          setMoveModalNewFolderName(e.target.value)
                        }
                        placeholder="Nome da nova pasta"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsCreatingFolderInMoveModal(false)}
                          className="px-3 py-1.5 rounded-lg bg-chip text-ink-2 text-xs font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="px-3.5 py-1.5 rounded-lg bg-brand text-white text-xs font-bold cursor-pointer"
                        >
                          Criar e Mover
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PLAYLISTS */}
      {activeTab === 'playlists' && (
        <div className="space-y-4">
          {!isPlaylistFormOpen ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-bold text-ink">Playlists</h2>
                <button
                  type="button"
                  onClick={openNewPlaylistWindow}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Nova Playlist
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {regularPlaylists.map((pl, idx) => (
                  <div
                    key={pl.id}
                    className="cv-auto-row flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-line shadow-card transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-14 aspect-[3/4] rounded-xl overflow-hidden shrink-0 border border-line">
                        <CoverArtwork
                          src={pl.coverUrl}
                          title={pl.title}
                          className="w-full h-full"
                          showBottomPurpleBar={true}
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-ink truncate">
                          {pl.title}
                        </h4>
                        <p className="text-xs text-ink-muted mt-1 font-mono tabular-nums">
                          {pl.lessonIds?.length || 0} aulas
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {regularPlaylists.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() =>
                              moveItemByIndex(
                                regularPlaylists,
                                idx,
                                'up',
                                onReorderPlaylists
                              )
                            }
                            className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Subir playlist"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === regularPlaylists.length - 1}
                            onClick={() =>
                              moveItemByIndex(
                                regularPlaylists,
                                idx,
                                'down',
                                onReorderPlaylists
                              )
                            }
                            className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Descer playlist"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditPlaylistWindow(pl)}
                        className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                        title="Editar playlist"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePlaylist(pl.id)}
                        className="p-2 rounded-lg text-ink-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Excluir playlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <form
              noValidate
              onSubmit={handlePlaylistSubmit}
              className="max-w-xl space-y-5 pt-1 pb-24 sm:pb-6"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={closePlaylistWindow}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-brand-soft" />
                  Voltar
                </button>
                <h3 className="text-sm font-bold text-ink">
                  {editingPlaylistId ? 'Editar Playlist' : 'Nova Playlist'}
                </h3>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">
                  Nome da playlist
                </label>
                <input
                  ref={playlistTitleRef}
                  type="text"
                  maxLength={SCHEMA_LIMITS.TITLE_MAX}
                  value={playlistTitle}
                  onChange={(e) => {
                    setPlaylistTitle(e.target.value);
                    if (playlistTitleError) setPlaylistTitleError(null);
                  }}
                  placeholder="Digite o nome da playlist"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border text-sm text-ink focus:outline-none ${
                    playlistTitleError
                      ? 'border-danger focus:border-danger'
                      : 'border-line focus:border-brand-soft'
                  }`}
                />
                {playlistTitleError && (
                  <p className="text-xs font-medium text-danger mt-1">
                    {playlistTitleError}
                  </p>
                )}
              </div>

              <CleanCoverInput
                label="Imagem da capa"
                sizeHint="600 × 800 px"
                value={playlistCover}
                onChange={setPlaylistCover}
                targetWidth={IMAGE_DIMENSIONS.PLAYLIST_COVER.targetWidth}
                targetHeight={IMAGE_DIMENSIONS.PLAYLIST_COVER.targetHeight}
                resetValue="preset:trophy"
                unboxed={true}
              />

              <FolderLessonPickerManager
                selectedLabel="Aulas da playlist"
                lessons={lessons}
                lessonFolders={lessonFolders}
                selectedIds={playlistLessonIds}
                onChangeSelectedIds={setPlaylistLessonIds}
                maxItems={SCHEMA_LIMITS.MAX_LESSON_IDS}
              />

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={closePlaylistWindow}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Salvar Playlist
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: CURSOS */}
      {activeTab === 'courses' && (
        <div className="space-y-4">
          {!isCourseFormOpen && !isFreeModuleFormOpen ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-bold text-ink">Cursos</h2>
                <button
                  type="button"
                  onClick={openNewCourseWindow}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Novo Curso
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-2 border border-brand-soft/40 shadow-card">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-14 aspect-[2/3] rounded-xl overflow-hidden shrink-0 border border-line">
                      <CoverArtwork
                        src={freeCourse?.coverUrl || 'preset:mastery'}
                        title="Aulas Grátis"
                        className="w-full h-full"
                        showBottomPurpleBar={true}
                      />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-ink truncate">
                        Aulas Grátis
                      </h4>
                      <p className="text-xs text-brand-accent mt-1 font-mono tabular-nums">
                        {resolvedFreeLessonIds.length} aulas gratuitas
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={openFreeModuleWindow}
                    className="p-2 rounded-lg text-brand-accent hover:text-ink hover:bg-chip-hover transition-colors shrink-0 cursor-pointer"
                    title="Configurar Aulas Grátis"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                {regularCourses.map((course, idx) => (
                  <div
                    key={course.id}
                    className="cv-auto-row flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-line shadow-card transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-14 aspect-[2/3] rounded-xl overflow-hidden shrink-0 border border-line">
                        <CoverArtwork
                          src={course.coverUrl}
                          title={course.title}
                          className="w-full h-full"
                          showBottomPurpleBar={true}
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-ink truncate">
                          {course.title}
                        </h4>
                        <p className="text-xs text-ink-muted mt-1 font-mono tabular-nums">
                          {course.playlistIds?.length || 0} playlists
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {regularCourses.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() =>
                              moveItemByIndex(
                                regularCourses,
                                idx,
                                'up',
                                onReorderCourses
                              )
                            }
                            className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Subir curso"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === regularCourses.length - 1}
                            onClick={() =>
                              moveItemByIndex(
                                regularCourses,
                                idx,
                                'down',
                                onReorderCourses
                              )
                            }
                            className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Descer curso"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditCourseWindow(course)}
                        className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                        title="Editar curso"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCourse(course.id)}
                        className="p-2 rounded-lg text-ink-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Excluir curso"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : isFreeModuleFormOpen ? (
            <form
              noValidate
              onSubmit={handleFreeModuleSubmit}
              className="max-w-xl space-y-5 pt-1 pb-24 sm:pb-6"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closeCourseWindow}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-brand-soft" />
                  Voltar
                </button>

                <button
                  type="button"
                  onClick={() => onOpenNewLessonModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Criar Aula Gratuita
                </button>
              </div>

              <h3 className="text-sm font-bold text-ink">Aulas Grátis</h3>

              <CleanCoverInput
                label="Imagem da capa"
                sizeHint="600 × 900 px"
                value={freeCover}
                onChange={setFreeCover}
                targetWidth={IMAGE_DIMENSIONS.COURSE_COVER.targetWidth}
                targetHeight={IMAGE_DIMENSIONS.COURSE_COVER.targetHeight}
                resetValue="preset:mastery"
                unboxed={true}
              />

              <FolderLessonPickerManager
                selectedLabel="Aulas Grátis"
                lessons={lessons}
                lessonFolders={lessonFolders}
                selectedIds={freeLessonIds}
                onChangeSelectedIds={setFreeLessonIds}
                maxItems={SCHEMA_LIMITS.MAX_LESSON_IDS}
              />

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={closeCourseWindow}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Salvar Aulas Grátis
                </button>
              </div>
            </form>
          ) : (
            <form
              noValidate
              onSubmit={handleCourseSubmit}
              className="max-w-xl space-y-5 pt-1 pb-24 sm:pb-6"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={closeCourseWindow}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-brand-soft" />
                  Voltar
                </button>
                <h3 className="text-sm font-bold text-ink">
                  {editingCourseId ? 'Editar Curso' : 'Novo Curso'}
                </h3>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">
                  Nome do curso
                </label>
                <input
                  ref={courseTitleRef}
                  type="text"
                  maxLength={SCHEMA_LIMITS.TITLE_MAX}
                  value={courseTitle}
                  onChange={(e) => {
                    setCourseTitle(e.target.value);
                    if (courseTitleError) setCourseTitleError(null);
                  }}
                  placeholder="Digite o nome do curso"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border text-sm text-ink focus:outline-none ${
                    courseTitleError
                      ? 'border-danger focus:border-danger'
                      : 'border-line focus:border-brand-soft'
                  }`}
                />
                {courseTitleError && (
                  <p className="text-xs font-medium text-danger mt-1">
                    {courseTitleError}
                  </p>
                )}
              </div>

              <CleanCoverInput
                label="Imagem da capa"
                sizeHint="600 × 900 px"
                value={courseCover}
                onChange={setCourseCover}
                targetWidth={IMAGE_DIMENSIONS.COURSE_COVER.targetWidth}
                targetHeight={IMAGE_DIMENSIONS.COURSE_COVER.targetHeight}
                resetValue="preset:stadium"
                unboxed={true}
              />

              <SortableSelectionBox
                availableLabel="Playlists disponíveis"
                selectedLabel="Playlists do curso"
                allItems={regularPlaylists.map((pl) => ({
                  id: pl.id,
                  title: `${pl.title} (${pl.lessonIds?.length || 0} aulas)`,
                }))}
                selectedIds={coursePlaylistIds}
                onChangeSelectedIds={setCoursePlaylistIds}
                maxItems={SCHEMA_LIMITS.MAX_PLAYLIST_IDS}
              />

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={closeCourseWindow}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Salvar Curso
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 4A: TURMAS */}
      {activeTab === 'turmas' && (
        <div className="space-y-4">
          {isTurmaFormOpen ? (
            <form
              noValidate
              onSubmit={handleTurmaSubmit}
              className="max-w-2xl p-6 rounded-2xl bg-surface border border-line shadow-card space-y-5"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closeTurmaForm}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-brand-soft" />
                  Voltar
                </button>
                <h3 className="text-sm font-bold text-ink">
                  {editingTurmaId ? 'Editar Turma' : 'Nova Turma'}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">
                    Nome da Turma
                  </label>
                  <input
                    ref={turmaNameRef}
                    type="text"
                    maxLength={120}
                    value={turmaName}
                    onChange={(e) => {
                      setTurmaName(e.target.value);
                      if (turmaNameError) setTurmaNameError(null);
                    }}
                    placeholder="Ex: Turma Medicina 2026"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border text-sm text-ink focus:outline-none ${
                      turmaNameError
                        ? 'border-danger focus:border-danger'
                        : 'border-line focus:border-brand-soft'
                    }`}
                  />
                  {turmaNameError && (
                    <p className="text-xs font-medium text-danger mt-1">
                      {turmaNameError}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">
                    Descrição / Observação (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    value={turmaDescription}
                    onChange={(e) => setTurmaDescription(e.target.value)}
                    placeholder="Ex: Turno Manhã / Extensivo Enem"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink">
                    Cursos liberados nesta Turma
                  </span>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-brand-accent cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={turmaAccessAll}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTurmaAccessAll(checked);
                        setTurmaCourseIds(
                          checked ? regularCourses.map((c) => c.id) : []
                        );
                      }}
                      className="w-4 h-4 rounded accent-[#2563eb] shrink-0"
                    />
                    <span>Liberar todos os cursos</span>
                  </label>
                </div>

                {regularCourses.length === 0 ? (
                  <p className="text-xs text-ink-muted p-3 rounded-xl bg-inset border border-line">
                    Nenhum curso cadastrado ainda.
                  </p>
                ) : (
                  <div className="p-3 rounded-xl bg-inset border border-line grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                    {regularCourses.map((c) => {
                      const checked =
                        turmaAccessAll || turmaCourseIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (turmaAccessAll) {
                              setTurmaAccessAll(false);
                              setTurmaCourseIds(
                                regularCourses
                                  .filter((item) => item.id !== c.id)
                                  .map((item) => item.id)
                              );
                            } else {
                              const next = checked
                                ? turmaCourseIds.filter((id) => id !== c.id)
                                : [...turmaCourseIds, c.id];
                              setTurmaCourseIds(next);
                              if (
                                regularCourses.length > 0 &&
                                next.length === regularCourses.length
                              ) {
                                setTurmaAccessAll(true);
                              }
                            }
                          }}
                          className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            checked
                              ? 'bg-brand/20 border border-brand-soft/50 text-ink'
                              : 'bg-surface border border-line-soft text-ink-muted hover:text-ink'
                          }`}
                        >
                          <span className="truncate">{c.title}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              checked
                                ? 'bg-emerald-500/20 text-emerald-500'
                                : 'bg-chip text-ink-muted'
                            }`}
                          >
                            {checked ? 'Liberado' : 'Bloqueado'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={closeTurmaForm}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Turma'}
                </button>
              </div>
            </form>
          ) : selectedTurmaId && turmas.some((t) => t.id === selectedTurmaId) ? (
            (() => {
              const activeTurma = turmas.find((t) => t.id === selectedTurmaId)!;
              const turmaStudents = students.filter(
                (s) => s.turmaId === activeTurma.id
              );

              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedTurmaId(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink cursor-pointer shrink-0"
                    >
                      <ArrowLeft className="w-4 h-4 text-brand-soft" />
                      <span>Voltar</span>
                    </button>
                    <span className="text-ink-faint">/</span>
                    <h3 className="text-sm font-bold text-ink truncate">
                      Alunos da Turma ({turmaStudents.length})
                    </h3>
                  </div>

                  {turmaStudents.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-surface border border-line text-center space-y-1">
                      <p className="text-sm font-bold text-ink">
                        Nenhum aluno nesta turma ainda
                      </p>
                      <p className="text-xs text-ink-muted">
                        Vincule ou troque a turma dos alunos na aba Alunos.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {turmaStudents.map((stu) => {
                        const simCount = getStudentSimuladoCount(stu);
                        return (
                          <div
                            key={stu.id}
                            className="cv-auto-row flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-line shadow-card"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-ink truncate">
                                  {stu.name}
                                </h4>
                                {simCount > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[10px] font-bold font-mono shrink-0">
                                    {simCount} simulado
                                    {simCount > 1 ? 's' : ''} salvo
                                    {simCount > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-ink-muted truncate">
                                {stu.email}
                              </p>
                              {(stu.cpf || stu.phone) && (
                                <p className="text-[11px] text-ink-muted truncate tabular-nums">
                                  {stu.cpf ? `CPF: ${stu.cpf}` : ''}
                                  {stu.cpf && stu.phone ? ' • ' : ''}
                                  {stu.phone ? `Tel: ${stu.phone}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-ink">Turmas</h2>
                  <p className="text-xs text-ink-muted">
                    Crie turmas e libere cursos para toda a turma de uma só vez.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewTurmaForm}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Nova Turma
                </button>
              </div>

              {turmas.length === 0 ? (
                <div className="p-8 rounded-2xl bg-surface border border-line text-center space-y-2">
                  <p className="text-sm font-bold text-ink">
                    Nenhuma turma criada ainda
                  </p>
                  <p className="text-xs text-ink-muted">
                    Clique em &ldquo;Nova Turma&rdquo; para criar uma turma e
                    definir os cursos liberados.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {turmas.map((turma) => {
                    const memberCount = students.filter(
                      (s) => s.turmaId === turma.id
                    ).length;
                    const liberatedCourses = regularCourses.filter(
                      (c) =>
                        turma.accessAll || turma.courseIds?.includes(c.id)
                    );

                    return (
                      <div
                        key={turma.id}
                        onClick={() => setSelectedTurmaId(turma.id)}
                        className="cv-auto-row p-4 rounded-2xl bg-surface border border-line hover:border-brand-soft/60 shadow-card transition-all flex flex-col justify-between gap-4 cursor-pointer"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-brand/15 text-brand-accent flex items-center justify-center shrink-0">
                                <GraduationCap className="w-4 h-4" />
                              </div>
                              <h3 className="text-sm font-extrabold text-ink truncate">
                                {turma.name}
                              </h3>
                            </div>

                            <span className="px-2.5 py-1 rounded-lg bg-chip text-ink-2 text-xs font-bold font-mono shrink-0">
                              {memberCount} aluno{memberCount !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {turma.description && (
                            <p className="text-xs text-ink-muted line-clamp-1">
                              {turma.description}
                            </p>
                          )}

                          <p className="text-xs font-semibold text-brand-accent pt-1">
                            {turma.accessAll
                              ? 'Todos os cursos liberados'
                              : liberatedCourses.length > 0
                                ? `${liberatedCourses.length} curso${liberatedCourses.length !== 1 ? 's' : ''} liberado${liberatedCourses.length !== 1 ? 's' : ''}: ${liberatedCourses.map((c) => c.title).join(', ')}`
                                : 'Nenhum curso liberado'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTurmaId(turma.id);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors cursor-pointer"
                            >
                              Alunos da Turma
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditTurmaForm(turma);
                              }}
                              className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                              title="Editar turma"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTurma(turma.id);
                              }}
                              className="p-2 rounded-lg text-ink-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Excluir turma"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 4B: STUDENTS */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-bold text-ink">Alunos</h2>
            <button
              type="button"
              onClick={openNewStudentPopup}
              className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Aluno
            </button>
          </div>

          {turmas.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setStudentTurmaFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  studentTurmaFilter === 'ALL'
                    ? 'bg-brand text-white'
                    : 'bg-surface border border-line text-ink-muted hover:text-ink'
                }`}
              >
                Todos ({students.length})
              </button>

              <button
                type="button"
                onClick={() => setStudentTurmaFilter('NONE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  studentTurmaFilter === 'NONE'
                    ? 'bg-brand text-white'
                    : 'bg-surface border border-line text-ink-muted hover:text-ink'
                }`}
              >
                Sem Turma ({students.filter((s) => !s.turmaId).length})
              </button>

              {turmas.map((t) => {
                const count = students.filter((s) => s.turmaId === t.id).length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setStudentTurmaFilter(t.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      studentTurmaFilter === t.id
                        ? 'bg-brand text-white'
                        : 'bg-surface border border-line text-ink-muted hover:text-ink'
                    }`}
                  >
                    {t.name} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {students.length === 0 ? (
            <div className="p-8 rounded-2xl bg-surface border border-line text-center space-y-2">
              <p className="text-sm font-bold text-ink">
                Nenhum aluno cadastrado ainda
              </p>
              <p className="text-xs text-ink-muted">
                Clique em &ldquo;Cadastrar Aluno&rdquo; acima para cadastrar um aluno.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {students
                .filter((stu) => {
                  if (studentTurmaFilter === 'ALL') return true;
                  if (studentTurmaFilter === 'NONE') return !stu.turmaId;
                  return stu.turmaId === studentTurmaFilter;
                })
                .map((stu) => {
                  const stuTurma = stu.turmaId
                    ? turmas.find((t) => t.id === stu.turmaId)
                    : null;
                  const liberatedCourses = getStudentEffectiveCourses(stu);
                  const isAll = Boolean(stuTurma && stuTurma.accessAll);
                  const hasAnyLiberated = Boolean(
                    stuTurma && (isAll || liberatedCourses.length > 0)
                  );
                  const simCount = getStudentSimuladoCount(stu);

                  return (
                    <div
                      key={stu.id}
                      onClick={() => openEditStudentCoursesPopup(stu)}
                      className="cv-auto-row flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-line hover:border-brand-soft/60 shadow-card transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-xs font-bold text-ink truncate">
                            {stu.name}
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              stuTurma
                                ? 'bg-brand/15 text-brand-accent border border-brand-soft/40'
                                : 'bg-chip text-ink-muted'
                            }`}
                          >
                            {stuTurma ? `Turma: ${stuTurma.name}` : 'Sem turma'}
                          </span>
                          {simCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[10px] font-bold font-mono shrink-0">
                              {simCount} simulado{simCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-muted truncate">
                          {stu.email}
                        </p>
                        {(stu.cpf || stu.phone || stu.birthDate) && (
                          <p className="text-[11px] text-ink-muted truncate tabular-nums">
                            {[
                              stu.cpf ? `CPF: ${stu.cpf}` : '',
                              stu.phone ? `Tel: ${stu.phone}` : '',
                              stu.birthDate
                                ? `Nasc.: ${formatBirthDateDisplay(stu.birthDate)}`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        )}
                        <p className="text-[11px] font-semibold text-brand-accent truncate pt-0.5">
                          {!stuTurma
                            ? 'Sem turma — Nenhum curso liberado (Teste Grátis)'
                            : isAll
                              ? 'Todos os cursos liberados pela turma'
                              : liberatedCourses.length > 0
                                ? `${liberatedCourses.length} curso${liberatedCourses.length !== 1 ? 's' : ''} liberado${liberatedCourses.length !== 1 ? 's' : ''}: ${liberatedCourses.map((c) => c.title).join(', ')}`
                                : 'Nenhum curso liberado na turma (Teste Grátis)'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {turmas.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTransferStudentModal(stu);
                            }}
                            className="p-2 rounded-lg bg-chip hover:bg-brand/20 text-brand-accent transition-colors cursor-pointer"
                            title="Transferir aluno de turma (mantém simulados salvos)"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditStudentCoursesPopup(stu);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                            hasAnyLiberated
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : 'bg-rose-500/15 text-rose-500'
                          }`}
                        >
                          {hasAnyLiberated ? 'Ativo' : 'Bloqueado'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteStudent(stu.id);
                          }}
                          className="p-2 rounded-lg text-ink-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Excluir aluno"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* SHARED POPUP: TRANSFER A STUDENT BETWEEN TURMAS */}
      {transferringStudent && (
        <div
          onClick={() => setTransferringStudent(null)}
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[85dvh] sm:rounded-3xl max-w-md bg-surface border-0 sm:border border-line shadow-pop overflow-hidden flex flex-col"
          >
            <div className="shrink-0 px-5 py-4 border-b border-line flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold tracking-tight text-ink truncate">
                  Transferir Aluno de Turma
                </h3>
                <p className="text-xs text-ink-muted truncate">
                  {transferringStudent.name} ({transferringStudent.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferringStudent(null)}
                className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={handleConfirmTransferStudent}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-ink-2">
                    Selecione a turma de destino:
                  </label>

                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setTransferTargetTurmaId('')}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        transferTargetTurmaId === ''
                          ? 'bg-brand/20 border-brand-soft text-ink'
                          : 'bg-inset border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      <span>Sem turma (remover de turma)</span>
                      {transferTargetTurmaId === '' && (
                        <Check className="w-4 h-4 text-brand-accent" />
                      )}
                    </button>

                    {turmas.map((t) => {
                      const isSelected = transferTargetTurmaId === t.id;
                      const libCount = t.accessAll
                        ? regularCourses.length
                        : (t.courseIds || []).filter((cid) =>
                            regularCourses.some((c) => c.id === cid)
                          ).length;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTransferTargetTurmaId(t.id)}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-brand/20 border-brand-soft text-ink'
                              : 'bg-inset border-line text-ink-2 hover:text-ink'
                          }`}
                        >
                          <div className="text-left min-w-0">
                            <span className="block font-bold truncate">
                              {t.name}
                            </span>
                            <span className="block text-[10px] text-brand-accent">
                              {t.accessAll
                                ? 'Todos os cursos liberados'
                                : `${libCount} curso${libCount !== 1 ? 's' : ''} liberado${libCount !== 1 ? 's' : ''}`}
                            </span>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-brand-accent shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="shrink-0 px-5 py-3.5 border-t border-line bg-surface flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTransferringStudent(null)}
                  className="px-4 py-2.5 rounded-full bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-glow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Transferindo...' : 'Confirmar Transferência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARED POPUP: EDIT STUDENT DATA */}
      {editingStudentCourses && (
        <div
          onClick={() => setEditingStudentCourses(null)}
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[86dvh] sm:rounded-3xl max-w-md bg-surface border-0 sm:border border-line shadow-pop overflow-hidden flex flex-col"
          >
            <div className="shrink-0 px-5 py-4 border-b border-line flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold tracking-tight text-ink truncate">
                  Editar Aluno
                </h3>
                <p className="text-xs text-ink-muted truncate">
                  {editingStudentCourses.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudentCourses(null)}
                className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                aria-label="Fechar popup de edição do aluno"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={handleSaveStudentCourses}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">
                    Nome do Aluno
                  </label>
                  <input
                    ref={editStuNameRef}
                    type="text"
                    maxLength={120}
                    value={editStuName}
                    onChange={(e) => {
                      setEditStuName(e.target.value);
                      if (editStuNameError) setEditStuNameError(null);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border text-sm text-ink focus:outline-none ${
                      editStuNameError
                        ? 'border-danger focus:border-danger'
                        : 'border-line focus:border-brand-soft'
                    }`}
                  />
                  {editStuNameError && (
                    <p className="text-xs font-medium text-danger mt-1">
                      {editStuNameError}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-ink-2 mb-1.5">
                      CPF
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={editStuCpf}
                      onChange={(e) => setEditStuCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-2 mb-1.5">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      maxLength={25}
                      value={editStuPhone}
                      onChange={(e) => setEditStuPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-2 mb-1.5">
                      Data de Nascimento
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={editStuBirthDate}
                      onChange={(e) =>
                        setEditStuBirthDate(formatBirthDateInput(e.target.value))
                      }
                      placeholder="DD/MM/AAAA"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">
                    Turma do Aluno (os cursos são liberados pela turma)
                  </label>
                  <select
                    value={editStuTurmaId}
                    onChange={(e) => {
                      const nextTurmaId = e.target.value;
                      setEditStuTurmaId(nextTurmaId);
                      const chosenTurma = turmas.find(
                        (t) => t.id === nextTurmaId
                      );
                      if (chosenTurma) {
                        const validRegularIds = regularCourses.map((c) => c.id);
                        const isAll = Boolean(chosenTurma.accessAll);
                        setEditStuAccessAll(isAll);
                        setEditStuCourseIds(
                          isAll
                            ? validRegularIds
                            : (chosenTurma.courseIds || []).filter((id) =>
                                validRegularIds.includes(id)
                              )
                        );
                      } else {
                        setEditStuAccessAll(false);
                        setEditStuCourseIds([]);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-xs font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  >
                    <option value="">
                      Sem turma (bloqueado / apenas Teste Grátis)
                    </option>
                    {turmas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {Boolean(editStuTurmaId) && (
                  <div className="p-3.5 rounded-2xl bg-inset border border-line space-y-2">
                    <span className="block text-xs font-bold text-ink-2">
                      Cursos liberados pela turma selecionada:
                    </span>
                    {editStuAccessAll ? (
                      <span className="text-xs font-bold text-emerald-500 block">
                        Todos os cursos liberados ({regularCourses.length})
                      </span>
                    ) : editStuCourseIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {regularCourses
                          .filter((c) => editStuCourseIds.includes(c.id))
                          .map((c) => (
                            <span
                              key={c.id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-semibold"
                            >
                              {c.title}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs text-rose-500 font-semibold block">
                        Nenhum curso liberado nesta turma ainda.
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="shrink-0 px-5 py-3.5 border-t border-line bg-surface flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingStudentCourses(null)}
                  className="px-4 py-2.5 rounded-full bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-glow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARED POPUP: CADASTRAR ALUNO */}
      {isStudentPopupOpen && (
        <div
          onClick={() => setIsStudentPopupOpen(false)}
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[86dvh] sm:rounded-3xl max-w-lg bg-surface border-0 sm:border border-line shadow-pop overflow-hidden flex flex-col"
          >
            <div className="shrink-0 px-5 py-4 border-b border-line flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold tracking-tight text-ink">
                Cadastrar Aluno
              </h3>
              <button
                type="button"
                onClick={() => setIsStudentPopupOpen(false)}
                className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                aria-label="Fechar popup de cadastro de aluno"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={handleStudentSubmit}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="p-3.5 rounded-2xl bg-inset border border-line space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-brand-accent">
                      E-mails que já entraram na plataforma ({knownPlatformEntries.length})
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      placeholder="Pesquisar e-mail..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface border border-line text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                  </div>

                  {(() => {
                    const q = studentSearchQuery.trim().toLowerCase();
                    const filteredEntries = knownPlatformEntries.filter(
                      (item) => !q || item.email.toLowerCase().includes(q)
                    );

                    if (knownPlatformEntries.length === 0) {
                      return (
                        <p className="text-[11px] text-ink-muted py-1">
                          Nenhum e-mail registrado ainda. Preencha os campos
                          abaixo para cadastrar manualmente.
                        </p>
                      );
                    }

                    if (filteredEntries.length === 0) {
                      return (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-ink-muted">
                            Este e-mail ainda não entrou na plataforma. Cadastre
                            manualmente abaixo.
                          </span>
                          {studentSearchQuery.includes('@') && (
                            <button
                              type="button"
                              onClick={() => {
                                setStudentEmail(studentSearchQuery.trim());
                              }}
                              className="px-2.5 py-1 rounded-lg bg-brand/20 text-brand-accent text-[11px] font-bold cursor-pointer"
                            >
                              Usar este e-mail
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {filteredEntries.map((entry) => {
                          const isSelected =
                            studentEmail.trim().toLowerCase() === entry.email;
                          return (
                            <button
                              key={entry.email}
                              type="button"
                              onClick={() =>
                                selectPlatformEntryForRegistration(entry)
                              }
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-brand/20 border border-brand-soft text-ink'
                                  : 'bg-surface hover:bg-chip-hover border border-line-soft text-ink-2'
                              }`}
                            >
                              <span className="font-bold truncate">
                                {entry.email}
                              </span>
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                                  isSelected
                                    ? 'bg-brand text-white'
                                    : 'bg-chip text-brand-accent'
                                }`}
                              >
                                {isSelected ? 'Selecionado' : 'Selecionar'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">
                    E-mail Google
                  </label>
                  <input
                    ref={studentEmailRef}
                    type="email"
                    maxLength={180}
                    value={studentEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStudentEmail(val);
                      if (studentFormError) setStudentFormError(null);
                      const matched = knownPlatformEntries.find(
                        (item) => item.email === val.trim().toLowerCase()
                      );
                      if (matched) {
                        if (!studentName) setStudentName(matched.name);
                        if (!studentCpf && matched.cpf)
                          setStudentCpf(matched.cpf);
                        if (!studentPhone && matched.phone)
                          setStudentPhone(matched.phone);
                        if (!studentBirthDate && matched.birthDate)
                          setStudentBirthDate(matched.birthDate);
                      }
                    }}
                    placeholder="aluno@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">
                    Nome
                  </label>
                  <input
                    ref={studentNameRef}
                    type="text"
                    maxLength={120}
                    value={studentName}
                    onChange={(e) => {
                      setStudentName(e.target.value);
                      if (studentFormError) setStudentFormError(null);
                    }}
                    placeholder="Nome do aluno"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  />
                </div>

                {studentFormError && (
                  <p className="text-xs font-medium text-danger">
                    {studentFormError}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-ink-2 mb-1.5">
                      CPF (fixo)
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={studentCpf}
                      onChange={(e) => setStudentCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-2 mb-1.5">
                      Telefone
                    </label>
                    <input
                      type="tel"
                      maxLength={25}
                      value={studentPhone}
                      onChange={(e) => setStudentPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-2 mb-1.5">
                      Data de Nascimento
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={studentBirthDate}
                      onChange={(e) =>
                        setStudentBirthDate(
                          formatBirthDateInput(e.target.value)
                        )
                      }
                      placeholder="DD/MM/AAAA"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-2 mb-1.5">
                    Turma (os cursos são liberados pela turma)
                  </label>
                  <select
                    value={studentTurmaId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setStudentTurmaId(nextId);
                      const chosenTurma = turmas.find((t) => t.id === nextId);
                      if (chosenTurma) {
                        const validRegularIds = regularCourses.map((c) => c.id);
                        const isAll = Boolean(chosenTurma.accessAll);
                        setStudentAccessAll(isAll);
                        setStudentCourseIds(
                          isAll
                            ? validRegularIds
                            : (chosenTurma.courseIds || []).filter((id) =>
                                validRegularIds.includes(id)
                              )
                        );
                      } else {
                        setStudentAccessAll(false);
                        setStudentCourseIds([]);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-xs font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  >
                    <option value="">
                      Sem turma (bloqueado / apenas Teste Grátis)
                    </option>
                    {turmas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {Boolean(studentTurmaId) && (
                  <div className="p-3.5 rounded-2xl bg-inset border border-line space-y-2">
                    <span className="block text-xs font-bold text-ink-2">
                      Cursos liberados pela turma selecionada:
                    </span>
                    {studentAccessAll ? (
                      <span className="text-xs font-bold text-emerald-500 block">
                        Todos os cursos liberados ({regularCourses.length})
                      </span>
                    ) : studentCourseIds.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {regularCourses
                          .filter((c) => studentCourseIds.includes(c.id))
                          .map((c) => (
                            <span
                              key={c.id}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-semibold"
                            >
                              {c.title}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <span className="text-xs text-rose-500 font-semibold block">
                        Nenhum curso liberado nesta turma ainda.
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="shrink-0 px-5 py-3.5 border-t border-line bg-surface flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsStudentPopupOpen(false)}
                  className="px-4 py-2.5 rounded-full bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-glow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Aluno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 6: MENTORIA */}
      {activeTab === 'mentoria' && (
        <AdminMentoriaTab
          students={students}
          currentUserUid={currentUserUid}
        />
      )}

      {/* TAB 7: PLATFORM BACKGROUND & BRAND + MIGRATIONS & SECURITY */}
      {activeTab === 'config' && (
        <div className="space-y-6 max-w-3xl pb-24 sm:pb-6">
          <form
            noValidate
            onSubmit={handleConfigSubmit}
            className="p-6 rounded-2xl bg-surface border border-line shadow-card space-y-4"
          >
            <h3 className="text-sm font-bold text-ink mb-2">
              Personalização Visual & Marca
            </h3>

            <CleanCoverInput
              label="Imagem de Plano de Fundo"
              sizeHint="1080 × 1920 px"
              value={heroBgUrl}
              onChange={setHeroBgUrl}
              targetWidth={IMAGE_DIMENSIONS.PLATFORM_BG.targetWidth}
              targetHeight={IMAGE_DIMENSIONS.PLATFORM_BG.targetHeight}
              resetValue=""
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Nome da Plataforma
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1">
                  Texto do Botão (Alunos Bloqueados)
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={heroCtaText}
                  onChange={(e) => setHeroCtaText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                Título Principal
              </label>
              <input
                type="text"
                maxLength={140}
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1">
                Subtítulo
              </label>
              <input
                type="text"
                maxLength={240}
                value={heroSubtitle}
                onChange={(e) => setHeroSubtitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="py-2.5 px-6 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              Salvar Configurações
            </button>
          </form>

          {/* FERRAMENTAS DE MIGRAÇÃO (A4.1, A4.2 & Fase 1.6) */}
          <div className="p-6 rounded-2xl bg-surface border border-line shadow-card space-y-5">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Database className="w-4 h-4 text-brand-soft" />
                Migrações & Manutenção de Dados
              </h3>
              <p className="text-xs text-ink-muted mt-1">
                Ferramentas para atualizar documentos legados e otimizar imagens existentes.
              </p>
            </div>

            {/* Image Optimization (Fase 1.6) */}
            <div className="p-4 rounded-xl bg-inset border border-line-soft space-y-3">
              <div>
                <h4 className="text-xs font-bold text-ink">
                  Otimizar imagens existentes
                </h4>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Recomprime capas de cursos, playlists, miniaturas de aulas e banner acima de 150 KB, salvando apenas se o arquivo final ficar menor.
                </p>
              </div>

              <button
                type="button"
                disabled={optimizingImages}
                onClick={handleOptimizeExistingImages}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>
                  {optimizingImages
                    ? 'Otimizando imagens...'
                    : 'Otimizar imagens existentes'}
                </span>
              </button>

              {optimizeImagesMsg && (
                <p className="text-xs text-brand-accent font-medium">
                  {optimizeImagesMsg}
                </p>
              )}
            </div>

            {/* Gabaritos Migration */}
            <div className="p-4 rounded-xl bg-inset border border-line-soft space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-ink">
                    Migrar Gabaritos de Simulados (Coleção simuladoKeys)
                  </h4>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    Move o campo answerKey dos simulados para a coleção isolada protegida por regras.
                  </p>
                </div>
                {simuladosWithInlineKey.length > 0 ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[11px] font-bold">
                    {simuladosWithInlineKey.length} com gabarito legado
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-[11px] font-bold inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    100% Protegido
                  </span>
                )}
              </div>

              {simuladosWithInlineKey.length > 0 && (
                <button
                  type="button"
                  disabled={migratingKeys}
                  onClick={handleMigrateGabaritos}
                  className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>
                    {migratingKeys
                      ? 'Migrando...'
                      : `Migrar ${simuladosWithInlineKey.length} Gabarito(s)`}
                  </span>
                </button>
              )}

              {migrationKeysMsg && (
                <p className="text-xs text-brand-accent font-medium">
                  {migrationKeysMsg}
                </p>
              )}
            </div>

            {/* Free PDFs Migration */}
            <div className="p-4 rounded-xl bg-inset border border-line-soft space-y-3">
              <div>
                <h4 className="text-xs font-bold text-ink">
                  Marcar PDFs de Aulas Grátis
                </h4>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Atualiza todas as partes de PDFs (pdfChunks) vinculadas a aulas gratuitas com o campo isFree: true.
                </p>
              </div>

              <button
                type="button"
                disabled={migratingPdfs}
                onClick={handleMigrateFreePdfs}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
              >
                <Database className="w-3.5 h-3.5" />
                <span>
                  {migratingPdfs ? 'Atualizando...' : 'Marcar PDFs Grátis'}
                </span>
              </button>

              {migrationPdfsMsg && (
                <p className="text-xs text-brand-accent font-medium">
                  {migrationPdfsMsg}
                </p>
              )}
            </div>
          </div>

          {/* CHECKLIST DE SEGURANÇA NO CONSOLE FIREBASE (A6.4) */}
          <div className="p-6 rounded-2xl bg-surface-2 border border-brand-soft/40 shadow-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/40 text-brand-accent flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">
                  Checklist de Segurança do Console Firebase (Ações Manuais)
                </h3>
                <p className="text-xs text-brand-accent mt-0.5">
                  Itens que devem ser configurados diretamente no Console do Firebase e Google Cloud.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1 text-xs text-ink-2">
              <div className="p-3.5 rounded-xl bg-inset border border-line-soft space-y-1">
                <div className="flex items-center gap-2 text-ink font-semibold">
                  <span className="w-5 h-5 rounded-full bg-brand/20 text-brand-accent flex items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  <span>Firebase App Check</span>
                </div>
                <p className="text-ink-muted text-[11px] pl-7">
                  No Firebase Console → App Check: registre a aplicação Web com reCAPTCHA Enterprise (ou Play Integrity no Android) e ative a imposição (Enforcement) para Cloud Firestore e Storage. Isso impede scraping direto de chamadas de fora do seu domínio.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-inset border border-line-soft space-y-1">
                <div className="flex items-center gap-2 text-ink font-semibold">
                  <span className="w-5 h-5 rounded-full bg-brand/20 text-brand-accent flex items-center justify-center text-[10px] font-bold">
                    2
                  </span>
                  <span>Restrição da API Key (Google Cloud Console)</span>
                </div>
                <p className="text-ink-muted text-[11px] pl-7">
                  Acesse Google Cloud Console → APIs e Serviços → Credenciais. Selecione a API Key do projeto e aplique restrições de aplicativo (Referenciadores HTTP: adicione apenas o seu domínio oficial) e restrições de API (selecione apenas Cloud Firestore API, Firebase Authentication API e Cloud Storage).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-inset border border-line-soft space-y-1">
                <div className="flex items-center gap-2 text-ink font-semibold">
                  <span className="w-5 h-5 rounded-full bg-brand/20 text-brand-accent flex items-center justify-center text-[10px] font-bold">
                    3
                  </span>
                  <span>Domínios Autorizados no Firebase Auth</span>
                </div>
                <p className="text-ink-muted text-[11px] pl-7">
                  No Firebase Console → Authentication → Configurações → Domínios Autorizados: certifique-se de que constam apenas o domínio de produção oficial e localhost (para testes). Remova domínios desconhecidos ou expirados.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-inset border border-line-soft space-y-1">
                <div className="flex items-center gap-2 text-ink font-semibold">
                  <span className="w-5 h-5 rounded-full bg-brand/20 text-brand-accent flex items-center justify-center text-[10px] font-bold">
                    4
                  </span>
                  <span>Alertas de Faturamento & Orçamento (Budgets)</span>
                </div>
                <p className="text-ink-muted text-[11px] pl-7">
                  No Google Cloud Console → Faturamento → Orçamentos e Alertas: crie um orçamento com alertas por e-mail (50%, 90% e 100%) para monitorar o consumo do Firestore e do Storage sem surpresas financeiras.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
