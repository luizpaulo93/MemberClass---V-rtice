import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  Trash2,
  FileText,
  ArrowUp,
  ArrowDown,
  Folder,
  HelpCircle,
} from 'lucide-react';
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
import {
  deletePdfFromFirestore,
  ensurePdfUrlChunked,
  uploadPdfFileToCloud,
} from '../utils/pdfStorage';
import { UploadDiagnosticAlert } from './UploadDiagnosticAlert';

interface LessonPopupModalProps {
  isOpen: boolean;
  editingLesson: Lesson | null;
  defaultIsFree?: boolean;
  defaultFolderId?: string;
  folders?: LessonFolder[];
  lessonFolders?: LessonFolder[];
  currentUserUid: string;
  onClose: () => void;
  onSaveLesson: (
    lesson: Omit<Lesson, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
}

export const LessonPopupModal: React.FC<LessonPopupModalProps> = ({
  isOpen,
  editingLesson,
  defaultIsFree = false,
  defaultFolderId = '',
  folders,
  lessonFolders: lessonFoldersProp,
  currentUserUid,
  onClose,
  onSaveLesson,
}) => {
  const lessonFolders = folders || lessonFoldersProp || [];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [youtubeInput, setYoutubeInput] = useState('');
  const [pdfs, setPdfs] = useState<PdfAttachment[]>([]);
  const [folderId, setFolderId] = useState<string>('');
  const [isFree, setIsFree] = useState(false);

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUploadError(null);
    setUploadProgress(0);
    if (editingLesson) {
      setTitle(editingLesson.title || '');
      setDescription(editingLesson.description || '');
      setYoutubeInput(
        hasLessonVideo(editingLesson.youtubeId) ? editingLesson.youtubeId : ''
      );
      setPdfs(editingLesson.pdfs || []);
      setFolderId(editingLesson.folderId || '');
      setIsFree(Boolean(editingLesson.isFree));
    } else {
      setTitle('');
      setDescription('');
      setYoutubeInput('');
      setPdfs([]);
      setFolderId(defaultFolderId || '');
      setIsFree(Boolean(defaultIsFree));
    }
  }, [isOpen, editingLesson, defaultIsFree, defaultFolderId]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    if (pdfs.length >= SCHEMA_LIMITS.MAX_PDFS) {
      setUploadError(
        `Limite máximo de ${SCHEMA_LIMITS.MAX_PDFS} PDFs por aula atingido.`
      );
      return;
    }

    setUploadingPdf(true);
    setUploadProgress(2);

