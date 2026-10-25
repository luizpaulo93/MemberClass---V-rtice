import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Trash2,
  FileText,
  Upload,
  Folder,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  Lesson,
  LessonFolder,
  PdfAttachment,
  SCHEMA_LIMITS,
  sanitizeString,
  generateSafeId,
  extractYoutubeId,
  hasLessonVideo,
} from '../types';
import { CoverArtwork } from './CoverArtwork';
import { ensurePdfUrlChunked, uploadPdfFileToCloud } from '../utils/pdfStorage';
import { compressImageToDataUrl } from '../utils/imageCompress';

interface LessonPopupModalProps {
  isOpen: boolean;
  editingLesson: Lesson | null;
  defaultIsFree?: boolean;
  defaultFolderId?: string;
  folders?: LessonFolder[];
  onClose: () => void;
  onSaveLesson: (
    lesson: Omit<Lesson, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  currentUserUid: string;
}

export const LessonPopupModal: React.FC<LessonPopupModalProps> = ({
  isOpen,
  editingLesson,
  defaultIsFree = false,
  defaultFolderId = '',
  folders = [],
  onClose,
  onSaveLesson,
  currentUserUid,
}) => {
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('preset:stadium');
  const [pdfs, setPdfs] = useState<PdfAttachment[]>([]);
  const [folderId, setFolderId] = useState<string>('');
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfUploadPct, setPdfUploadPct] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const initializedKeyRef = useRef<string>('');

  const movePdf = (index: number, direction: 'up' | 'down') => {
    setPdfs((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) {
      initializedKeyRef.current = '';
      return;
    }
    const modalKey = `${editingLesson ? editingLesson.id : 'new'}:${defaultFolderId || ''}`;
    if (initializedKeyRef.current === modalKey) {
      return;
    }
    initializedKeyRef.current = modalKey;

    setPdfError(null);
    setTitleError(false);
    if (editingLesson) {
      setTitle(editingLesson.title);
      setYoutubeInput(
        hasLessonVideo(editingLesson.youtubeId)
          ? `https://youtu.be/${editingLesson.youtubeId}`
          : ''
      );
      setDescription(editingLesson.description || '');
      setThumbnailUrl(editingLesson.thumbnailUrl || 'preset:stadium');
      const initialPdfs = Array.isArray(editingLesson.pdfs)
        ? editingLesson.pdfs
        : [];
      setPdfs(initialPdfs);
      setFolderId(editingLesson.folderId || defaultFolderId || '');

      // Se algum PDF veio do cache local com URL vazia, busca a versão completa no Firestore
      if (initialPdfs.some((p) => !p.url)) {
        const lessonId = editingLesson.id;
        getDoc(doc(db, 'lessons', lessonId))
          .then((snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Partial<Lesson>;
            const remotePdfs = Array.isArray(data.pdfs) ? data.pdfs : [];
            if (remotePdfs.length === 0) return;
            const remoteById = new Map(remotePdfs.map((p) => [p.id, p]));
            setPdfs((prev) =>
              prev.map((p) => {
                if (p.url) return p;
                const found = remoteById.get(p.id);
                return found && found.url ? { ...p, url: found.url } : p;
              })
            );
          })
          .catch(() => {
            // ignore offline error
          });
      }
    } else {
      setTitle('');
      setYoutubeInput('');
      setDescription('');
      setThumbnailUrl('preset:stadium');
      setPdfs([]);
      setFolderId(defaultFolderId || '');
    }
  }, [isOpen, editingLesson, defaultFolderId]);

  if (!isOpen) return null;

