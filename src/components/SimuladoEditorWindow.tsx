import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Unlock,
  Lock,
  CheckCircle2,
} from 'lucide-react';
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
import { uploadPdfFileToCloud } from '../utils/pdfStorage';

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
  const [resultsReleased, setResultsReleased] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
      setAnswerKey(
        (editingSimulado.answerKey || 'A'.repeat(editingSimulado.questionCount))
          .padEnd(editingSimulado.questionCount, 'A')
          .slice(0, editingSimulado.questionCount)
      );
      setResultsReleased(Boolean(editingSimulado.resultsReleased));
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
      setResultsReleased(false);
    }
  }, [editingSimulado]);

  const handleQuestionCountChange = (nextVal: number) => {
    const clamped = Math.max(1, Math.min(SCHEMA_LIMITS.MAX_QUESTIONS, nextVal || 1));
    setQuestionCount(clamped);
    setAnswerKey((prev) => prev.padEnd(clamped, 'A').slice(0, clamped));
  };

  const handleSetOfficialBubble = (qIndex: number, opt: BubbleOption) => {
    const chars = answerKey
      .padEnd(questionCount, 'A')
      .slice(0, questionCount)
      .split('');
    chars[qIndex] = opt;
    setAnswerKey(chars.join(''));
  };

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPdf(true);
    setPdfUploadProgress(5);
    setPdfUploadError(null);
    try {
      const uploaded = await uploadPdfFileToCloud(
        file,
        currentUserUid,
        (pct) => setPdfUploadProgress(pct)
      );
      setPdfUrl(uploaded.pdfUrl);
      setPdfTitle(uploaded.pdfTitle);
      setPdfSizeLabel(uploaded.sizeLabel);
    } catch (err) {
      console.error('Erro ao subir PDF do simulado:', err);
      setPdfUploadError('Não foi possível enviar este PDF. Tente novamente.');
    } finally {
      setIsUploadingPdf(false);
      setPdfUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isUploadingPdf) return;
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
          answerKey: normalizedKey,
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
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto p-5 md:p-6 rounded-2xl bg-[#141220] border border-white/10 space-y-5"
    >
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/10">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#3b82f6]" />
          Voltar
        </button>

        <h3 className="text-sm font-bold text-white">
          {editingSimulado ? 'Editar Simulado' : 'Novo Simulado'}
        </h3>
      </div>

      {/* Nome + Área ENEM */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Nome do simulado
          </label>
          <input
            type="text"
            required
            maxLength={SCHEMA_LIMITS.TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Simulado 01 — Matemática & Física"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-sm text-white focus:outline-none focus:border-[#3b82f6]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Área TRI (ENEM 2025)
          </label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as EnemArea)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-sm text-white focus:outline-none focus:border-[#3b82f6]"
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
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Número de questões
          </label>
          <input
            type="number"
            min={1}
            max={180}
            required
            value={questionCount}
            onChange={(e) => handleQuestionCountChange(Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-[#3b82f6]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Modo de tempo
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsFreeTime(true)}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                isFreeTime
                  ? 'bg-[#2563eb] border-[#2563eb] text-white'
                  : 'bg-[#0d0b14] border-white/10 text-slate-400'
              }`}
            >
              Tempo Livre
            </button>
            <button
              type="button"
              onClick={() => setIsFreeTime(false)}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                !isFreeTime
                  ? 'bg-[#2563eb] border-[#2563eb] text-white'
                  : 'bg-[#0d0b14] border-white/10 text-slate-400'
              }`}
            >
              Definir Tempo
            </button>
          </div>
        </div>

        {!isFreeTime && (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tempo limite (minutos)
            </label>
            <input
              type="number"
              min={1}
              max={600}
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d0b14] border border-white/10 text-sm text-white font-mono focus:outline-none focus:border-[#3b82f6]"
            />
          </div>
        )}
      </div>

      {/* PDF Opcional + Liberação de Notas TRI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-center gap-2 transition-colors ${
            pdfUrl
              ? 'bg-[#19142b] border-[#3b82f6]/50'
              : 'bg-[#0d0b14] border-white/10'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-xs font-medium text-slate-200">
                PDF da Prova (Opcional)
              </span>
              {isUploadingPdf ? (
                <span className="mt-0.5 block text-xs font-semibold text-blue-300">
                  Enviando PDF ({pdfUploadProgress}%)...
                </span>
              ) : pdfUrl ? (
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-300 font-medium truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">{pdfTitle || 'Simulado.pdf'}</span>
                  {pdfSizeLabel && (
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      ({pdfSizeLabel})
                    </span>
                  )}
                </span>
              ) : (
                <span className="block text-[11px] text-slate-500">
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
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
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
                className="px-3.5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
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
            <span className="text-[11px] text-rose-400">{pdfUploadError}</span>
          )}
        </div>

        <div className="p-3.5 rounded-xl bg-[#0d0b14] border border-white/10 flex items-center justify-between gap-3">
          <div>
            <span className="block text-xs font-medium text-slate-200">
              Notas TRI para os Alunos
            </span>
            <span className="block text-[11px] text-slate-500">
              {resultsReleased ? 'Visíveis aos alunos' : 'Ocultas até liberar'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setResultsReleased((prev) => !prev)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              resultsReleased
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                : 'bg-white/10 text-slate-300'
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
          <span className="text-xs font-medium text-slate-300">
            Gabarito Oficial ({questionCount} questões)
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto p-3 rounded-xl bg-[#0d0b14] border border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: questionCount }, (_, idx) => {
            const currentAns = answerKey[idx] || 'A';
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#141220] border border-white/5"
              >
                <span className="text-xs font-mono font-bold text-slate-300 tabular-nums w-7">
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
                        className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-[#070b14] text-slate-400 hover:text-white border border-white/10'
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
      </div>

      <div className="flex items-center justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving || isUploadingPdf}
          className="px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isSaving ? 'Salvando...' : isUploadingPdf ? 'Aguarde o PDF...' : 'Salvar Simulado'}
        </button>
      </div>
    </form>
  );
};
