import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Flame,
  MessageSquare,
  Sparkles,
  Star,
  Target,
  Trophy,
  Video,
} from 'lucide-react';
import {
  Mentoria,
  MentoriaCheckin,
  MentoriaEncontro,
  MentoriaTask,
  TaskKind,
  addDays,
  buildWeeklySeries,
  getWeekStart,
  saveMyCheckin,
  setTaskDone,
  subscribeMyCheckins,
  subscribeMyEncontros,
  subscribeMyMentoria,
  subscribeMyTasks,
} from '../utils/mentoriaService';

interface MentoriaWindowProps {
  userEmail: string;
  userName: string;
  isBlockedUser: boolean;
}

const TASK_KIND_LABELS: Record<TaskKind, { label: string; badgeClass: string }> = {
  aula: {
    label: 'Aula',
    badgeClass:
      'bg-blue-500/15 text-blue-300 [html.theme-light_&]:text-blue-700 border-blue-500/30',
  },
  questoes: {
    label: 'Questões',
    badgeClass:
      'bg-emerald-500/15 text-emerald-300 [html.theme-light_&]:text-emerald-700 border-emerald-500/30',
  },
  simulado: {
    label: 'Simulado',
    badgeClass:
      'bg-amber-500/15 text-amber-300 [html.theme-light_&]:text-amber-700 border-amber-500/30',
  },
  revisao: {
    label: 'Revisão',
    badgeClass:
      'bg-purple-500/15 text-purple-300 [html.theme-light_&]:text-purple-700 border-purple-500/30',
  },
  outro: {
    label: 'Outro',
    badgeClass:
      'bg-slate-500/15 text-slate-300 [html.theme-light_&]:text-slate-700 border-slate-500/30',
  },
};

