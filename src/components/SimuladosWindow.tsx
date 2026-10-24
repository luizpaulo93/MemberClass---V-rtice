import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Download,
  FileText,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
  Plus,
  Edit3,
  Trash2,
  Play,
  Users,
  ChevronRight,
  Trophy,
} from 'lucide-react';
import {
  Simulado,
  SimuladoSubmission,
  BUBBLE_OPTIONS,
  BubbleOption,
  ENEM_AREA_LABELS,
  PdfAttachment,
} from '../types';
import {
  evaluateSimuladoCohort,
  formatDurationClock,
  ClassSimuladoSummary,
  ItemDifficultyTier,
} from '../utils/triEngine';
import { PerformanceChart, PerformanceChartPoint } from './PerformanceChart';
import { triggerPdfDownload } from '../utils/pdfStorage';

type QuestionSortOrder = 'exam_order' | 'difficulty_asc';

interface QuestionOrderSlideToggleProps {
  value: QuestionSortOrder;
  onChange: (next: QuestionSortOrder) => void;
}

const QuestionOrderSlideToggle: React.FC<QuestionOrderSlideToggleProps> = ({
  value,
  onChange,
}) => {
  const isDifficulty = value === 'difficulty_asc';
  return (
    <div
      role="group"
      aria-label="Ordenar questões"
      className="relative inline-grid grid-cols-2 p-1 rounded-full bg-surface border border-line select-none shrink-0"
    >
      {/* Sliding active pill */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-brand shadow-glow-sm transition-transform duration-200 ease-out ${
          isDifficulty ? 'translate-x-full' : 'translate-x-0'
        }`}
      />

      <button
        type="button"
        onClick={() => onChange('exam_order')}
        className={`relative z-10 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors text-center whitespace-nowrap cursor-pointer ${
          !isDifficulty
            ? 'text-white'
            : 'text-ink-2 hover:text-ink'
        }`}
      >
        Ordem de Prova
      </button>

      <button
        type="button"
        onClick={() => onChange('difficulty_asc')}
        className={`relative z-10 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors text-center whitespace-nowrap cursor-pointer ${
          isDifficulty
            ? 'text-white'
            : 'text-ink-2 hover:text-ink'
        }`}
      >
        Fácil → Difícil
      </button>
    </div>
  );
};

function getTierLabel(tier: ItemDifficultyTier): {
  label: string;
  textColor: string;
} {
  if (tier === 'easy') {
    return {
      label: 'Fácil',
      textColor: 'text-emerald-400 [html.theme-light_&]:text-emerald-700',
    };
  }
  if (tier === 'medium') {
    return {
      label: 'Média',
      textColor: 'text-amber-300 [html.theme-light_&]:text-amber-700',
    };
  }
  return {
    label: 'Difícil',
    textColor: 'text-rose-400 [html.theme-light_&]:text-rose-700',
  };
}

interface LiveExamClockProps {
  startedAtMs: number;
  timeLimitMinutes: number;
}

const LiveExamClock: React.FC<LiveExamClockProps> = ({
  startedAtMs,
  timeLimitMinutes,
}) => {
  const [elapsedSec, setElapsedSec] = useState<number>(() =>
    startedAtMs > 0 ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)) : 0
  );

  useEffect(() => {
    if (!startedAtMs) return;
    const updateClock = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, [startedAtMs]);

  const timeLimitSec = timeLimitMinutes > 0 ? timeLimitMinutes * 60 : 0;
  const isOverTime = timeLimitSec > 0 && elapsedSec >= timeLimitSec;

  return (
    <div
      className={`px-3.5 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold tabular-nums ${
        isOverTime
          ? 'bg-rose-500/15 border-rose-500/40 text-rose-400 [html.theme-light_&]:text-rose-700'
          : 'bg-inset border-brand-soft/40 text-ink'
      }`}
    >
      <Clock className="w-4 h-4 text-brand-soft" />
      <span>{formatDurationClock(elapsedSec)}</span>
      {timeLimitSec > 0 && (
        <span className="text-ink-muted font-medium">
          / {formatDurationClock(timeLimitSec)}
        </span>
      )}
    </div>
  );
};

interface SimuladosWindowProps {
  simulados: Simulado[];
  submissions: SimuladoSubmission[];
  currentUserUid: string;
  currentUserName: string;
  currentUserEmail: string;
  isAdmin: boolean;
  isBlockedUser: boolean;
  onStartOrUpdateSubmission: (
    simulado: Simulado,
    answersString: string,
    startedAtMs: number,
    finishNow: boolean
  ) => Promise<void>;
  onToggleReleaseResults?: (simulado: Simulado) => Promise<void>;
  onOpenCreateSimulado?: () => void;
  onOpenEditSimulado?: (simulado: Simulado) => void;
  onDeleteSimulado?: (simuladoId: string) => Promise<void>;
  onOpenPdfReader: (pdf: PdfAttachment) => void;
}

export const SimuladosWindow: React.FC<SimuladosWindowProps> = ({
  simulados,
  submissions,
  currentUserUid,
  isAdmin,
  isBlockedUser,
  onStartOrUpdateSubmission,
  onToggleReleaseResults,
  onOpenCreateSimulado,
  onOpenEditSimulado,
  onDeleteSimulado,
  onOpenPdfReader,
}) => {
  const [viewMode, setViewMode] = useState<
    'list' | 'taking' | 'student_result' | 'admin_cohort'
  >('list');
  const [selectedSimuladoId, setSelectedSimuladoId] = useState<string | null>(null);
  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(null);
  const [questionSortOrder, setQuestionSortOrder] =
    useState<QuestionSortOrder>('exam_order');

  // Local bubble state while taking an exam
  const [localAnswers, setLocalAnswers] = useState<string>('');
  const [activeStartMs, setActiveStartMs] = useState<number>(0);
  const [isFinishing, setIsFinishing] = useState(false);

  const autoSaveTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef<{
    simulado: Simulado | null;
    answers: string;
    startMs: number;
    dirty: boolean;
  }>({
    simulado: null,
    answers: '',
    startMs: 0,
    dirty: false,
  });

  // Precompute cohort TRI & Pedagogical Coherence evaluations for all existing simulados
  const cohortSummaries = useMemo(() => {
    const map: Record<string, ClassSimuladoSummary> = {};
    simulados.forEach((sim) => {
      map[sim.id] = evaluateSimuladoCohort(sim, submissions);
    });
    return map;
  }, [simulados, submissions]);

  const activeSimulado = useMemo(
    () => simulados.find((s) => s.id === selectedSimuladoId) || null,
    [simulados, selectedSimuladoId]
  );

  // If the currently viewed simulado was deleted, return cleanly to list view
  useEffect(() => {
    if (selectedSimuladoId && !activeSimulado && viewMode !== 'list') {
      setViewMode('list');
      setSelectedSimuladoId(null);
    }
  }, [selectedSimuladoId, activeSimulado, viewMode]);

  const mySubmissionsBySimulado = useMemo(() => {
    const map: Record<string, SimuladoSubmission> = {};
    submissions
      .filter((s) => s.userId === currentUserUid)
      .forEach((s) => {
        map[s.simuladoId] = s;
      });
    return map;
  }, [submissions, currentUserUid]);

  const flushPendingAutoSave = async () => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const draft = latestDraftRef.current;
    if (draft.dirty && draft.simulado) {
      draft.dirty = false;
      try {
        await onStartOrUpdateSubmission(
          draft.simulado,
          draft.answers,
          draft.startMs,
          false
        );
      } catch (err) {
        console.error('Flush auto-save error:', err);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      const draft = latestDraftRef.current;
      if (draft.dirty && draft.simulado) {
        draft.dirty = false;
        onStartOrUpdateSubmission(
          draft.simulado,
          draft.answers,
          draft.startMs,
          false
        ).catch(() => {});
      }
    };
  }, []);

  // Start or resume a Simulado (Student only)
  const handleEnterExam = async (sim: Simulado) => {
    const existingSub = mySubmissionsBySimulado[sim.id];
    const storageKey = `vertice_sim_${sim.id}_${currentUserUid}`;
    let savedLocal: { answersString?: string; startedAtMs?: number } | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) savedLocal = JSON.parse(raw);
    } catch {
      // ignore storage errors
    }

    const blankStr = '-'.repeat(sim.questionCount);
    const rawAnswers = existingSub
      ? existingSub.answersString
      : savedLocal?.answersString || blankStr;
    const normalizedAnswers = rawAnswers
      .padEnd(sim.questionCount, '-')
      .slice(0, sim.questionCount);

    const startMs = existingSub?.startedAtMs || savedLocal?.startedAtMs || Date.now();

    setSelectedSimuladoId(sim.id);
    setLocalAnswers(normalizedAnswers);
    setActiveStartMs(startMs);
    latestDraftRef.current = {
      simulado: sim,
      answers: normalizedAnswers,
      startMs,
      dirty: false,
    };
    setViewMode('taking');

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ answersString: normalizedAnswers, startedAtMs: startMs })
      );
    } catch {
      // ignore
    }

    if (!existingSub) {
      await onStartOrUpdateSubmission(sim, normalizedAnswers, startMs, false);
    }
  };

  // Mark or change a bubble -> instant local + localStorage update, debounced Firestore sync
  const handleSelectBubble = (questionIdx: number, opt: BubbleOption) => {
    if (!activeSimulado) return;
    const chars = localAnswers
      .padEnd(activeSimulado.questionCount, '-')
      .slice(0, activeSimulado.questionCount)
      .split('');

    chars[questionIdx] = chars[questionIdx] === opt ? '-' : opt;
    const nextAnswers = chars.join('');
    setLocalAnswers(nextAnswers);

    const storageKey = `vertice_sim_${activeSimulado.id}_${currentUserUid}`;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ answersString: nextAnswers, startedAtMs: activeStartMs })
      );
    } catch {
      // ignore
    }

    latestDraftRef.current = {
      simulado: activeSimulado,
      answers: nextAnswers,
      startMs: activeStartMs,
      dirty: true,
    };

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      flushPendingAutoSave();
    }, 1800);
  };

  const handleExitExamToList = async () => {
    await flushPendingAutoSave();
    setViewMode('list');
  };

  // Finalize exam -> record duration, hits & misses, open result window
  const handleFinishExam = async () => {
    if (!activeSimulado || isFinishing) return;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    latestDraftRef.current.dirty = false;
    setIsFinishing(true);
    try {
      const normalized = localAnswers
        .padEnd(activeSimulado.questionCount, '-')
        .slice(0, activeSimulado.questionCount);
      await onStartOrUpdateSubmission(
        activeSimulado,
        normalized,
        activeStartMs,
        true
      );
      setSelectedStudentUid(currentUserUid);
      setViewMode('student_result');
    } finally {
      setIsFinishing(false);
    }
  };

  // Student completed simulados & chart points
  const myCompletedItems = useMemo(() => {
    return simulados
      .map((sim, idx) => {
        const sub = mySubmissionsBySimulado[sim.id];
        if (!sub || sub.status !== 'completed') return null;
        const summary = cohortSummaries[sim.id];
        const evalData = summary?.evaluationsByUserId[currentUserUid];
        if (!evalData) return null;
        return {
          sim,
          sub,
          evalData,
          shortLabel: `Sim ${idx + 1}`,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [simulados, mySubmissionsBySimulado, cohortSummaries, currentUserUid]);

  const studentChartPoints: PerformanceChartPoint[] = useMemo(() => {
    return myCompletedItems.map(({ sim, evalData, shortLabel }) => {
      const released = Boolean(sim.resultsReleased);
      const barVal = released
        ? evalData.triScore
        : 300 + (evalData.accuracyPercent / 100) * 650;
      const lineVal = released
        ? 300 + (evalData.coherencePercent / 100) * 650
        : 300 + (evalData.accuracyPercent / 100) * 650;

      return {
        id: sim.id,
        shortLabel,
        title: sim.title,
        barValue: barVal,
        lineValue: lineVal,
        displayScore: released
          ? evalData.triScore.toFixed(1)
          : `${evalData.correctCount}/${evalData.questionCount}`,
        displaySub: released
          ? `Coerência ${evalData.coherencePercent}%`
          : 'Aguardando TRI',
      };
    });
  }, [myCompletedItems]);

  const studentGeneralStats = useMemo(() => {
    if (myCompletedItems.length === 0) return null;
    const releasedItems = myCompletedItems.filter((i) =>
      Boolean(i.sim.resultsReleased)
    );
    const totalCorrect = myCompletedItems.reduce(
      (acc, i) => acc + i.evalData.correctCount,
      0
    );
    const totalQuestions = myCompletedItems.reduce(
      (acc, i) => acc + i.evalData.questionCount,
      0
    );
    const overallAccuracy =
      totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const meanTri =
      releasedItems.length > 0
        ? (
            releasedItems.reduce((acc, i) => acc + i.evalData.triScore, 0) /
            releasedItems.length
          ).toFixed(1)
        : null;

    const meanCoherence =
      releasedItems.length > 0
        ? Math.round(
            releasedItems.reduce(
              (acc, i) => acc + i.evalData.coherencePercent,
              0
            ) / releasedItems.length
          )
        : null;

    return {
      completedCount: myCompletedItems.length,
      overallAccuracy,
      totalCorrect,
      totalQuestions,
      meanTri,
      meanCoherence,
    };
  }, [myCompletedItems]);

  // Admin chart points (one bar/point per Simulado)
  const adminChartPoints: PerformanceChartPoint[] = useMemo(() => {
    return simulados.map((sim, idx) => {
      const summary = cohortSummaries[sim.id];
      const hasCompleted = (summary?.completedCount || 0) > 0;
      const isReleased = Boolean(sim.resultsReleased);
      const barVal = !hasCompleted
        ? 320
        : isReleased
          ? summary.meanTriScore
          : 300 + (summary.meanAccuracyPercent / 100) * 650;
      const lineVal = !hasCompleted
        ? 320
        : isReleased
          ? 300 + (summary.meanCoherencePercent / 100) * 650
          : 300 + (summary.meanAccuracyPercent / 100) * 650;
      return {
        id: sim.id,
        shortLabel: `Sim ${idx + 1}`,
        title: sim.title,
        barValue: barVal,
        lineValue: lineVal,
        displayScore: !hasCompleted
          ? '—'
          : isReleased
            ? summary.meanTriScore.toFixed(1)
            : `${summary.meanAccuracyPercent}%`,
        displaySub: isReleased
          ? `${summary?.completedCount || 0} entregas • Coer. ${summary?.meanCoherencePercent || 0}%`
          : `${summary?.completedCount || 0} entregas • TRI ao liberar`,
      };
    });
  }, [simulados, cohortSummaries]);

  const adminGeneralStats = useMemo(() => {
    const summariesWithData = simulados
      .map((s) => cohortSummaries[s.id])
      .filter((sum) => sum && sum.completedCount > 0);
    const calibratedWithData = summariesWithData.filter(
      (sum) => sum && sum.isCalibrated
    );
    const totalCompleted = summariesWithData.reduce(
      (acc, s) => acc + s.completedCount,
      0
    );
    const meanTri =
      calibratedWithData.length > 0
        ? (
            calibratedWithData.reduce((acc, s) => acc + s.meanTriScore, 0) /
            calibratedWithData.length
          ).toFixed(1)
        : summariesWithData.length > 0
          ? 'Ao liberar'
          : '—';
    const meanCoherence =
      calibratedWithData.length > 0
        ? `${Math.round(
            calibratedWithData.reduce(
              (acc, s) => acc + s.meanCoherencePercent,
              0
            ) / calibratedWithData.length
          )}%`
        : summariesWithData.length > 0
          ? 'Ao liberar'
          : '—';
    const meanAccuracy =
      summariesWithData.length > 0
        ? `${Math.round(
            summariesWithData.reduce(
              (acc, s) => acc + s.meanAccuracyPercent,
              0
            ) / summariesWithData.length
          )}%`
        : '—';

    return {
      totalCompleted,
      meanTri,
      meanCoherence,
      meanAccuracy,
    };
  }, [simulados, cohortSummaries]);

  const isEffectiveAdmin = isAdmin && !isBlockedUser;

  if (!isAdmin && isBlockedUser) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
        <div className="p-8 md:p-12 rounded-3xl bg-surface border border-line shadow-card max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-ink">
            Simulados são exclusivos para alunos
          </h2>
          <p className="text-xs md:text-sm text-ink-muted leading-relaxed">
            Esta seção conta com provas completas, correção TRI oficial e ranking exclusivo para matriculados no Curso Vértice.
          </p>
        </div>
      </div>
    );
  }

  // --- WINDOW 1: TAKING SIMULADO (BUBBLE SHEET + LIVE TIMER + AUTO-SAVE) ---
  if (viewMode === 'taking' && activeSimulado) {
    const qCount = activeSimulado.questionCount;
    const markedCount = localAnswers
      .slice(0, qCount)
      .split('')
      .filter((c) => c && c !== '-').length;

    return (
      <div className="w-full max-w-4xl mx-auto py-4 space-y-6">
        {/* Sticky Top Exam Bar (No redundant backdrop-blur over 95% opaque surface) */}
        <div className="sticky top-16 z-20 p-4 rounded-2xl bg-surface border border-line shadow-pop flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExitExamToList}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-brand-soft" />
              Sair
            </button>
            <div>
              <h2 className="text-sm font-extrabold tracking-tight text-ink truncate max-w-[200px] sm:max-w-xs">
                {activeSimulado.title}
              </h2>
              <span className="text-xs text-ink-muted font-medium tabular-nums">
                {markedCount} de {qCount} marcadas
              </span>
            </div>
          </div>

          {/* Isolated Live Stopwatch (Cronômetro) */}
          <LiveExamClock
            startedAtMs={activeStartMs}
            timeLimitMinutes={activeSimulado.timeLimitMinutes}
          />

          <div className="flex items-center gap-2">
            {/* Download / Open PDF if attached */}
            {activeSimulado.pdfUrl && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onOpenPdfReader({
                      id: `sim_pdf_${activeSimulado.id}`,
                      title:
                        activeSimulado.pdfTitle || `${activeSimulado.title}.pdf`,
                      url: activeSimulado.pdfUrl,
                      sizeLabel: 'PDF',
                    })
                  }
                  className="px-3.5 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-brand-soft" />
                  Ver PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    triggerPdfDownload(
                      activeSimulado.pdfUrl,
                      activeSimulado.pdfTitle || `${activeSimulado.title}.pdf`
                    )
                  }
                  className="px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-ink text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-brand-soft" />
                  Baixar PDF
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleFinishExam}
              disabled={isFinishing}
              className="px-5 py-2 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-glow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isFinishing ? 'Finalizando...' : 'Finalizar'}
            </button>
          </div>
        </div>

        {/* Cartão de Bolhas (Bubble Sheet) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: qCount }, (_, idx) => {
            const currentMark = localAnswers[idx] || '-';
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-surface border border-line shadow-card"
              >
                <span className="text-xs font-extrabold text-ink-2 tabular-nums w-8">
                  {String(idx + 1).padStart(2, '0')}
                </span>

                <div className="flex items-center gap-1.5">
                  {BUBBLE_OPTIONS.map((opt) => {
                    const isSelected = currentMark === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleSelectBubble(idx, opt)}
                        className={`w-8 h-8 rounded-full text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
                          isSelected
                            ? 'bg-brand text-white shadow-glow-sm scale-105'
                            : 'bg-inset hover:bg-chip-hover text-ink-2 border border-line'
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
    );
  }

  // --- WINDOW 2: INDIVIDUAL PERFORMANCE DETAIL WINDOW (STUDENT OR ADMIN VIEWING A STUDENT FROM RANKING) ---
  if (viewMode === 'student_result' && activeSimulado) {
    const targetUid = selectedStudentUid || currentUserUid;
    const summary = cohortSummaries[activeSimulado.id];
    const evalData = summary?.evaluationsByUserId[targetUid];
    const sub = submissions.find(
      (s) => s.simuladoId === activeSimulado.id && s.userId === targetUid
    );

    const showTri = Boolean(activeSimulado.resultsReleased);

    const sortedStudentQuestions = evalData
      ? [...evalData.questionBreakdown].sort((a, b) => {
          if (questionSortOrder === 'difficulty_asc') {
            if (b.empiricalHitRate !== a.empiricalHitRate) {
              return b.empiricalHitRate - a.empiricalHitRate;
            }
          }
          return a.questionNumber - b.questionNumber;
        })
      : [];

    return (
      <div className="w-full max-w-4xl mx-auto py-4 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              if (isEffectiveAdmin) {
                setViewMode('admin_cohort');
              } else {
                setViewMode('list');
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface hover:bg-surface-2 border border-line text-xs font-bold text-ink transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-brand-soft" />
            Voltar
          </button>

          <div className="text-right min-w-0">
            <h2 className="text-base md:text-lg font-extrabold tracking-tight text-ink truncate">
              {activeSimulado.title}
            </h2>
            <p className="text-xs text-ink-2 font-medium truncate">
              {ENEM_AREA_LABELS[activeSimulado.area].full}
              {sub?.userName ? ` • ${sub.userName}` : ''}
            </p>
          </div>
        </div>

        {evalData && sub ? (
          <>
            {/* Top 4 Clean Performance Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Nota TRI
                </span>
                {showTri ? (
                  <span className="mt-1.5 block text-2xl font-extrabold tracking-tight text-ink tabular-nums">
                    {evalData.triScore.toFixed(1)}
                  </span>
                ) : (
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 [html.theme-light_&]:text-amber-700">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Aguardando liberação
                  </span>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Acertos / Erros
                </span>
                <div className="mt-1.5 flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-2xl font-extrabold tracking-tight text-emerald-400 [html.theme-light_&]:text-emerald-700">
                    {evalData.correctCount}
                  </span>
                  <span className="text-ink-faint font-bold">/</span>
                  <span className="text-lg font-bold text-rose-400 [html.theme-light_&]:text-rose-700">
                    {evalData.wrongCount + evalData.blankCount}
                  </span>
                  <span className="text-xs font-semibold text-ink-2 ml-auto">
                    {evalData.accuracyPercent}%
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Coerência Pedagógica
                </span>
                {showTri ? (
                  <span className="mt-1.5 block text-2xl font-extrabold tracking-tight text-brand-soft tabular-nums">
                    {evalData.coherencePercent}%
                  </span>
                ) : (
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Aguardando liberação
                  </span>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Tempo
                </span>
                <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-ink tabular-nums">
                  {formatDurationClock(sub.durationSeconds)}
                </span>
              </div>
            </div>

            {showTri && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 [html.theme-light_&]:text-emerald-700">
                    Fáceis
                  </span>
                  <span className="text-sm font-extrabold text-ink tabular-nums">
                    {evalData.easyCorrect}/{evalData.easyTotal}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 [html.theme-light_&]:text-amber-700">
                    Médias
                  </span>
                  <span className="text-sm font-extrabold text-ink tabular-nums">
                    {evalData.mediumCorrect}/{evalData.mediumTotal}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400 [html.theme-light_&]:text-rose-700">
                    Difíceis
                  </span>
                  <span className="text-sm font-extrabold text-ink tabular-nums">
                    {evalData.hardCorrect}/{evalData.hardTotal}
                  </span>
                </div>
              </div>
            )}

            {/* Gabarito & Marcações + Botão Slide (Ordem de Prova vs Fácil -> Difícil) */}
            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-bold text-ink tracking-tight">
                  Gabarito e Marcações
                </h3>

                <QuestionOrderSlideToggle
                  value={questionSortOrder}
                  onChange={setQuestionSortOrder}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {sortedStudentQuestions.map((q) => {
                  const tierInfo = getTierLabel(q.tier);
                  return (
                    <div
                      key={q.questionNumber}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                        q.isCorrect
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 [html.theme-light_&]:text-emerald-800'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300 [html.theme-light_&]:text-rose-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {q.isCorrect ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="block text-xs font-extrabold text-ink tabular-nums">
                            {String(q.questionNumber).padStart(2, '0')}
                          </span>
                          {(questionSortOrder === 'difficulty_asc' || showTri) && (
                            <span
                              className={`block text-[10px] font-semibold ${tierInfo.textColor}`}
                            >
                              {tierInfo.label}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-xs font-extrabold tabular-nums shrink-0">
                        <span>{q.marked}</span>
                        {!q.isCorrect && (
                          <span className="text-ink-muted font-semibold ml-1">
                            ({q.official})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // --- WINDOW 3: ADMIN CLASS REPORT + RANKING + QUESTIONS ANALYSIS ---
  if (viewMode === 'admin_cohort' && activeSimulado && isEffectiveAdmin) {
    const summary = cohortSummaries[activeSimulado.id];
    const simSubmissions = submissions.filter(
      (s) => s.simuladoId === activeSimulado.id
    );

    const rankedSubmissions = [...simSubmissions].sort((a, b) => {
      const aDone = a.status === 'completed';
      const bDone = b.status === 'completed';
      if (aDone !== bDone) return aDone ? -1 : 1;

      const evalA = summary?.evaluationsByUserId[a.userId];
      const evalB = summary?.evaluationsByUserId[b.userId];
      const triA = evalA?.triScore || 0;
      const triB = evalB?.triScore || 0;
      if (triB !== triA) return triB - triA;

      const corrA = evalA?.correctCount || 0;
      const corrB = evalB?.correctCount || 0;
      if (corrB !== corrA) return corrB - corrA;

      return (a.durationSeconds || 0) - (b.durationSeconds || 0);
    });

    const allItems = summary?.items || [];
    const itemsByEasiestFirst = [...allItems].sort((a, b) => {
      if (b.rawHitPercent !== a.rawHitPercent) {
        return b.rawHitPercent - a.rawHitPercent;
      }
      return b.empiricalHitRate - a.empiricalHitRate;
    });
    const itemsByHardestFirst = [...allItems].sort((a, b) => {
      if (a.rawHitPercent !== b.rawHitPercent) {
        return a.rawHitPercent - b.rawHitPercent;
      }
      return a.empiricalHitRate - b.empiricalHitRate;
    });

    const mostHitQuestions = itemsByEasiestFirst.slice(0, 5);
    const mostMissedQuestions = itemsByHardestFirst.slice(0, 5);

    const displayedAdminItems =
      questionSortOrder === 'difficulty_asc' ? itemsByEasiestFirst : allItems;

    return (
      <div className="w-full max-w-5xl mx-auto py-4 space-y-8">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface hover:bg-surface-2 border border-line text-xs font-bold text-ink transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-brand-soft" />
              Voltar
            </button>
            <div>
              <h2 className="text-lg md:text-xl font-extrabold tracking-tight text-ink">
                {activeSimulado.title}
              </h2>
              <p className="text-xs text-ink-2 font-medium">
                Relatório da Turma • {ENEM_AREA_LABELS[activeSimulado.area].full} •{' '}
                {activeSimulado.questionCount} questões
              </p>
            </div>
          </div>

          {onToggleReleaseResults && (
            <button
              type="button"
              onClick={() => onToggleReleaseResults(activeSimulado)}
              className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSimulado.resultsReleased
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 [html.theme-light_&]:text-emerald-700'
                  : 'bg-brand hover:bg-brand-hover text-white shadow-glow-md'
              }`}
            >
              {activeSimulado.resultsReleased ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  Notas TRI Liberadas
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  Liberar Notas TRI
                </>
              )}
            </button>
          )}
        </div>

        {/* Section 1: Relatório Geral da Turma */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Média TRI da Turma
              </span>
              {activeSimulado.resultsReleased ? (
                <span className="mt-1.5 block text-2xl font-extrabold tracking-tight text-ink tabular-nums">
                  {summary.completedCount > 0
                    ? summary.meanTriScore.toFixed(1)
                    : '—'}
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 [html.theme-light_&]:text-amber-700">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Calculada ao liberar
                </span>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Coerência da Turma
              </span>
              {activeSimulado.resultsReleased ? (
                <span className="mt-1.5 block text-2xl font-extrabold tracking-tight text-brand-soft tabular-nums">
                  {summary.completedCount > 0
                    ? `${summary.meanCoherencePercent}%`
                    : '—'}
                </span>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Calculada ao liberar
                </span>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Média de Acertos
              </span>
              <span className="mt-1.5 block text-2xl font-extrabold tracking-tight text-emerald-400 [html.theme-light_&]:text-emerald-700 tabular-nums">
                {summary.completedCount > 0
                  ? `${summary.meanCorrectCount}/${activeSimulado.questionCount}`
                  : '—'}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Alunos Concluídos
              </span>
              <span className="mt-1.5 block text-2xl font-extrabold tracking-tight text-ink tabular-nums">
                {summary.completedCount}
                {summary.inProgressCount > 0 && (
                  <span className="text-xs text-ink-muted font-medium ml-1.5">
                    (+{summary.inProgressCount} fazendo)
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Section 2: Ranking de Alunos */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base md:text-lg font-bold text-ink tracking-tight flex items-center gap-2">
              <Trophy className="w-4 h-4 text-brand-soft" />
              Ranking de Alunos ({rankedSubmissions.length})
            </h3>
            <span className="text-xs text-ink-muted font-medium">
              Clique no aluno para ver o relatório individual
            </span>
          </div>

          {rankedSubmissions.length === 0 ? (
            <div className="p-8 rounded-2xl bg-surface border border-line text-center text-xs text-ink-muted font-medium">
              Nenhum aluno realizou este simulado ainda.
            </div>
          ) : (
            <div className="space-y-2.5">
              {rankedSubmissions.map((sub, idx) => {
                const evalData = summary?.evaluationsByUserId[sub.userId];
                const isDone = sub.status === 'completed';
                const rankNumber = idx + 1;

                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSelectedStudentUid(sub.userId);
                      setViewMode('student_result');
                    }}
                    className="cv-auto-row w-full flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-surface hover:bg-surface-2 border border-line hover:border-brand-soft/50 text-left transition-all cursor-pointer group shadow-card"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold tabular-nums shrink-0 ${
                          rankNumber === 1 && isDone
                            ? 'bg-brand text-white shadow-glow-sm'
                            : 'bg-chip text-ink-2 border border-line'
                        }`}
                      >
                        {isDone ? `${rankNumber}º` : '—'}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-extrabold tracking-tight text-ink group-hover:text-brand-soft transition-colors truncate">
                          {sub.userName}
                        </p>
                        <p className="text-xs text-ink-muted font-medium truncate">
                          {sub.userEmail}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs tabular-nums ml-auto">
                      {isDone && evalData ? (
                        <>
                          <div>
                            <span className="text-ink-muted font-medium block text-[11px]">
                              Acertos
                            </span>
                            <span className="text-emerald-400 [html.theme-light_&]:text-emerald-700 font-extrabold text-sm">
                              {evalData.correctCount}/{evalData.questionCount}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-muted font-medium block text-[11px]">
                              Coerência
                            </span>
                            <span className="text-brand-soft font-extrabold text-sm">
                              {activeSimulado.resultsReleased
                                ? `${evalData.coherencePercent}%`
                                : 'Ao liberar'}
                            </span>
                          </div>
                          <div>
                            <span className="text-ink-muted font-medium block text-[11px]">
                              Nota TRI
                            </span>
                            <span className="text-ink font-extrabold text-sm">
                              {activeSimulado.resultsReleased
                                ? evalData.triScore.toFixed(1)
                                : 'Ao liberar'}
                            </span>
                          </div>
                          <div className="hidden sm:block">
                            <span className="text-ink-muted font-medium block text-[11px]">
                              Tempo
                            </span>
                            <span className="text-ink-2 font-bold text-sm">
                              {formatDurationClock(sub.durationSeconds)}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-ink transition-colors" />
                        </>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 [html.theme-light_&]:text-amber-700 text-xs font-bold">
                          Em andamento
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Questões Mais Acertadas e Mais Erradas + Lista de Questões */}
        {allItems.length > 0 && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold tracking-tight text-emerald-400 [html.theme-light_&]:text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Questões Mais Acertadas
                  </h4>
                  <span className="text-xs text-ink-muted font-medium">
                    Maior taxa de acerto
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {mostHitQuestions.map((item) => (
                    <div
                      key={item.questionNumber}
                      className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 tabular-nums"
                    >
                      <span className="text-xs font-extrabold text-ink">
                        Q{String(item.questionNumber).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-bold text-emerald-400 [html.theme-light_&]:text-emerald-700">
                        {item.rawHitPercent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold tracking-tight text-rose-400 [html.theme-light_&]:text-rose-700 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Questões Mais Erradas
                  </h4>
                  <span className="text-xs text-ink-muted font-medium">
                    Maior taxa de erro
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {mostMissedQuestions.map((item) => (
                    <div
                      key={item.questionNumber}
                      className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center gap-2 tabular-nums"
                    >
                      <span className="text-xs font-extrabold text-ink">
                        Q{String(item.questionNumber).padStart(2, '0')}
                      </span>
                      <span className="text-xs font-bold text-rose-400 [html.theme-light_&]:text-rose-700">
                        {100 - item.rawHitPercent}% erro
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Todas as Questões do Simulado + Botão Slide */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base md:text-lg font-bold text-ink tracking-tight">
                    Desempenho por Questão
                  </h3>
                  <p className="text-xs text-ink-2 font-medium">
                    Taxa de acerto da turma e nível de dificuldade calibrado pela TRI
                  </p>
                </div>

                <QuestionOrderSlideToggle
                  value={questionSortOrder}
                  onChange={setQuestionSortOrder}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {displayedAdminItems.map((item) => {
                  const tierInfo = getTierLabel(item.tier);
                  return (
                    <div
                      key={item.questionNumber}
                      className="p-3.5 rounded-2xl bg-surface border border-line shadow-card flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-ink tabular-nums">
                          Questão {String(item.questionNumber).padStart(2, '0')}
                        </span>
                        <span
                          className={`text-[11px] font-bold ${tierInfo.textColor}`}
                        >
                          {tierInfo.label}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2 tabular-nums pt-1">
                        <span className="text-xs text-ink-muted font-medium">
                          Gab:{' '}
                          <strong className="text-ink font-extrabold">
                            {item.officialAnswer}
                          </strong>
                        </span>
                        <span className="text-sm font-extrabold text-ink">
                          {item.rawHitPercent}%
                        </span>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-chip overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.tier === 'easy'
                              ? 'bg-emerald-400'
                              : item.tier === 'medium'
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                          }`}
                          style={{ width: `${Math.max(4, item.rawHitPercent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  // --- MAIN SIMULADOS OVERVIEW SCREEN ---
  return (
    <div className="w-full py-2 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base md:text-lg font-bold text-ink tracking-tight">
          Simulados
        </h2>

        {isEffectiveAdmin && onOpenCreateSimulado && (
          <button
            type="button"
            onClick={onOpenCreateSimulado}
            className="px-5 py-2.5 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 shadow-glow-md transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Simulado
          </button>
        )}
      </div>

      {/* ADMIN PERFORMANCE DASHBOARD + CHART */}
      {isEffectiveAdmin && simulados.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Média TRI Geral
              </span>
              <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-ink tabular-nums">
                {adminGeneralStats.meanTri}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Coerência da Turma
              </span>
              <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-brand-soft tabular-nums">
                {adminGeneralStats.meanCoherence}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Aproveitamento
              </span>
              <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-emerald-400 [html.theme-light_&]:text-emerald-700 tabular-nums">
                {adminGeneralStats.meanAccuracy}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <span className="block text-xs font-medium text-ink-muted">
                Provas Concluídas
              </span>
              <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-ink tabular-nums">
                {adminGeneralStats.totalCompleted}
              </span>
            </div>
          </div>

          <PerformanceChart
            points={adminChartPoints}
            minY={300}
            maxY={1000}
            ySteps={[300, 475, 650, 825, 1000]}
            onSelectPoint={(simId) => {
              setSelectedSimuladoId(simId);
              setViewMode('admin_cohort');
            }}
          />
        </div>
      )}

      {/* STUDENT PERFORMANCE DASHBOARD + CHART */}
      {!isEffectiveAdmin &&
        studentGeneralStats &&
        studentChartPoints.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Média TRI
                </span>
                <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-ink tabular-nums">
                  {studentGeneralStats.meanTri || 'Aguardando'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Desempenho Geral
                </span>
                <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-emerald-400 [html.theme-light_&]:text-emerald-700 tabular-nums">
                  {studentGeneralStats.overallAccuracy}%
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Coerência Pedagógica
                </span>
                <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-brand-soft tabular-nums">
                  {studentGeneralStats.meanCoherence !== null
                    ? `${studentGeneralStats.meanCoherence}%`
                    : 'Aguardando'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
                <span className="block text-xs font-medium text-ink-muted">
                  Simulados Feitos
                </span>
                <span className="mt-1.5 block text-xl font-extrabold tracking-tight text-ink tabular-nums">
                  {studentGeneralStats.completedCount}
                </span>
              </div>
            </div>

            <PerformanceChart
              points={studentChartPoints}
              minY={300}
              maxY={1000}
              ySteps={[300, 475, 650, 825, 1000]}
              onSelectPoint={(simId) => {
                setSelectedSimuladoId(simId);
                setSelectedStudentUid(currentUserUid);
                setViewMode('student_result');
              }}
            />
          </div>
        )}

      {/* SIMULADOS CARDS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {simulados.map((sim) => {
          const mySub = mySubmissionsBySimulado[sim.id];
          const summary = cohortSummaries[sim.id];
          const myEval = summary?.evaluationsByUserId[currentUserUid];
          const isCompleted = mySub?.status === 'completed';
          const isInProgress = mySub?.status === 'in_progress';
          const canAccessSimulado = !isBlockedUser;

          return (
            <div
              key={sim.id}
              onClick={() => {
                if (isEffectiveAdmin) {
                  setSelectedSimuladoId(sim.id);
                  setViewMode('admin_cohort');
                }
              }}
              className={`cv-auto-row p-5 rounded-2xl bg-surface border border-line shadow-card flex flex-col justify-between gap-4 transition-all ${
                !canAccessSimulado
                  ? 'opacity-80 grayscale'
                  : isEffectiveAdmin
                    ? 'hover:border-brand-soft/60 hover:bg-surface-2 cursor-pointer group'
                    : 'hover:border-line-strong'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-ink-2 font-medium">
                    <span className="font-extrabold text-brand-soft">
                      {ENEM_AREA_LABELS[sim.area].short}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span className="tabular-nums">
                      {sim.questionCount} questões
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>
                      {sim.timeLimitMinutes > 0
                        ? `${sim.timeLimitMinutes} min`
                        : 'Tempo livre'}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold tracking-tight text-ink group-hover:text-brand-soft transition-colors truncate">
                    {sim.title}
                  </h3>
                </div>

                {!canAccessSimulado ? (
                  <div className="w-8 h-8 rounded-full bg-chip border border-line text-ink-muted flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                ) : isEffectiveAdmin ? (
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onOpenEditSimulado && (
                      <button
                        type="button"
                        onClick={() => onOpenEditSimulado(sim)}
                        className="p-2 rounded-xl text-ink-2 hover:text-ink hover:bg-chip-hover transition-colors cursor-pointer"
                        title="Editar simulado"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {onDeleteSimulado && (
                      <button
                        type="button"
                        onClick={() => onDeleteSimulado(sim.id)}
                        className="p-2 rounded-xl text-ink-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Excluir simulado"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line-soft">
                {isEffectiveAdmin ? (
                  <>
                    <div className="flex items-center gap-2 text-xs font-medium text-ink-2 tabular-nums">
                      <Users className="w-3.5 h-3.5 text-brand-soft" />
                      <span>
                        {summary?.completedCount || 0} concluído
                        {(summary?.completedCount || 0) !== 1 ? 's' : ''}
                      </span>
                      <span aria-hidden="true">•</span>
                      <span
                        className={
                          sim.resultsReleased
                            ? 'text-emerald-400 [html.theme-light_&]:text-emerald-700 font-bold'
                            : 'text-amber-400 [html.theme-light_&]:text-amber-700 font-semibold'
                        }
                      >
                        {sim.resultsReleased
                          ? 'TRI Liberada'
                          : 'TRI Oculta p/ Alunos'}
                      </span>
                    </div>

                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-soft group-hover:text-ink transition-colors ml-auto">
                      Relatório da Turma
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-medium tabular-nums">
                      {isCompleted && myEval ? (
                        <div className="flex items-center gap-2.5">
                          <span className="text-emerald-400 [html.theme-light_&]:text-emerald-700 font-extrabold">
                            {myEval.correctCount}/{myEval.questionCount} acertos
                          </span>
                          <span aria-hidden="true" className="text-ink-faint">
                            •
                          </span>
                          {sim.resultsReleased ? (
                            <span className="text-ink font-extrabold">
                              TRI {myEval.triScore.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-amber-400 [html.theme-light_&]:text-amber-700 font-semibold">
                              TRI aguardando liberação
                            </span>
                          )}
                        </div>
                      ) : isInProgress ? (
                        <span className="text-amber-400 [html.theme-light_&]:text-amber-700 font-semibold">
                          Prova em andamento
                        </span>
                      ) : (
                        <span className="text-ink-muted">
                          {sim.pdfUrl ? 'Caderno PDF e Cartão' : 'Cartão de Respostas'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {isCompleted ? (
                        <button
                          type="button"
                          disabled={!canAccessSimulado}
                          onClick={() => {
                            setSelectedSimuladoId(sim.id);
                            setSelectedStudentUid(currentUserUid);
                            setViewMode('student_result');
                          }}
                          className="px-4 py-2 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Ver Desempenho
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canAccessSimulado}
                          onClick={() => {
                            if (canAccessSimulado) handleEnterExam(sim);
                          }}
                          className={`px-5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                            canAccessSimulado
                              ? 'bg-brand hover:bg-brand-hover text-white shadow-glow-sm cursor-pointer'
                              : 'bg-chip text-ink-muted cursor-not-allowed'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          {isInProgress ? 'Continuar' : 'Iniciar'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
