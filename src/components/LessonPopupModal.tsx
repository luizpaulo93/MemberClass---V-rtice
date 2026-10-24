import React, { useEffect, useRef, useState } from 'react';
import { X, Trash2, FileText, Upload, Folder } from 'lucide-react';
import {
  Lesson,
  LessonFolder,
  PdfAttachment,
  SCHEMA_LIMITS,
  IMAGE_DIMENSIONS,
  sanitizeString,
  generateSafeId,
  extractYoutubeId,
  hasLessonVideo,
  processAndResizeImageFile,
} from '../types';
import { CoverArtwork } from './CoverArtwork';
import { uploadPdfFileToCloud } from '../utils/pdfStorage';

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

  useEffect(() => {
    if (!isOpen) return;
    setPdfError(null);
    if (editingLesson) {
      setTitle(editingLesson.title);
      setYoutubeInput(
        hasLessonVideo(editingLesson.youtubeId)
          ? `https://youtu.be/${editingLesson.youtubeId}`
          : ''
      );
      setDescription(editingLesson.description || '');
      setThumbnailUrl(editingLesson.thumbnailUrl || 'preset:stadium');
      setPdfs(editingLesson.pdfs || []);
      setFolderId(editingLesson.folderId || defaultFolderId || '');
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

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const dataUrl = await processAndResizeImageFile(
        file,
        IMAGE_DIMENSIONS.LESSON_COVER.targetWidth,
        IMAGE_DIMENSIONS.LESSON_COVER.targetHeight
      );
      setThumbnailUrl(dataUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingImg(false);
      e.target.value = '';
    }
  };

  const handleUploadLocalPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    setUploadingPdf(true);
    setPdfUploadPct(5);
    setPdfError(null);
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const uploaded = await uploadPdfFileToCloud(
          file,
          currentUserUid,
          (pct) => {
            const overall = Math.round(
              ((i + pct / 100) / selectedFiles.length) * 100
            );
            setPdfUploadPct(overall);
          }
        );
        const item: PdfAttachment = {
          id: generateSafeId('pdf'),
          title: uploaded.pdfTitle,
          url: uploaded.pdfUrl,
          sizeLabel: uploaded.sizeLabel,
        };
        setPdfs((prev) => [...prev.slice(0, SCHEMA_LIMITS.MAX_PDFS - 1), item]);
      }
    } catch (err) {
      console.error('Erro ao subir PDF da aula:', err);
      setPdfError('Não foi possível enviar o PDF. Tente novamente.');
    } finally {
      setUploadingPdf(false);
      setPdfUploadPct(0);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || uploadingPdf) return;
    setIsSaving(true);
    try {
      const isNew = !editingLesson;
      const id = editingLesson?.id || generateSafeId('lesson');
      await onSaveLesson(
        {
          id,
          title: sanitizeString(title, SCHEMA_LIMITS.TITLE_MAX, 'Aula'),
          description: sanitizeString(description, SCHEMA_LIMITS.LESSON_DESC_MAX, ''),
          youtubeId: extractYoutubeId(youtubeInput),
          duration: editingLesson?.duration || '15:00',
          thumbnailUrl: sanitizeString(
            thumbnailUrl.trim() || 'preset:stadium',
            SCHEMA_LIMITS.URL_MAX,
            'preset:stadium'
          ),
          pdfs: pdfs.slice(0, SCHEMA_LIMITS.MAX_PDFS),
          folderId: sanitizeString(folderId, 128, ''),
          isFree: editingLesson ? editingLesson.isFree : Boolean(defaultIsFree),
          isPublished: true,
          authorId: editingLesson?.authorId || currentUserUid,
        },
        isNew
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const activeFolderObj = folders.find((f) => f.id === folderId);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0d1527] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">
              {editingLesson
                ? 'Editar Aula'
                : defaultIsFree
                  ? 'Criar Aula Gratuita'
                  : 'Criar Aula'}
            </h3>
            {activeFolderObj && (
              <p className="text-[11px] text-blue-300 font-medium flex items-center gap-1 mt-0.5 truncate">
                <Folder className="w-3 h-3 shrink-0" />
                <span>Pasta: {activeFolderObj.name}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {folders.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Pasta da aula
              </label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-[#3b82f6]"
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
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Nome da aula
            </label>
            <input
              type="text"
              required
              maxLength={SCHEMA_LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o nome da aula"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-sm text-white focus:outline-none focus:border-[#3b82f6]"
            />
          </div>

          {/* 2. Link do Vídeo (Opcional) */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Link do vídeo (opcional)
            </label>
            <input
              type="text"
              value={youtubeInput}
              onChange={(e) => setYoutubeInput(e.target.value)}
              placeholder="Cole o link do vídeo (ou deixe em branco para postar só PDF)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-sm text-white focus:outline-none focus:border-[#3b82f6]"
            />
          </div>

          {/* 3. Texto ou Link */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Texto ou link
            </label>
            <textarea
              rows={3}
              maxLength={SCHEMA_LIMITS.LESSON_DESC_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Texto ou link complementar (opcional)"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-sm text-white focus:outline-none focus:border-[#3b82f6]"
            />
          </div>

          {/* 4. Imagem da Aula (Upload direto da memória do aparelho) */}
          <div className="flex items-center justify-between gap-4 p-3.5 rounded-xl bg-[#0d0b14] border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 aspect-[3/4] rounded-lg overflow-hidden border border-white/15 shrink-0 bg-[#141220]">
                <CoverArtwork
                  src={thumbnailUrl || 'preset:stadium'}
                  title={title || 'Capa'}
                  className="w-full h-full"
                  showBottomPurpleBar={true}
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-200">
                  Imagem da capa
                </span>
                <span className="block text-[11px] font-mono text-slate-500">
                  600 × 800 px
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {thumbnailUrl && !thumbnailUrl.startsWith('preset:') && (
                <button
                  type="button"
                  onClick={() => setThumbnailUrl('')}
                  className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition-colors cursor-pointer"
                  title="Remover imagem"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <label className="px-3.5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingImg ? 'Carregando...' : 'Enviar Imagem'}</span>
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
          <div className="p-3.5 rounded-xl bg-[#0d0b14] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">PDFs</span>

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
                className="px-3.5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer inline-flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {uploadingPdf ? `Enviando (${pdfUploadPct}%)...` : 'Enviar PDF'}
                </span>
              </button>
            </div>

            {pdfError && (
              <p className="text-[11px] text-rose-400">{pdfError}</p>
            )}

            {pdfs.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#141220] border border-white/5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="text-xs text-slate-200 truncate">{pdf.title}</span>
                      {pdf.sizeLabel && (
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          ({pdf.sizeLabel})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPdfs((prev) => prev.filter((item) => item.id !== pdf.id))
                      }
                      className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || uploadingPdf}
              className="px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
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
