import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Upload,
  Trash2,
  Unlock,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Simulado,
  EnemArea,
  ENEM_AREA_LABELS,
  BUBBLE_OPTIONS,
  BubbleOption,
  SCHEMA_LIMITS,
  sanitizeString,
  generateSafeId,
} from '../types';
import {
  runWithConcurrency,
  uploadPdfFileToCloud,
} from '../utils/pdfStorage';

interface SimuladoEditorWindowProps {
  editingSimulado: Simulado | null;
  onCancel: () => void;
  onSaveSimulado: (
    simulado: Omit<Simulado, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  currentUserUid: string;
}

export const SimuladoEditorWindow: React.FC<SimuladoEditorWindowProps> = ({
  editingSimulado,
  onCancel,
  onSaveSimulado,
  currentUserUid,
}) => {
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState(false);
  const [area, setArea] = useState<EnemArea>('MT');
  const [questionCount, setQuestionCount] = useState<number>(45);
  const [isFreeTime, setIsFreeTime] = useState<boolean>(true);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number>(180);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pdfTitle, setPdfTitle] = useState<string>('');
  const [pdfSizeLabel, setPdfSizeLabel] = useState<string>('');
  const [isUploadingPdf, setIsUploadingPdf] = useState<boolean>(false);
  const [pdfUploadProgress, setPdfUploadProgress] = useState<number>(0);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const [answerKey, setAnswerKey] = useState<string>('A'.repeat(45));
  const [isLoadingKey, setIsLoadingKey] = useState<boolean>(false);
  const [keyDirty, setKeyDirty] = useState<boolean>(false);
  const [resultsReleased, setResultsReleased] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleError(false);
    if (editingSimulado) {
      setTitle(editingSimulado.title);
      setArea(editingSimulado.area);
      setQuestionCount(editingSimulado.questionCount);
      setIsFreeTime(editingSimulado.timeLimitMinutes === 0);
      setTimeLimitMinutes(
        editingSimulado.timeLimitMinutes > 0
          ? editingSimulado.timeLimitMinutes
          : 180
      );
      setPdfUrl(editingSimulado.pdfUrl || '');
      setPdfTitle(editingSimulado.pdfTitle || '');
      setPdfSizeLabel('');
      setPdfUploadError(null);
      setResultsReleased(Boolean(editingSimulado.resultsReleased));
      setKeyDirty(false);
      setIsLoadingKey(true);

      let cancelled = false;
      getDoc(doc(db, 'simuladoKeys', editingSimulado.id))
        .then((snap) => {
          if (cancelled) return;
          const loadedKey =
            snap.exists() && typeof snap.data()?.answerKey === 'string'
              ? snap.data().answerKey
              : editingSimulado.answerKey || '';
          setAnswerKey(
            (loadedKey || 'A'.repeat(editingSimulado.questionCount))
              .padEnd(editingSimulado.questionCount, 'A')
              .slice(0, editingSimulado.questionCount)
          );
        })
        .catch(() => {
          if (cancelled) return;
          setAnswerKey(
            (editingSimulado.answerKey || 'A'.repeat(editingSimulado.questionCount))
              .padEnd(editingSimulado.questionCount, 'A')
              .slice(0, editingSimulado.questionCount)
          );
        })
        .finally(() => {
          if (!cancelled) setIsLoadingKey(false);
        });

      return () => {
        cancelled = true;
      };
    } else {
      setTitle('');
      setArea('MT');
      setQuestionCount(45);
      setIsFreeTime(true);
      setTimeLimitMinutes(180);
      setPdfUrl('');
      setPdfTitle('');
      setPdfSizeLabel('');
      setPdfUploadError(null);
      setAnswerKey('A'.repeat(45));
      setIsLoadingKey(false);
      setKeyDirty(true);
      setResultsReleased(false);
    }
  }, [editingSimulado]);

  const handleQuestionCountChange = (nextVal: number) => {
    const clamped = Math.max(
      1,
      Math.min(SCHEMA_LIMITS.MAX_QUESTIONS, nextVal || 1)
    );
    setQuestionCount(clamped);
    setAnswerKey((prev) => prev.padEnd(clamped, 'A').slice(0, clamped));
    setKeyDirty(true);
  };

  const handleSetOfficialBubble = (qIndex: number, opt: BubbleOption) => {
    const chars = answerKey
      .padEnd(questionCount, 'A')
      .slice(0, questionCount)
      .split('');
    if (chars[qIndex] === opt) return;
    chars[qIndex] = opt;
    setAnswerKey(chars.join(''));
    setKeyDirty(true);
  };

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const filesToUpload = Array.from(fileList);
    e.target.value = '';
    setIsUploadingPdf(true);
    setPdfUploadProgress(1);
    setPdfUploadError(null);

    const progressByFile = new Array<number>(filesToUpload.length).fill(0);
    const resultsByIndex = new Array<{
      pdfUrl: string;
      pdfTitle: string;
      sizeLabel: string;
    } | null>(filesToUpload.length).fill(null);
    const failedNames: string[] = [];

    const updateOverallProgress = () => {
      const sum = progressByFile.reduce((acc, val) => acc + val, 0);
      const avg = Math.round(sum / filesToUpload.length);
      setPdfUploadProgress(Math.max(1, Math.min(100, avg)));
    };

    try {
      await runWithConcurrency(filesToUpload, 3, async (file, index) => {
        try {
          const uploaded = await uploadPdfFileToCloud(
            file,
            currentUserUid,
            (pct) => {
              progressByFile[index] = pct;
              updateOverallProgress();
            }
          );
          progressByFile[index] = 100;
          updateOverallProgress();
          resultsByIndex[index] = uploaded;
        } catch (err) {
          console.error(`Erro ao subir PDF do simulado "${file.name}":`, err);
          progressByFile[index] = 100;
          updateOverallProgress();
          failedNames.push(file.name);
        }
      });

      const validUploaded = resultsByIndex.filter(
        (
          item
        ): item is { pdfUrl: string; pdfTitle: string; sizeLabel: string } =>
          item !== null
      );
      if (validUploaded.length > 0) {
        const chosen = validUploaded[validUploaded.length - 1];
        setPdfUrl(chosen.pdfUrl);
        setPdfTitle(chosen.pdfTitle);
        setPdfSizeLabel(chosen.sizeLabel);
      }

      if (failedNames.length > 0) {
        setPdfUploadError(
          `${failedNames.length} arquivo(s) não puderam ser enviados: ${failedNames.join(', ')}`
        );
      }
    } finally {
      setIsUploadingPdf(false);
      setPdfUploadProgress(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploadingPdf || isLoadingKey) return;
    if (!title.trim()) {
      setTitleError(true);
      titleInputRef.current?.focus();
      return;
    }
    setIsSaving(true);
    try {
      const isNew = !editingSimulado;
      const id = editingSimulado?.id || generateSafeId('simulado');
      const normalizedKey = answerKey
        .replace(/[^ABCDE]/g, 'A')
        .padEnd(questionCount, 'A')
        .slice(0, questionCount);

      await onSaveSimulado(
        {
          id,
          title: sanitizeString(title, SCHEMA_LIMITS.TITLE_MAX, 'Simulado'),
          area,
          questionCount,
          timeLimitMinutes: isFreeTime
            ? 0
            : Math.max(1, Math.min(600, Math.round(timeLimitMinutes))),
          pdfUrl: sanitizeString(pdfUrl, SCHEMA_LIMITS.URL_MAX, ''),
          pdfTitle: pdfUrl
            ? sanitizeString(pdfTitle, SCHEMA_LIMITS.TITLE_MAX, 'Simulado.pdf')
            : '',
          answerKey: isNew || keyDirty ? normalizedKey : '',
          resultsReleased,
          isPublished: true,
          authorId: editingSimulado?.authorId || currentUserUid,
        },
        isNew
      );
      onCancel();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto p-5 md:p-6 pb-24 sm:pb-6 rounded-2xl bg-surface border border-line shadow-card space-y-5"
    >
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-line">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-brand-soft" />
          Voltar
        </button>

        <h3 className="text-sm font-bold text-ink">
          {editingSimulado ? 'Editar Simulado' : 'Novo Simulado'}
        </h3>
      </div>

      {/* Nome + Área ENEM */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-ink-2 mb-1.5">
            Nome do simulado
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
            placeholder="Ex: Simulado 01 — Matemática & Física"
            className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border text-sm text-ink focus:outline-none ${
              titleError
                ? 'border-danger focus:border-danger'
                : 'border-line focus:border-brand-soft'
            }`}
          />
          {titleError && (
            <p className="text-xs text-danger mt-1 font-medium">
              Informe o nome do simulado.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-2 mb-1.5">
            Área TRI (ENEM 2025)
          </label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as EnemArea)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
          >
            {(Object.keys(ENEM_AREA_LABELS) as EnemArea[]).map((key) => (
              <option key={key} value={key}>
                {ENEM_AREA_LABELS[key].short} — {ENEM_AREA_LABELS[key].full}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Número de Questões + Tempo de Prova */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-ink-2 mb-1.5">
            Número de questões
          </label>
          <input
            type="number"
            min={1}
            max={180}
            value={questionCount}
            onChange={(e) => handleQuestionCountChange(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink font-mono tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-2 mb-1.5">
            Modo de tempo
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsFreeTime(true)}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                isFreeTime
                  ? 'bg-brand border-brand text-white'
                  : 'bg-inset border-line text-ink-muted hover:text-ink'
              }`}
            >
              Tempo Livre
            </button>
            <button
              type="button"
              onClick={() => setIsFreeTime(false)}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                !isFreeTime
                  ? 'bg-brand border-brand text-white'
                  : 'bg-inset border-line text-ink-muted hover:text-ink'
              }`}
            >
              Definir Tempo
            </button>
          </div>
        </div>

        {!isFreeTime && (
          <div>
            <label className="block text-xs font-medium text-ink-2 mb-1.5">
              Tempo limite (minutos)
            </label>
            <input
              type="number"
              min={1}
              max={600}
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-sm text-ink font-mono tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
            />
          </div>
        )}
      </div>

      {/* PDF Opcional + Liberação de Notas TRI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-center gap-2 transition-colors ${
            pdfUrl
              ? 'bg-surface-2 border-brand-soft/50'
              : 'bg-inset border-line'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-xs font-medium text-ink">
                PDF da Prova (Opcional)
              </span>
              {isUploadingPdf ? (
                <span className="mt-0.5 block text-xs font-semibold text-accent-300">
                  Enviando PDF ({pdfUploadProgress}%)...
                </span>
              ) : pdfUrl ? (
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-success font-medium truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-success" />
                  <span className="truncate">{pdfTitle || 'Simulado.pdf'}</span>
                  {pdfSizeLabel && (
                    <span className="text-[10px] font-mono text-ink-muted shrink-0">
                      ({pdfSizeLabel})
                    </span>
                  )}
                </span>
              ) : (
                <span className="block text-xs text-ink-muted">
                  Somente cartão de bolhas
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {pdfUrl && !isUploadingPdf && (
                <button
                  type="button"
                  onClick={() => {
                    setPdfUrl('');
                    setPdfTitle('');
                    setPdfSizeLabel('');
                  }}
                  className="p-2 rounded-lg text-ink-muted hover:text-danger hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Remover PDF"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={handleUploadPdf}
                className="hidden"
              />

              <button
                type="button"
                disabled={isUploadingPdf}
                onClick={() => pdfInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">
                  {isUploadingPdf
                    ? `${pdfUploadProgress}%`
                    : pdfUrl
                      ? 'Trocar PDF'
                      : 'Enviar PDF'}
                </span>
              </button>
            </div>
          </div>

          {pdfUploadError && (
            <span className="text-xs text-danger">{pdfUploadError}</span>
          )}
        </div>

        <div className="p-3.5 rounded-xl bg-inset border border-line flex items-center justify-between gap-3">
          <div>
            <span className="block text-xs font-medium text-ink">
              Notas TRI para os Alunos
            </span>
            <span className="block text-xs text-ink-muted">
              {resultsReleased ? 'Visíveis aos alunos' : 'Ocultas até liberar'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setResultsReleased((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              resultsReleased
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-success'
                : 'bg-chip text-ink-2'
            }`}
          >
            {resultsReleased ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                Liberadas
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                Bloqueadas
              </>
            )}
          </button>
        </div>
      </div>

      {/* Gabarito Oficial (Bolhas) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink-2">
            Gabarito Oficial ({questionCount} questões)
          </span>
        </div>

        {isLoadingKey ? (
          <div className="p-6 rounded-xl bg-inset border border-line text-center text-xs font-medium text-ink-muted">
            Carregando gabarito salvo...
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto p-3 rounded-xl bg-inset border border-line grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {Array.from({ length: questionCount }, (_, idx) => {
              const currentAns = answerKey[idx] || 'A';
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line-soft"
                >
                  <span className="text-xs font-mono font-bold text-ink-2 tabular-nums w-7">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-1">
                    {BUBBLE_OPTIONS.map((opt) => {
                      const active = currentAns === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSetOfficialBubble(idx, opt)}
                          className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft ${
                            active
                              ? 'bg-brand text-white'
                              : 'bg-inset text-ink-muted hover:text-ink border border-line'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving || isUploadingPdf || isLoadingKey}
          className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
        >
          {isSaving
            ? 'Salvando...'
            : isUploadingPdf
              ? 'Aguarde o PDF...'
              : isLoadingKey
                ? 'Carregando gabarito...'
                : 'Salvar Simulado'}
        </button>
      </div>
    </form>
  );
};