function formatWeekPeriod(weekStart: string): string {
  try {
    const [y, m, d] = weekStart.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const end = new Date(y, m - 1, d + 6);
    const startStr = `${start.getDate()} de ${start.toLocaleDateString('pt-BR', { month: 'short' })}`;
    const endStr = `${end.getDate()} de ${end.toLocaleDateString('pt-BR', { month: 'short' })}`;
    return `${startStr} a ${endStr}`;
  } catch {
    return weekStart;
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

export const MentoriaWindow: React.FC<MentoriaWindowProps> = ({
  userEmail,
  isBlockedUser,
}) => {
  const [mentoria, setMentoria] = useState<Mentoria | null>(null);
  const [tasks, setTasks] = useState<MentoriaTask[]>([]);
  const [checkins, setCheckins] = useState<MentoriaCheckin[]>([]);
  const [encontros, setEncontros] = useState<MentoriaEncontro[]>([]);
  const [loading, setLoading] = useState(true);

  // Week navigation
  const currentWeekStart = useMemo(() => getWeekStart(), []);
  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeekStart);

  // Check-in form state
  const currentWeekCheckin = useMemo(
    () => checkins.find((c) => c.weekStart === currentWeekStart) || null,
    [checkins, currentWeekStart]
  );

  const [isEditingCheckin, setIsEditingCheckin] = useState(false);
  const [checkinHours, setCheckinHours] = useState<string>('');
  const [checkinQuestions, setCheckinQuestions] = useState<string>('');
  const [checkinFocus, setCheckinFocus] = useState<number>(4);
  const [checkinWins, setCheckinWins] = useState<string>('');
  const [checkinDifficulties, setCheckinDifficulties] = useState<string>('');
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState(false);

  // Subscribe to real-time mentoria collections
  useEffect(() => {
    if (!userEmail || isBlockedUser) {
      setMentoria(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubMentoria = subscribeMyMentoria(userEmail, (m) => {
      setMentoria(m);
      setLoading(false);
    });

    const unsubTasks = subscribeMyTasks(userEmail, (list) => {
      setTasks(list);
    });

    const unsubCheckins = subscribeMyCheckins(userEmail, (list) => {
      setCheckins(list);
    });

    const unsubEncontros = subscribeMyEncontros(userEmail, (list) => {
      setEncontros(list);
    });

    return () => {
      unsubMentoria();
      unsubTasks();
      unsubCheckins();
      unsubEncontros();
    };
  }, [userEmail, isBlockedUser]);

  // Sync checkin form when checkin loads
  useEffect(() => {
    if (currentWeekCheckin && !isEditingCheckin) {
      setCheckinHours(String(currentWeekCheckin.hoursStudied || ''));
      setCheckinQuestions(String(currentWeekCheckin.questionsDone || ''));
      setCheckinFocus(currentWeekCheckin.focusRating || 4);
      setCheckinWins(currentWeekCheckin.wins || '');
      setCheckinDifficulties(currentWeekCheckin.difficulties || '');
    }
  }, [currentWeekCheckin, isEditingCheckin]);

  // Filter tasks for the selected week
  const weekTasks = useMemo(
    () => tasks.filter((t) => t.weekStart === selectedWeek),
    [tasks, selectedWeek]
  );

  // Current week statistics
  const currentWeekTasks = useMemo(
    () => tasks.filter((t) => t.weekStart === currentWeekStart),
    [tasks, currentWeekStart]
  );

  const currentWeekDoneCount = useMemo(
    () => currentWeekTasks.filter((t) => t.done).length,
    [currentWeekTasks]
  );

  const currentWeekProgressPct = useMemo(() => {
    if (currentWeekTasks.length === 0) return 0;
    return Math.round((currentWeekDoneCount / currentWeekTasks.length) * 100);
  }, [currentWeekDoneCount, currentWeekTasks.length]);

  const currentWeekHours = currentWeekCheckin?.hoursStudied || 0;
  const targetHours = mentoria?.weeklyHoursTarget || 0;
  const hoursProgressPct = useMemo(() => {
    if (targetHours === 0) return 0;
    return Math.min(100, Math.round((currentWeekHours / targetHours) * 100));
  }, [currentWeekHours, targetHours]);

  // Upcoming meetings
  const upcomingEncontros = useMemo(() => {
    const now = Date.now() - 3600000;
    return encontros.filter((e) => e.startsAtMs >= now);
  }, [encontros]);

  // 8-week evolution chart data
  const weeklySeries = useMemo(() => buildWeeklySeries(tasks, checkins, 8), [tasks, checkins]);

  const maxHoursInSeries = useMemo(
    () => Math.max(20, ...weeklySeries.map((s) => s.hoursStudied)),
    [weeklySeries]
  );

  const maxQuestionsInSeries = useMemo(
    () => Math.max(100, ...weeklySeries.map((s) => s.questionsDone)),
    [weeklySeries]
  );

  const handleToggleTask = async (task: MentoriaTask) => {
    try {
      await setTaskDone(task.id, !task.done);
    } catch (err) {
      console.error('Erro ao atualizar tarefa:', err);
    }
  };

  const handleSaveCheckinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) return;
    setSavingCheckin(true);
    try {
      await saveMyCheckin(
        userEmail,
        currentWeekStart,
        {
          hoursStudied: Number(checkinHours) || 0,
          questionsDone: Number(checkinQuestions) || 0,
          focusRating: checkinFocus,
          wins: checkinWins,
          difficulties: checkinDifficulties,
        },
        Boolean(currentWeekCheckin)
      );
      setIsEditingCheckin(false);
      setCheckinSuccess(true);
      setTimeout(() => setCheckinSuccess(false), 3500);
    } catch (err) {
      console.error('Erro ao salvar check-in:', err);
    } finally {
      setSavingCheckin(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto py-20 px-4 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-ink-2">Carregando seu plano de mentoria...</p>
      </div>
    );
  }

  if (!mentoria || mentoria.status !== 'active') {
    return (
      <div className="w-full max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="p-8 sm:p-12 rounded-3xl bg-surface border border-line shadow-pop space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand-soft">
            <Sparkles className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
            Programa de Mentoria Vértice
          </h2>
          <p className="text-sm text-ink-2 max-w-md mx-auto leading-relaxed">
            Acompanhamento individualizado, metas semanais, encontros de alinhamento e análise de desempenho.
          </p>
          <div className="pt-2 text-xs text-ink-muted">
            Você ainda não possui uma mentoria ativa vinculada a este e-mail. Converse com o professor para ativar seu acesso.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-4 sm:py-6 px-3 sm:px-6 space-y-6 sm:space-y-8">
      {/* 1. CABEÇALHO DA MENTORIA */}
      <section className="relative overflow-hidden rounded-3xl bg-surface border border-line p-5 sm:p-7 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/15 border border-brand/30 text-brand-soft text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              Mentoria Ativa
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {mentoria.goal || 'Foco em Alta Performance'}
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              Objetivo traçado especialmente para sua evolução rumo à aprovação.
            </p>
          </div>

          {/* Badges de Metas */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 self-stretch md:self-auto shrink-0">
            <div className="p-3.5 rounded-2xl bg-surface-2 border border-line text-center">
              <span className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Alvo
              </span>
              <span className="text-sm sm:text-base font-extrabold text-ink truncate block">
                {mentoria.examTarget || 'Vestibular'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface-2 border border-line text-center">
              <span className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Meta Semanal
              </span>
              <span className="text-sm sm:text-base font-extrabold text-brand-soft">
                {mentoria.weeklyHoursTarget}h <span className="text-xs text-ink-muted">/sem</span>
              </span>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-surface-2 border border-line text-center">
              <span className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                Início
              </span>
              <span className="text-sm sm:text-base font-extrabold text-ink-2">
                {formatDate(mentoria.startDate)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. RESUMO DA SEMANA ATUAL */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Progresso de Tarefas */}
        <div className="p-5 rounded-2xl bg-surface border border-line shadow-card space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-ink-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Tarefas desta Semana
            </span>
            <span className="font-extrabold text-ink tabular-nums">
              {currentWeekDoneCount} / {currentWeekTasks.length} concluídas ({currentWeekProgressPct}%)
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-inset overflow-hidden p-0.5 border border-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${currentWeekProgressPct}%` }}
            />
          </div>

          <p className="text-[11px] text-ink-muted">
            {currentWeekProgressPct === 100 && currentWeekTasks.length > 0
              ? '🎉 Parabéns! Todas as tarefas planejadas para esta semana foram concluídas!'
              : `${currentWeekTasks.length - currentWeekDoneCount} tarefas restantes para fechar o ciclo.`}
          </p>
        </div>

        {/* Horas Estudadas vs Meta */}
        <div className="p-5 rounded-2xl bg-surface border border-line shadow-card space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-ink-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-brand-soft" />
              Horas de Estudo (Check-in)
            </span>
            <span className="font-extrabold text-ink tabular-nums">
              {currentWeekHours}h / {targetHours}h ({hoursProgressPct}%)
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-inset overflow-hidden p-0.5 border border-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 transition-all duration-500 ease-out"
              style={{ width: `${hoursProgressPct}%` }}
            />
          </div>

          <p className="text-[11px] text-ink-muted">
            {currentWeekCheckin
              ? `Check-in enviado com ${currentWeekCheckin.questionsDone} questões resolvidas nesta semana.`
              : 'Ainda não registrou o check-in desta semana. Preencha o formulário abaixo.'}
          </p>
        </div>
      </section>

      {/* 3. PLANO DA SEMANA (CHECKLIST) */}
      <section className="p-5 sm:p-7 rounded-3xl bg-surface border border-line shadow-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
          <div>
            <h2 className="text-lg font-extrabold text-ink tracking-tight flex items-center gap-2">
              <Target className="w-5 h-5 text-brand-soft" />
              Plano de Ação Semanal
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Semana de {formatWeekPeriod(selectedWeek)}
            </p>
          </div>

          {/* Navegador de Semanas */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedWeek((w) => addDays(w, -7))}
              className="p-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 hover:text-ink transition-colors cursor-pointer"
              title="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {selectedWeek !== currentWeekStart && (
              <button
                type="button"
                onClick={() => setSelectedWeek(currentWeekStart)}
                className="px-2.5 py-1.5 rounded-xl bg-brand/20 text-brand-soft hover:bg-brand/30 text-xs font-bold transition-colors cursor-pointer"
              >
                Semana Atual
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedWeek((w) => addDays(w, 7))}
              className="p-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 hover:text-ink transition-colors cursor-pointer"
              title="Próxima semana"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lista de Tarefas */}
        {weekTasks.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-semibold text-ink-2">
              Seu mentor ainda não montou o plano desta semana.
            </p>
            <p className="text-xs text-ink-muted">
              As tarefas planejadas aparecerão aqui assim que forem cadastradas pelo mentor.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {weekTasks.map((task) => {
              const kindCfg = TASK_KIND_LABELS[task.kind] || TASK_KIND_LABELS.outro;
              return (
                <div
                  key={task.id}
                  onClick={() => handleToggleTask(task)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 select-none ${
                    task.done
                      ? 'bg-emerald-500/10 border-emerald-500/30 opacity-75'
                      : 'bg-surface-2 hover:bg-surface-3 border-line hover:border-line-strong'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={task.done ? 'Marcar como não concluída' : 'Marcar como concluída'}
                    className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                      task.done
                        ? 'bg-emerald-500 border-emerald-400 text-white'
                        : 'border-line-strong hover:border-brand-soft bg-chip'
                    }`}
                  >
                    {task.done && <CheckCircle2 className="w-4 h-4" />}
                  </button>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${kindCfg.badgeClass}`}
                      >
                        {kindCfg.label}
                      </span>
                      {task.dueDate && (
                        <span className="text-[11px] text-ink-muted flex items-center gap-1 font-medium">
                          <Calendar className="w-3 h-3 text-ink-muted" />
                          Prazo: {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-sm font-bold text-ink transition-all ${
                        task.done ? 'line-through text-ink-muted' : ''
                      }`}
                    >
                      {task.title}
                    </p>

                    {task.description && (
                      <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. CHECK-IN SEMANAL */}
      <section className="p-5 sm:p-7 rounded-3xl bg-surface border border-line shadow-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
          <div>
            <h2 className="text-lg font-extrabold text-ink tracking-tight flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400" />
              Check-in da Semana Atual
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Preencha seu fechamento semanal para acompanhamento do seu mentor.
            </p>
          </div>

          {currentWeekCheckin && !isEditingCheckin && (
            <button
              type="button"
              onClick={() => setIsEditingCheckin(true)}
              className="px-3 py-1.5 rounded-xl bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 border border-line transition-colors cursor-pointer self-start sm:self-auto"
            >
              Editar Check-in
            </button>
          )}
        </div>

        {/* FEEDBACK DO MENTOR (DESTAQUE) */}
        {currentWeekCheckin?.mentorFeedback && (
          <div className="p-5 rounded-2xl bg-brand/10 border-2 border-brand/40 shadow-card space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-soft uppercase tracking-wide">
              <MessageSquare className="w-4 h-4 text-brand-soft" />
              Feedback do Mentor
            </div>
            <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed font-medium">
              {currentWeekCheckin.mentorFeedback}
            </p>
          </div>
        )}

        {/* Formulário de Check-in */}
        {!currentWeekCheckin || isEditingCheckin ? (
          <form noValidate onSubmit={handleSaveCheckinSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Horas estudadas */}
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">
                  Horas Estudadas
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="168"
                    step="0.5"
                    placeholder="ex: 28"
                    value={checkinHours}
                    onChange={(e) => setCheckinHours(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink text-sm focus:outline-none focus:border-brand-soft"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-ink-muted">horas</span>
                </div>
              </div>

              {/* Questões resolvidas */}
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">
                  Questões Feitas
                </label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  placeholder="ex: 150"
                  value={checkinQuestions}
                  onChange={(e) => setCheckinQuestions(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink text-sm focus:outline-none focus:border-brand-soft"
                />
              </div>

              {/* Foco (1 a 5) */}
              <div>
                <label className="block text-xs font-medium text-ink-2 mb-1.5">
                  Nível de Foco (1 a 5)
                </label>
                <div className="flex items-center gap-1.5 h-10">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setCheckinFocus(lvl)}
                      className={`flex-1 h-9 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        checkinFocus >= lvl
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 [html.theme-light_&]:text-amber-700'
                          : 'bg-chip border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${checkinFocus >= lvl ? 'fill-amber-400' : ''}`} />
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* O que deu certo */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">
                O que deu certo esta semana? (vitórias, matérias dominadas)
              </label>
              <textarea
                rows={3}
                maxLength={1500}
                placeholder="Consegui cumprir o cronograma de eletrodinâmica e acertei 85% dos exercícios..."
                value={checkinWins}
                onChange={(e) => setCheckinWins(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink text-sm focus:outline-none focus:border-brand-soft resize-none"
              />
            </div>

            {/* Dificuldades */}
            <div>
              <label className="block text-xs font-medium text-ink-2 mb-1.5">
                Quais foram suas principais dificuldades?
              </label>
              <textarea
                rows={3}
                maxLength={1500}
                placeholder="Tive dificuldade em gerenciar o tempo na prova de natureza..."
                value={checkinDifficulties}
                onChange={(e) => setCheckinDifficulties(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink text-sm focus:outline-none focus:border-brand-soft resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {isEditingCheckin && (
                <button
                  type="button"
                  onClick={() => setIsEditingCheckin(false)}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              )}

              <button
                type="submit"
                disabled={savingCheckin}
                className="px-6 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-extrabold tracking-wide transition-all shadow-glow-sm disabled:opacity-50 cursor-pointer"
              >
                {savingCheckin ? 'Salvando...' : currentWeekCheckin ? 'Atualizar Check-in' : 'Enviar Check-in'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="p-4 rounded-2xl bg-surface-2 border border-line">
              <span className="block text-xs font-medium text-ink-muted mb-1">Horas Registradas</span>
              <span className="text-xl font-extrabold text-ink">{currentWeekCheckin.hoursStudied}h</span>
            </div>
            <div className="p-4 rounded-2xl bg-surface-2 border border-line">
              <span className="block text-xs font-medium text-ink-muted mb-1">Questões Resolvidas</span>
              <span className="text-xl font-extrabold text-ink">{currentWeekCheckin.questionsDone}</span>
            </div>
            <div className="p-4 rounded-2xl bg-surface-2 border border-line">
              <span className="block text-xs font-medium text-ink-muted mb-1">Nível de Foco</span>
              <div className="flex items-center gap-1 text-amber-400 mt-1">
                {Array.from({ length: currentWeekCheckin.focusRating }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400" />
                ))}
              </div>
            </div>

            {currentWeekCheckin.wins && (
              <div className="sm:col-span-3 p-4 rounded-2xl bg-surface-2 border border-line space-y-1">
                <span className="text-xs font-bold text-emerald-400 [html.theme-light_&]:text-emerald-700">Pontos Fortes da Semana:</span>
                <p className="text-xs text-ink-2 whitespace-pre-wrap">{currentWeekCheckin.wins}</p>
              </div>
            )}

            {currentWeekCheckin.difficulties && (
              <div className="sm:col-span-3 p-4 rounded-2xl bg-surface-2 border border-line space-y-1">
                <span className="text-xs font-bold text-amber-400 [html.theme-light_&]:text-amber-700">Dificuldades Relatadas:</span>
                <p className="text-xs text-ink-2 whitespace-pre-wrap">{currentWeekCheckin.difficulties}</p>
              </div>
            )}
          </div>
        )}

        {checkinSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 [html.theme-light_&]:text-emerald-700 text-xs font-semibold text-center animate-fadeIn">
            ✓ Check-in registrado com sucesso! Seu mentor foi atualizado.
          </div>
        )}
      </section>

      {/* 5. PRÓXIMOS ENCONTROS */}
      <section className="p-5 sm:p-7 rounded-3xl bg-surface border border-line shadow-card space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div>
            <h2 className="text-lg font-extrabold text-ink tracking-tight flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-400" />
              Próximos Encontros
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Alinhamentos individuais e sessões estratégicas em grupo.
            </p>
          </div>
        </div>

        {upcomingEncontros.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink-muted space-y-1">
            <p className="font-semibold text-ink-2">Nenhum encontro agendado no momento.</p>
            <p>Seu mentor agendará o próximo alinhamento em breve.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {upcomingEncontros.map((enc) => {
              const dt = new Date(enc.startsAtMs);
              const dateFormatted = dt.toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
              });
              const timeFormatted = dt.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={enc.id}
                  className="p-5 rounded-2xl bg-surface-2 border border-line hover:border-line-strong transition-all flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                          enc.scope === 'grupo'
                            ? 'bg-purple-500/15 text-purple-300 [html.theme-light_&]:text-purple-700 border-purple-500/30'
                            : 'bg-blue-500/15 text-blue-300 [html.theme-light_&]:text-blue-700 border-blue-500/30'
                        }`}
                      >
                        {enc.scope === 'grupo' ? 'Encontro em Grupo' : 'Individual'}
                      </span>
                      <span className="text-xs font-bold text-ink-2 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-ink-muted" />
                        {enc.durationMin} min
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold text-ink tracking-tight">{enc.title}</h3>

                    {enc.description && (
                      <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">
                        {enc.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-line-soft flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-brand-soft flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {dateFormatted} às {timeFormatted}
                    </span>

                    {enc.link ? (
                      <a
                        href={enc.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-all shadow-glow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Entrar
                      </a>
                    ) : (
                      <span className="text-[11px] text-ink-muted italic">Link em breve</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. EVOLUÇÃO (GRÁFICO SIMPLES DAS ÚLTIMAS 8 SEMANAS) */}
      <section className="p-5 sm:p-7 rounded-3xl bg-surface border border-line shadow-card space-y-6">
        <div>
          <h2 className="text-lg font-extrabold text-ink tracking-tight flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Evolução (Últimas 8 Semanas)
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Acompanhe o volume de estudo, questões resolvidas e consistência semana a semana.
          </p>
        </div>

        {/* Gráfico de Barras SVG Responsivo */}
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[480px] h-52 relative flex items-end justify-between gap-3 px-2 pt-6 pb-8 border-b border-line">
            {weeklySeries.map((s, idx) => {
              const heightHours = Math.max(6, Math.round((s.hoursStudied / maxHoursInSeries) * 120));
              const heightQuestions = Math.max(4, Math.round((s.questionsDone / maxQuestionsInSeries) * 120));
              const isCurrent = s.weekStart === currentWeekStart;

              return (
                <div key={s.weekStart} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute -top-12 z-20 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line-strong text-[10px] text-ink whitespace-nowrap shadow-pop transition-opacity">
                    <div>{s.hoursStudied}h estudadas</div>
                    <div>{s.questionsDone} questões</div>
                    <div>{s.tasksDone}/{s.tasksTotal} tarefas</div>
                  </div>

                  <div className="w-full flex items-end justify-center gap-1 h-36">
                    {/* Barra de Horas */}
                    <div
                      className={`w-3.5 sm:w-5 rounded-t-lg transition-all ${
                        isCurrent
                          ? 'bg-gradient-to-t from-blue-600 to-blue-400'
                          : 'bg-gradient-to-t from-blue-600/40 to-blue-500/70'
                      }`}
                      style={{ height: `${heightHours}px` }}
                    />

                    {/* Barra de Questões */}
                    <div
                      className={`w-3.5 sm:w-5 rounded-t-lg transition-all ${
                        isCurrent
                          ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                          : 'bg-gradient-to-t from-emerald-600/40 to-emerald-500/70'
                      }`}
                      style={{ height: `${heightQuestions}px` }}
                    />
                  </div>

                  <span className={`text-[10px] font-bold ${isCurrent ? 'text-ink' : 'text-ink-muted'}`}>
                    Sem {idx + 1}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-6 pt-3 text-xs text-ink-2">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-blue-500 inline-block" />
              Horas Estudadas
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              Questões Feitas
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