    try {
      const { pdfUrl, pdfTitle, sizeLabel } = await uploadPdfFileToCloud(
        file,
        currentUserUid,
        (pct) => setUploadProgress(pct),
        isFree
      );
      setPdfs((prev) =>
        [
          ...prev,
          {
            id: generateSafeId('pdf'),
            title: pdfTitle,
            url: pdfUrl,
            sizeLabel,
          },
        ].slice(0, SCHEMA_LIMITS.MAX_PDFS)
      );
      setTitle((prevTitle) => (prevTitle.trim() ? prevTitle : pdfTitle));
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível enviar o arquivo PDF. Tente novamente.';
      setUploadError(msg);
    } finally {
      setUploadingPdf(false);
      setUploadProgress(0);
    }
  };

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

  const removePdf = (index: number) => {
    setPdfs((prev) => {
      const target = prev[index];
      if (target?.url && target.url.startsWith('chunked:')) {
        void deletePdfFromFirestore(target.url);
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const updatePdfTitle = (index: number, nextTitle: string) => {
    setPdfs((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, title: nextTitle } : item
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!title.trim()) {
      setUploadError('Informe o nome da aula antes de salvar.');
      titleInputRef.current?.focus();
      return;
    }

    const ytId = youtubeInput.trim() ? extractYoutubeId(youtubeInput) : '';
    const validPdfs = pdfs
      .filter((p) => p.title.trim() && p.url.trim())
      .slice(0, SCHEMA_LIMITS.MAX_PDFS);

    if (!ytId && validPdfs.length === 0) {
      setUploadError(
        'Adicione pelo menos um vídeo do YouTube ou um material em PDF.'
      );
      return;
    }

    setIsSaving(true);
    try {
      const isNew = !editingLesson;
      const id = editingLesson?.id || generateSafeId('lesson');

      const finalPdfs: PdfAttachment[] = [];
      for (const p of validPdfs) {
        const normalizedUrl = await ensurePdfUrlChunked(
          p.url.trim(),
          currentUserUid,
          Boolean(isFree)
        );
        finalPdfs.push({
          id: p.id || generateSafeId('pdf'),
          title: sanitizeString(
            p.title,
            SCHEMA_LIMITS.TITLE_MAX,
            'Material PDF'
          ),
          url: sanitizeString(normalizedUrl, SCHEMA_LIMITS.PDF_URL_MAX, ''),
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
          youtubeId: ytId,
          duration: editingLesson?.duration || '15:00',
          thumbnailUrl: editingLesson?.thumbnailUrl || 'preset:stadium',
          pdfs: finalPdfs,
          folderId: sanitizeString(folderId, 128, ''),
          ...(typeof editingLesson?.order === 'number'
            ? { order: editingLesson.order }
            : {}),
          isFree: Boolean(isFree),
          isPublished: true,
          authorId: currentUserUid,
        },
        isNew
      );
      onClose();
    } catch (err) {
      console.error('Erro ao salvar aula:', err);
      setUploadError(
        err instanceof Error && err.message
          ? err.message
          : 'Erro ao salvar a aula. Tente novamente.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      onClick={() => {
        if (!uploadingPdf && !isSaving) onClose();
      }}
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-[100dvh] max-h-[100dvh] w-full rounded-none sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl max-w-xl bg-surface border-0 sm:border border-line shadow-pop overflow-hidden flex flex-col my-auto"
      >
        <div className="px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-ink">
            {editingLesson ? 'Editar Aula' : 'Nova Aula'}
          </h3>
          <button
            type="button"
            disabled={uploadingPdf || isSaving}
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-chip-hover transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="p-6 space-y-4 overflow-y-auto flex-1"
        >
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Nome da Aula
            </label>
            <input
              ref={titleInputRef}
              type="text"
              maxLength={SCHEMA_LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (uploadError) setUploadError(null);
              }}
              placeholder="Ex: Aula 01 — Cinemática Escalar"
              className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Link ou ID do Vídeo no YouTube (Opcional se tiver PDF)
            </label>
            <input
              type="text"
              value={youtubeInput}
              onChange={(e) => {
                setYoutubeInput(e.target.value);
                if (uploadError) setUploadError(null);
              }}
              placeholder="Cole a URL do YouTube ou deixe em branco para aula só com PDF"
              className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft font-mono"
            />
          </div>

          {lessonFolders.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">
                Pasta da Aula (Opcional)
              </label>
              <div className="relative">
                <Folder className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                >
                  <option value="">Sem pasta (Geral)</option>
                  {lessonFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* PDFs Section */}
          <div className="p-4 rounded-xl bg-inset border border-line space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-ink">
                Materiais em PDF ({pdfs.length}/{SCHEMA_LIMITS.MAX_PDFS})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setUploadError((prev) =>
                      prev ? null : 'Failed to fetch (Diagnóstico Cloudflare R2 / CORS)'
                    )
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-surface hover:bg-chip-hover border border-line text-[11px] font-medium text-ink-2 inline-flex items-center gap-1 transition-colors cursor-pointer"
                  title="Ver diagnóstico de erro R2 / Copiar CORS JSON"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Diagnóstico R2 / CORS</span>
                </button>
                <label
                  className={`px-3 py-1.5 rounded-xl bg-chip hover:bg-chip-hover text-xs font-medium text-ink-2 inline-flex items-center gap-1.5 transition-colors ${
                    uploadingPdf || isSaving
                      ? 'opacity-60 pointer-events-none'
                      : 'cursor-pointer'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-brand-accent" />
                  <span>
                    {uploadingPdf
                      ? `Enviando (${uploadProgress}%)...`
                      : 'Enviar PDF'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    disabled={uploadingPdf || isSaving}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {uploadingPdf && (
              <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-200"
                  style={{ width: `${Math.max(5, uploadProgress)}%` }}
                />
              </div>
            )}

            {uploadError && (
              <UploadDiagnosticAlert
                error={uploadError}
                onDismiss={() => setUploadError(null)}
              />
            )}

            {pdfs.length > 0 && (
              <div className="space-y-2">
                {pdfs.map((pdf, idx) => (
                  <div
                    key={pdf.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface border border-line-soft"
                  >
                    <FileText className="w-4 h-4 text-brand-accent shrink-0" />
                    <input
                      type="text"
                      value={pdf.title}
                      onChange={(e) => updatePdfTitle(idx, e.target.value)}
                      placeholder="Título do PDF"
                      className="flex-1 bg-transparent text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 rounded px-1"
                    />
                    <span className="text-xs font-mono tabular-nums text-ink-muted shrink-0">
                      {pdf.sizeLabel}
                    </span>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {pdfs.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => movePdf(idx, 'up')}
                            className="p-1 text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Subir PDF"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pdfs.length - 1}
                            onClick={() => movePdf(idx, 'down')}
                            className="p-1 text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                            title="Descer PDF"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removePdf(idx)}
                        className="p-1 text-ink-muted hover:text-rose-400 transition-colors cursor-pointer"
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

          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Descrição / Resumo (Opcional)
            </label>
            <textarea
              rows={3}
              maxLength={SCHEMA_LIMITS.LESSON_DESC_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anotações, fórmulas ou resumo da aula..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-ink-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="w-4 h-4 rounded accent-[#2563eb]"
            />
            Disponibilizar esta aula gratuitamente (Aulas Grátis)
          </label>

          <div className="flex items-center gap-3 pt-3 border-t border-line">
            <button
              type="submit"
              disabled={isSaving || uploadingPdf}
              className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving
                ? 'Salvando...'
                : uploadingPdf
                  ? `Aguarde o PDF (${uploadProgress}%)...`
                  : editingLesson
                    ? 'Salvar Alterações'
                    : 'Criar Aula'}
            </button>
            <button
              type="button"
              disabled={isSaving || uploadingPdf}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