  const handleImageFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 640, 0.8);
      setThumbnailUrl(dataUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingImg(false);
      e.target.value = '';
    }
  };

  const handleUploadLocalPdf = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    e.target.value = '';
    setPdfError(null);

    if (pdfs.length >= SCHEMA_LIMITS.MAX_PDFS) {
      setPdfError(`Limite máximo de ${SCHEMA_LIMITS.MAX_PDFS} PDFs por aula atingido.`);
      return;
    }

    const remainingSlots = Math.max(0, SCHEMA_LIMITS.MAX_PDFS - pdfs.length);
    const filesToUpload = selectedFiles.slice(0, remainingSlots);

    setUploadingPdf(true);
    setPdfUploadPct(8);
    const isLessonFree = editingLesson
      ? Boolean(editingLesson.isFree)
      : Boolean(defaultIsFree);
    const activeUid = auth.currentUser?.uid || currentUserUid;

    try {
      const fileProgress = new Array<number>(filesToUpload.length).fill(0);
      const updateOverallProgress = () => {
        const sum = fileProgress.reduce((acc, v) => acc + v, 0);
        const avg = Math.round(sum / filesToUpload.length);
        setPdfUploadPct(Math.max(8, Math.min(100, avg)));
      };

      let nextFileIdx = 0;
      const FILE_CONCURRENCY = 3;

      const fileWorker = async () => {
        while (nextFileIdx < filesToUpload.length) {
          const i = nextFileIdx++;
          const file = filesToUpload[i];
          if (!file) continue;
          const uploaded = await uploadPdfFileToCloud(
            file,
            activeUid,
            (pct) => {
              fileProgress[i] = pct;
              updateOverallProgress();
            },
            isLessonFree
          );
          fileProgress[i] = 100;
          updateOverallProgress();
          const item: PdfAttachment = {
            id: generateSafeId('pdf'),
            title: sanitizeString(
              uploaded.pdfTitle,
              SCHEMA_LIMITS.TITLE_MAX,
              'Material PDF'
            ),
            url: uploaded.pdfUrl,
            sizeLabel: sanitizeString(uploaded.sizeLabel, 40, 'PDF'),
          };
          setPdfs((prev) => [...prev, item].slice(0, SCHEMA_LIMITS.MAX_PDFS));
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(FILE_CONCURRENCY, filesToUpload.length) },
          () => fileWorker()
        )
      );
    } catch (err) {
      console.error('Erro ao subir PDF da aula:', err);
      setPdfError('Não foi possível enviar o PDF. Tente novamente.');
    } finally {
      setUploadingPdf(false);
      setPdfUploadPct(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingPdf || isSaving) return;
    if (!title.trim()) {
      setTitleError(true);
      titleInputRef.current?.focus();
      return;
    }
    setPdfError(null);
    setIsSaving(true);
    try {
      const isNew = !editingLesson;
      const id = editingLesson?.id || generateSafeId('lesson');
      const isLessonFree = editingLesson
        ? Boolean(editingLesson.isFree)
        : Boolean(defaultIsFree);
      const activeUid = auth.currentUser?.uid || currentUserUid;

      // Garante que qualquer PDF antigo em base64 inline seja migrado para pdfChunks
      // antes de salvar a aula, evitando ultrapassar o limite de 1 MB por documento
      const normalizedPdfs: PdfAttachment[] = [];
      for (const p of pdfs.slice(0, SCHEMA_LIMITS.MAX_PDFS)) {
        if (!p || !p.url || !p.url.trim()) continue;
        const chunkedUrl = await ensurePdfUrlChunked(
          p.url.trim(),
          activeUid,
          isLessonFree
        );
        if (!chunkedUrl) continue;
        normalizedPdfs.push({
          id: sanitizeString(
            p.id || generateSafeId('pdf'),
            SCHEMA_LIMITS.ID_MAX,
            generateSafeId('pdf')
          ),
          title: sanitizeString(
            p.title,
            SCHEMA_LIMITS.TITLE_MAX,
            'Material PDF'
          ),
          url: sanitizeString(chunkedUrl, SCHEMA_LIMITS.PDF_URL_MAX, ''),
          sizeLabel: sanitizeString(p.sizeLabel, 40, 'PDF'),
        });
      }

      await onSaveLesson(
        {
          id,
          title: sanitizeString(title, SCHEMA_LIMITS.TITLE_MAX, 'Aula'),
          description: sanitizeString(
            description,
            SCHEMA_LIMITS.LESSON_DESC_MAX,
            ''
          ),
          youtubeId: extractYoutubeId(youtubeInput),
          duration: editingLesson?.duration || '15:00',
          thumbnailUrl: sanitizeString(
            thumbnailUrl.trim() || 'preset:stadium',
            SCHEMA_LIMITS.URL_MAX,
            'preset:stadium'
          ),
          pdfs: normalizedPdfs,
          folderId: sanitizeString(folderId, 128, ''),
          ...(typeof editingLesson?.order === 'number'
            ? { order: editingLesson.order }
            : {}),
          isFree: isLessonFree,
          isPublished: true,
          authorId: activeUid,
        },
        isNew
      );
      onClose();
    } catch (err) {
      console.error('Erro ao salvar aula:', err);
      setPdfError('Não foi possível salvar a aula. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeFolderObj = folders.find((f) => f.id === folderId);

  return (
    <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="bg-surface border-0 sm:border border-line h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[90dvh] sm:rounded-3xl max-w-lg flex flex-col overflow-hidden shadow-pop">
        <div className="shrink-0 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4 pb-4 border-b border-line">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink truncate">
              {editingLesson
                ? 'Editar Aula'
                : defaultIsFree
                  ? 'Criar Aula Gratuita'
                  : 'Criar Aula'}
            </h3>
            {activeFolderObj && (
              <p className="text-xs text-accent-300 font-medium flex items-center gap-1 mt-0.5 truncate">
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span>Pasta: {activeFolderObj.name}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-10 min-h-10 p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-chip flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            {folders.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">
                  Pasta da aula
                </label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-xs font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                >
                  <option value="">Sem pasta</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 1. Nome da Aula */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">
                Nome da aula
              </label>
              <input
                ref={titleInputRef}
                type="text"
                maxLength={SCHEMA_LIMITS.TITLE_MAX}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError && e.target.value.trim()) setTitleError(false);
                }}
                placeholder="Digite o nome da aula"
                className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border text-sm text-ink focus:outline-none ${
                  titleError
                    ? 'border-danger focus:border-danger'
                    : 'border-line focus:border-brand-soft'
                }`}
              />
              {titleError && (
                <p className="text-xs text-danger mt-1 font-medium">
                  Informe o nome da aula.
                </p>
              )}
            </div>

            {/* 2. Link do Vídeo (Opcional) */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">
                Link do vídeo (opcional)
              </label>
              <input
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                placeholder="Cole o link do vídeo (ou deixe em branco para postar só PDF)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
              />
            </div>

            {/* 3. Texto ou Link */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">
                Texto ou link
              </label>
              <textarea
                rows={3}
                maxLength={SCHEMA_LIMITS.LESSON_DESC_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Texto ou link complementar (opcional)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
              />
            </div>

            {/* 4. Imagem da Aula (Upload direto da memória do aparelho) */}
            <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-inset border border-line">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 aspect-[3/4] rounded-lg overflow-hidden border border-line shrink-0 bg-surface-2">
                  <CoverArtwork
                    src={thumbnailUrl || 'preset:stadium'}
                    title={title || 'Capa'}
                    className="w-full h-full"
                    showBottomPurpleBar={true}
                  />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-medium text-ink">
                    Imagem da capa
                  </span>
                  <span className="block text-xs text-ink-muted mt-0.5">
                    600 × 800 px
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {thumbnailUrl && !thumbnailUrl.startsWith('preset:') && (
                  <button
                    type="button"
                    onClick={() => setThumbnailUrl('')}
                    className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-danger transition-colors cursor-pointer"
                    title="Remover imagem"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <label className="px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shrink-0">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">
                    {uploadingImg ? 'Carregando...' : 'Enviar Imagem'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* 5. PDFs (Somente upload do arquivo PDF do aparelho — usa o nome do próprio arquivo PDF) */}
            <div className="p-3.5 rounded-xl bg-inset border border-line space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-2">PDFs</span>

                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  onChange={handleUploadLocalPdf}
                  className="hidden"
                />

                <button
                  type="button"
                  disabled={uploadingPdf}
                  onClick={() => pdfInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-xs font-semibold text-white cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">
                    {uploadingPdf
                      ? `Enviando (${pdfUploadPct}%)...`
                      : 'Enviar PDF'}
                  </span>
                </button>
              </div>

              {pdfError && <p className="text-xs text-danger">{pdfError}</p>}

              {pdfs.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {pdfs.map((pdf, idx) => (
                    <div
                      key={pdf.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-line-soft transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                        <span className="text-xs text-ink truncate">
                          {pdf.title}
                        </span>
                        {pdf.sizeLabel && (
                          <span className="text-[10px] font-mono text-ink-muted shrink-0">
                            ({pdf.sizeLabel})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {pdfs.length > 1 && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => movePdf(idx, 'up')}
                              className="p-1 rounded hover:bg-chip-hover text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                              title="Subir PDF"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === pdfs.length - 1}
                              onClick={() => movePdf(idx, 'down')}
                              className="p-1 rounded hover:bg-chip-hover text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                              title="Descer PDF"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setPdfs((prev) =>
                              prev.filter((item) => item.id !== pdf.id)
                            )
                          }
                          className="p-1 text-ink-muted hover:text-danger transition-colors cursor-pointer"
                          title="Remover PDF"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2.5 px-5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-line bg-surface">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || uploadingPdf}
              className="min-h-10 px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving
                ? 'Salvando...'
                : uploadingPdf
                  ? 'Aguarde o PDF...'
                  : editingLesson
                    ? 'Salvar'
                    : 'Criar Aula'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
