import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  Flame,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Star,
  Target,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { Student } from '../types';
import {
  Mentoria,
  MentoriaCheckin,
  MentoriaEncontro,
  MentoriaStatus,
  MentoriaTask,
  TaskKind,
  addDays,
  copyWeekTasks,
  createTask,
  deleteEncontro,
  deleteTask,
  getWeekStart,
  giveCheckinFeedback,
  normalizeEmail,
  saveEncontro,
  saveMentoria,
  subscribeAllEncontros,
  subscribeAllMentorias,
  subscribeStudentCheckins,
  subscribeStudentTasks,
  updateTask,
} from '../utils/mentoriaService';

interface AdminMentoriaTabProps {
  students: Student[];
  currentUserUid: string;
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

export const AdminMentoriaTab: React.FC<AdminMentoriaTabProps> = ({
  students,
}) => {
  const [mentorias, setMentorias] = useState<Mentoria[]>([]);
  const [allEncontros, setAllEncontros] = useState<MentoriaEncontro[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentEmail, setSelectedStudentEmail] = useState<string | null>(null);

  // Selected student mentoria sub-tab: 'plano' | 'checkins' | 'encontros'
  const [studentTab, setStudentTab] = useState<'plano' | 'checkins' | 'encontros'>('plano');

  // Real-time data for the currently selected student
  const [studentTasks, setStudentTasks] = useState<MentoriaTask[]>([]);
  const [studentCheckins, setStudentCheckins] = useState<MentoriaCheckin[]>([]);

  // Modals
  const [enrollModalStudent, setEnrollModalStudent] = useState<Student | null>(null);
  const [enrollGoal, setEnrollGoal] = useState('');
  const [enrollExamTarget, setEnrollExamTarget] = useState('ENEM 2026');
  const [enrollHoursTarget, setEnrollHoursTarget] = useState('25');
  const [enrollStartDate, setEnrollStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [enrollStatus, setEnrollStatus] = useState<MentoriaStatus>('active');
  const [enrollGoalError, setEnrollGoalError] = useState('');
  const [isSavingEnroll, setIsSavingEnroll] = useState(false);
  const enrollGoalRef = useRef<HTMLTextAreaElement>(null);

  // Task Modal state
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MentoriaTask | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskKind, setTaskKind] = useState<TaskKind>('questoes');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskTitleError, setTaskTitleError] = useState('');
  const [isSavingTask, setIsSavingTask] = useState(false);
  const taskTitleRef = useRef<HTMLInputElement>(null);

  // Encontro Modal state
  const [encontroModalOpen, setEncontroModalOpen] = useState(false);
  const [editingEncontro, setEditingEncontro] = useState<MentoriaEncontro | null>(null);
  const [encontroScope, setEncontroScope] = useState<'individual' | 'grupo'>('individual');
  const [encontroTitle, setEncontroTitle] = useState('');
  const [encontroDescription, setEncontroDescription] = useState('');
  const [encontroDate, setEncontroDate] = useState(new Date().toISOString().slice(0, 10));
  const [encontroTime, setEncontroTime] = useState('19:00');
  const [encontroDurationMin, setEncontroDurationMin] = useState('60');
  const [encontroLink, setEncontroLink] = useState('');
  const [encontroNotes, setEncontroNotes] = useState('');
  const [encontroTitleError, setEncontroTitleError] = useState('');
  const [isSavingEncontro, setIsSavingEncontro] = useState(false);
  const encontroTitleRef = useRef<HTMLInputElement>(null);

  // Feedback draft state
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);

  // Current week
  const currentWeekStart = useMemo(() => getWeekStart(), []);
  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeekStart);

  // Subscribe to all mentorias & encontros
  useEffect(() => {
    const unsubM = subscribeAllMentorias((list) => setMentorias(list));
    const unsubE = subscribeAllEncontros((list) => setAllEncontros(list));
    return () => {
      unsubM();
      unsubE();
    };
  }, []);

  // Subscribe to specific student tasks & checkins when selected
  useEffect(() => {
    if (!selectedStudentEmail) {
      setStudentTasks([]);
      setStudentCheckins([]);
      return;
    }
    const unsubT = subscribeStudentTasks(selectedStudentEmail, (list) => {
      setStudentTasks(list);
    });
    const unsubC = subscribeStudentCheckins(selectedStudentEmail, (list) => {
      setStudentCheckins(list);
    });
    return () => {
      unsubT();
      unsubC();
    };
  }, [selectedStudentEmail]);

  // Selected student object & mentoria record
  const selectedStudent = useMemo(
    () =>
      students.find(
        (s) => normalizeEmail(s.email) === normalizeEmail(selectedStudentEmail || '')
      ) || null,
    [students, selectedStudentEmail]
  );

  const selectedMentoria = useMemo(
    () =>
      mentorias.find(
        (m) => normalizeEmail(m.studentEmail) === normalizeEmail(selectedStudentEmail || '')
      ) || null,
    [mentorias, selectedStudentEmail]
  );

  // Overview metrics
  const activeCount = useMemo(
    () => mentorias.filter((m) => m.status === 'active').length,
    [mentorias]
  );

  const weekTasksForSelected = useMemo(
    () => studentTasks.filter((t) => t.weekStart === selectedWeek),
    [studentTasks, selectedWeek]
  );

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.cpf && s.cpf.includes(q))
      );
    });
  }, [students, searchQuery]);

  // Open enroll modal
  const handleOpenEnroll = (student: Student, existing?: Mentoria | null) => {
    setEnrollModalStudent(student);
    setEnrollGoalError('');
    if (existing) {
      setEnrollGoal(existing.goal || '');
      setEnrollExamTarget(existing.examTarget || 'ENEM 2026');
      setEnrollHoursTarget(String(existing.weeklyHoursTarget || 25));
      setEnrollStartDate(existing.startDate || new Date().toISOString().slice(0, 10));
      setEnrollStatus(existing.status);
    } else {
      setEnrollGoal('Aprovação no curso de Medicina / Alta pontuação ENEM');
      setEnrollExamTarget('ENEM 2026');
      setEnrollHoursTarget('25');
      setEnrollStartDate(new Date().toISOString().slice(0, 10));
      setEnrollStatus('active');
    }
  };

  const handleSaveEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollModalStudent) return;
    if (!enrollGoal.trim()) {
      setEnrollGoalError('Informe a meta principal do aluno.');
      enrollGoalRef.current?.focus();
      return;
    }
    setEnrollGoalError('');
    setIsSavingEnroll(true);
    const isNew = !mentorias.some(
      (m) => normalizeEmail(m.studentEmail) === normalizeEmail(enrollModalStudent.email)
    );
    try {
      await saveMentoria(
        {
          studentEmail: enrollModalStudent.email,
          studentName: enrollModalStudent.name,
          status: enrollStatus,
          goal: enrollGoal,
          examTarget: enrollExamTarget,
          weeklyHoursTarget: Number(enrollHoursTarget) || 20,
          startDate: enrollStartDate,
          endDate: '',
        },
        isNew
      );
      setEnrollModalStudent(null);
    } catch (err) {
      console.error('Erro ao matricular na mentoria:', err);
    } finally {
      setIsSavingEnroll(false);
    }
  };

  const handleToggleMentoriaStatus = async (status: MentoriaStatus) => {
    if (!selectedMentoria) return;
    try {
      await saveMentoria(
        {
          ...selectedMentoria,
          status,
        },
        false
      );
    } catch (err) {
      console.error('Erro ao alterar status da mentoria:', err);
    }
  };

  // Task actions
  const handleOpenCreateTask = () => {
    setEditingTask(null);
    setTaskTitle('');
    setTaskDescription('');
    setTaskKind('questoes');
    setTaskDueDate('');
    setTaskTitleError('');
    setTaskModalOpen(true);
  };

  const handleOpenEditTask = (task: MentoriaTask) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setTaskKind(task.kind);
    setTaskDueDate(task.dueDate || '');
    setTaskTitleError('');
    setTaskModalOpen(true);
  };

  const handleSaveTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentEmail) return;
    if (!taskTitle.trim()) {
      setTaskTitleError('Informe o título da tarefa.');
      taskTitleRef.current?.focus();
      return;
    }
    setTaskTitleError('');
    setIsSavingTask(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, {
          title: taskTitle,
          description: taskDescription,
          kind: taskKind,
          dueDate: taskDueDate,
        });
      } else {
        await createTask({
          studentEmail: selectedStudentEmail,
          weekStart: selectedWeek,
          title: taskTitle,
          description: taskDescription,
          kind: taskKind,
          dueDate: taskDueDate,
        });
      }
      setTaskModalOpen(false);
    } catch (err) {
      console.error('Erro ao salvar tarefa:', err);
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleDeleteTaskAction = async (taskId: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;
    try {
      await deleteTask(taskId);
    } catch (err) {
      console.error('Erro ao excluir tarefa:', err);
    }
  };

  const handleCopyPreviousWeek = async () => {
    const prevWeek = addDays(selectedWeek, -7);
    if (!confirm(`Deseja copiar as tarefas da semana de ${formatWeekPeriod(prevWeek)} para ${formatWeekPeriod(selectedWeek)}?`)) {
      return;
    }
    try {
      await copyWeekTasks(studentTasks, prevWeek, selectedWeek);
    } catch (err) {
      console.error('Erro ao copiar tarefas:', err);
    }
  };

  // Feedback actions
  const handleSaveFeedback = async (checkinId: string) => {
    const text = feedbackDrafts[checkinId] ?? '';
    if (!text.trim()) return;
    setSavingFeedbackId(checkinId);
    try {
      await giveCheckinFeedback(checkinId, text);
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
    } finally {
      setSavingFeedbackId(null);
    }
  };

  // Encontro actions
  const handleOpenCreateEncontro = (scope: 'individual' | 'grupo' = 'individual') => {
    setEditingEncontro(null);
    setEncontroScope(scope);
    setEncontroTitle(scope === 'grupo' ? 'Encontro Estratégico de Mentoria' : 'Alinhamento Individual de Mentoria');
    setEncontroDescription('');
    setEncontroDate(new Date().toISOString().slice(0, 10));
    setEncontroTime('19:00');
    setEncontroDurationMin('60');
    setEncontroLink('');
    setEncontroNotes('');
    setEncontroTitleError('');
    setEncontroModalOpen(true);
  };

  const handleOpenEditEncontro = (enc: MentoriaEncontro) => {
    setEditingEncontro(enc);
    setEncontroScope(enc.scope);
    setEncontroTitle(enc.title);
    setEncontroDescription(enc.description);
    const dt = new Date(enc.startsAtMs);
    setEncontroDate(dt.toISOString().slice(0, 10));
    setEncontroTime(dt.toTimeString().slice(0, 5));
    setEncontroDurationMin(String(enc.durationMin));
    setEncontroLink(enc.link);
    setEncontroNotes(enc.notes);
    setEncontroTitleError('');
    setEncontroModalOpen(true);
  };

  const handleSaveEncontroSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encontroTitle.trim()) {
      setEncontroTitleError('Informe o título do encontro.');
      encontroTitleRef.current?.focus();
      return;
    }
    setEncontroTitleError('');
    setIsSavingEncontro(true);
    try {
      const startsAtMs = new Date(`${encontroDate}T${encontroTime}:00`).getTime();
      await saveEncontro(
        {
          scope: encontroScope,
          studentEmail: encontroScope === 'grupo' ? '' : selectedStudentEmail || '',
          title: encontroTitle,
          description: encontroDescription,
          startsAtMs: Number.isFinite(startsAtMs) ? startsAtMs : Date.now(),
          durationMin: Number(encontroDurationMin) || 60,
          link: encontroLink,
          notes: encontroNotes,
        },
        editingEncontro?.id
      );
      setEncontroModalOpen(false);
    } catch (err) {
      console.error('Erro ao salvar encontro:', err);
    } finally {
      setIsSavingEncontro(false);
    }
  };

  const handleDeleteEncontroAction = async (id: string) => {
    if (!confirm('Deseja excluir este encontro?')) return;
    try {
      await deleteEncontro(id);
    } catch (err) {
      console.error('Erro ao excluir encontro:', err);
    }
  };

  // Filter meetings for the selected student:
  const studentEncontros = useMemo(() => {
    if (!selectedStudentEmail) return allEncontros;
    return allEncontros.filter(
      (e) =>
        e.scope === 'grupo' ||
        normalizeEmail(e.studentEmail) === normalizeEmail(selectedStudentEmail)
    );
  }, [allEncontros, selectedStudentEmail]);

  return (
    <div className="space-y-6 pb-20 sm:pb-6">
      {/* OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-line shadow-card space-y-1">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block">
            Alunos Ativos
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-ink">{activeCount}</span>
            <span className="text-xs text-ink-muted">na mentoria</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-line shadow-card space-y-1">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block">
            Encontros Agendados
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-purple-400">
              {allEncontros.filter((e) => e.startsAtMs >= Date.now() - 3600000).length}
            </span>
            <span className="text-xs text-ink-muted">futuros</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-line shadow-card space-y-1">
          <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider block">
            Total Matriculados
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-brand-soft">{mentorias.length}</span>
            <span className="text-xs text-ink-muted">registros</span>
          </div>
        </div>
      </div>

      {/* MAIN VIEW: LIST OF STUDENTS OR SELECTED STUDENT HUB */}
      {!selectedStudent ? (
        /* LIST OF ALL STUDENTS WITH MENTORIA STATUS */
        <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-line shadow-card space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-soft" />
                Alunos da Plataforma
              </h3>
              <p className="text-xs text-ink-muted">
                Selecione um aluno para acompanhar tarefas, check-ins e encontros.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-ink-muted absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-inset border border-line text-xs text-ink focus:outline-none focus:border-brand-soft"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-ink-2">
              <thead>
                <tr className="border-b border-line text-ink-muted uppercase text-[10px] tracking-wider font-bold">
                  <th className="py-3 px-3">Aluno</th>
                  <th className="py-3 px-3">Status Mentoria</th>
                  <th className="py-3 px-3 hidden md:table-cell">Meta / Alvo</th>
                  <th className="py-3 px-3 hidden sm:table-cell">Horas/Sem</th>
                  <th className="py-3 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-muted">
                      Nenhum aluno encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((stu) => {
                    const ment = mentorias.find(
                      (m) => normalizeEmail(m.studentEmail) === normalizeEmail(stu.email)
                    );

                    return (
                      <tr key={stu.id} className="cv-auto-row hover:bg-surface-2/50 transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-bold text-ink block truncate max-w-[200px] sm:max-w-xs">
                            {stu.name}
                          </span>
                          <span className="text-[11px] text-ink-muted block truncate max-w-[200px] sm:max-w-xs">
                            {stu.email}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          {ment ? (
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide ${
                                ment.status === 'active'
                                  ? 'bg-emerald-500/15 text-emerald-400 [html.theme-light_&]:text-emerald-700 border-emerald-500/30'
                                  : ment.status === 'paused'
                                    ? 'bg-amber-500/15 text-amber-400 [html.theme-light_&]:text-amber-700 border-amber-500/30'
                                    : 'bg-slate-500/15 text-slate-400 [html.theme-light_&]:text-slate-700 border-slate-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  ment.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                                }`}
                              />
                              {ment.status === 'active'
                                ? 'Ativa'
                                : ment.status === 'paused'
                                  ? 'Pausada'
                                  : 'Encerrada'}
                            </span>
                          ) : (
                            <span className="text-ink-muted text-[11px] italic">Não matriculado</span>
                          )}
                        </td>

                        <td className="py-3 px-3 hidden md:table-cell">
                          {ment ? (
                            <span className="text-ink-2 block truncate max-w-xs">
                              {ment.examTarget || ment.goal || '—'}
                            </span>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3 hidden sm:table-cell font-bold text-ink-2">
                          {ment ? `${ment.weeklyHoursTarget}h` : '—'}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {ment ? (
                            <button
                              type="button"
                              onClick={() => setSelectedStudentEmail(stu.email)}
                              className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Gerenciar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenEnroll(stu, null)}
                              className="px-3 py-1.5 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 font-bold text-xs border border-line transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Matricular
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* INDIVIDUAL STUDENT MENTORIA HUB */
        <div className="space-y-6">
          {/* Top Return Bar & Student Status */}
          <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-line shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedStudentEmail(null)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-ink transition-colors cursor-pointer mb-1"
              >
                <ChevronLeft className="w-4 h-4 text-brand-soft" />
                Voltar à lista de alunos
              </button>

              <h2 className="text-xl font-extrabold text-ink tracking-tight flex items-center gap-2">
                {selectedStudent.name}
              </h2>
              <p className="text-xs text-ink-muted">
                {selectedStudent.email} • {selectedMentoria?.examTarget || 'Alvo não informado'} ({selectedMentoria?.weeklyHoursTarget || 0}h/sem)
              </p>
            </div>

            {/* Quick Status Toggles & Edit Settings */}
            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <div className="flex items-center gap-1 bg-inset p-1 rounded-xl border border-line">
                <button
                  type="button"
                  onClick={() => handleToggleMentoriaStatus('active')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    selectedMentoria?.status === 'active'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Ativa
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleMentoriaStatus('paused')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    selectedMentoria?.status === 'paused'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Pausada
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleMentoriaStatus('ended')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    selectedMentoria?.status === 'ended'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Encerrada
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenEnroll(selectedStudent, selectedMentoria)}
                className="p-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 hover:text-ink border border-line transition-colors cursor-pointer"
                title="Editar dados da mentoria"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-tabs: Plano, Check-ins, Encontros */}
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <button
              type="button"
              onClick={() => setStudentTab('plano')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                studentTab === 'plano'
                  ? 'bg-brand text-white'
                  : 'bg-chip text-ink-2 hover:bg-chip-hover hover:text-ink'
              }`}
            >
              <Target className="w-4 h-4" />
              Plano Semanal ({weekTasksForSelected.length})
            </button>

            <button
              type="button"
              onClick={() => setStudentTab('checkins')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                studentTab === 'checkins'
                  ? 'bg-brand text-white'
                  : 'bg-chip text-ink-2 hover:bg-chip-hover hover:text-ink'
              }`}
            >
              <Flame className="w-4 h-4" />
              Check-ins ({studentCheckins.length})
            </button>

            <button
              type="button"
              onClick={() => setStudentTab('encontros')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                studentTab === 'encontros'
                  ? 'bg-brand text-white'
                  : 'bg-chip text-ink-2 hover:bg-chip-hover hover:text-ink'
              }`}
            >
              <Video className="w-4 h-4" />
              Encontros ({studentEncontros.length})
            </button>
          </div>

          {/* SUB-TAB 1: PLANO SEMANAL DE TAREFAS */}
          {studentTab === 'plano' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-line shadow-card space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedWeek((w) => addDays(w, -7))}
                      className="p-1.5 rounded-lg bg-chip hover:bg-chip-hover text-ink-2 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-extrabold text-ink">
                      Semana de {formatWeekPeriod(selectedWeek)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedWeek((w) => addDays(w, 7))}
                      className="p-1.5 rounded-lg bg-chip hover:bg-chip-hover text-ink-2 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {selectedWeek !== currentWeekStart && (
                    <button
                      type="button"
                      onClick={() => setSelectedWeek(currentWeekStart)}
                      className="px-2 py-1 rounded-md bg-brand/20 text-brand-soft text-[10px] font-bold"
                    >
                      Atual
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyPreviousWeek}
                    className="px-3 py-1.5 rounded-xl bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 border border-line flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5 text-ink-muted" />
                    Copiar Semana Anterior
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenCreateTask}
                    className="px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-xs font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-glow-sm whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nova Tarefa
                  </button>
                </div>
              </div>

              {/* Lista de Tarefas da Semana */}
              {weekTasksForSelected.length === 0 ? (
                <div className="py-10 text-center text-xs text-ink-muted space-y-2">
                  <p className="font-semibold text-ink-2">Nenhuma tarefa criada para esta semana.</p>
                  <p>Clique no botão acima para adicionar tarefas ou copie as da semana anterior.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {weekTasksForSelected.map((task) => {
                    const kindCfg = TASK_KIND_LABELS[task.kind] || TASK_KIND_LABELS.outro;
                    return (
                      <div
                        key={task.id}
                        className="p-4 rounded-xl bg-surface-2 border border-line hover:border-line-strong transition-all flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${kindCfg.badgeClass}`}
                            >
                              {kindCfg.label}
                            </span>

                            {task.done ? (
                              <span className="text-[10px] font-bold text-emerald-400 [html.theme-light_&]:text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Concluída pelo aluno
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-ink-muted">Pendente</span>
                            )}

                            {task.dueDate && (
                              <span className="text-[11px] text-ink-muted">
                                Prazo: {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>

                          <h4
                            className={`text-sm font-bold text-ink ${
                              task.done ? 'line-through opacity-70' : ''
                            }`}
                          >
                            {task.title}
                          </h4>

                          {task.description && (
                            <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">
                              {task.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditTask(task)}
                            className="p-2 rounded-lg bg-chip hover:bg-chip-hover text-ink-2 hover:text-ink transition-colors cursor-pointer"
                            title="Editar tarefa"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTaskAction(task.id)}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                            title="Excluir tarefa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 2: CHECK-INS SEMANAIS & FEEDBACK */}
          {studentTab === 'checkins' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-line shadow-card space-y-6">
              <div>
                <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  Histórico de Check-ins do Aluno
                </h3>
                <p className="text-xs text-ink-muted">
                  Acompanhe os relatos semanais de horas, questões, dificuldades e envie seu feedback.
                </p>
              </div>

              {studentCheckins.length === 0 ? (
                <div className="py-10 text-center text-xs text-ink-muted">
                  O aluno ainda não enviou nenhum check-in semanal.
                </div>
              ) : (
                <div className="space-y-6">
                  {studentCheckins
                    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
                    .map((chk) => {
                      const currentFeedback =
                        feedbackDrafts[chk.id] !== undefined
                          ? feedbackDrafts[chk.id]
                          : chk.mentorFeedback || '';

                      return (
                        <div
                          key={chk.id}
                          className="p-5 rounded-2xl bg-surface-2 border border-line space-y-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line-soft">
                            <span className="text-sm font-extrabold text-ink">
                              Semana de {formatWeekPeriod(chk.weekStart)}
                            </span>

                            <div className="flex items-center gap-4 text-xs font-bold">
                              <span className="text-brand-soft">{chk.hoursStudied}h estudadas</span>
                              <span className="text-emerald-400 [html.theme-light_&]:text-emerald-700">{chk.questionsDone} questões</span>
                              <span className="text-amber-400 [html.theme-light_&]:text-amber-700 flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-amber-400" /> Foco: {chk.focusRating}/5
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="p-3.5 rounded-xl bg-surface border border-line-soft space-y-1">
                              <span className="font-bold text-emerald-400 [html.theme-light_&]:text-emerald-700 block">O que deu certo:</span>
                              <p className="text-ink-2 whitespace-pre-wrap">
                                {chk.wins || 'Não informado'}
                              </p>
                            </div>

                            <div className="p-3.5 rounded-xl bg-surface border border-line-soft space-y-1">
                              <span className="font-bold text-amber-400 [html.theme-light_&]:text-amber-700 block">Dificuldades:</span>
                              <p className="text-ink-2 whitespace-pre-wrap">
                                {chk.difficulties || 'Não informado'}
                              </p>
                            </div>
                          </div>

                          {/* Feedback do Mentor */}
                          <div className="pt-2 border-t border-line-soft space-y-2">
                            <label className="block text-xs font-bold text-brand-soft flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-brand-soft" />
                              Feedback do Mentor para esta semana:
                            </label>
                            <textarea
                              rows={3}
                              placeholder="Escreva sua orientação para o aluno sobre os pontos fortes e ajustes de rota..."
                              value={currentFeedback}
                              onChange={(e) =>
                                setFeedbackDrafts((prev) => ({
                                  ...prev,
                                  [chk.id]: e.target.value,
                                }))
                              }
                              className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink text-xs focus:outline-none focus:border-brand-soft resize-none"
                            />
                            <div className="flex justify-end">
                              <button
                                type="button"
                                disabled={savingFeedbackId === chk.id}
                                onClick={() => handleSaveFeedback(chk.id)}
                                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50 cursor-pointer"
                              >
                                {savingFeedbackId === chk.id ? 'Salvando...' : 'Salvar Feedback'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 3: ENCONTROS (INDIVIDUAIS + GRUPO) */}
          {studentTab === 'encontros' && (
            <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-line shadow-card space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
                <div>
                  <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                    <Video className="w-4 h-4 text-purple-400" />
                    Encontros do Aluno
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Sessões individuais deste aluno e encontros gerais em grupo.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenCreateEncontro('grupo')}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 [html.theme-light_&]:text-purple-700 hover:bg-purple-500/30 text-xs font-bold border border-purple-500/30 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    + Em Grupo
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenCreateEncontro('individual')}
                    className="px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-xs font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-glow-sm whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Individual
                  </button>
                </div>
              </div>

              {studentEncontros.length === 0 ? (
                <div className="py-10 text-center text-xs text-ink-muted space-y-1">
                  <p className="font-semibold text-ink-2">Nenhum encontro agendado.</p>
                  <p>Agende uma sessão individual ou um encontro de grupo para os alunos.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {studentEncontros.map((enc) => {
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
                        className="p-4 sm:p-5 rounded-2xl bg-surface-2 border border-line hover:border-line-strong transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                enc.scope === 'grupo'
                                  ? 'bg-purple-500/15 text-purple-300 [html.theme-light_&]:text-purple-700 border-purple-500/30'
                                  : 'bg-blue-500/15 text-blue-300 [html.theme-light_&]:text-blue-700 border-blue-500/30'
                              }`}
                            >
                              {enc.scope === 'grupo' ? 'Grupo' : 'Individual'}
                            </span>
                            <span className="text-xs font-bold text-brand-soft">
                              {dateFormatted} às {timeFormatted} ({enc.durationMin} min)
                            </span>
                          </div>

                          <h4 className="text-sm font-extrabold text-ink">{enc.title}</h4>

                          {enc.description && (
                            <p className="text-xs text-ink-2 whitespace-pre-wrap">{enc.description}</p>
                          )}

                          {enc.link && (
                            <a
                              href={enc.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline pt-0.5"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {enc.link}
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditEncontro(enc)}
                            className="p-2 rounded-lg bg-chip hover:bg-chip-hover text-ink-2 hover:text-ink transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEncontroAction(enc.id)}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: MATRICULAR / EDITAR MENTORIA */}
      {enrollModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-surface border border-line p-6 space-y-5 shadow-pop">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-soft" />
                Matrícula na Mentoria
              </h3>
              <button
                type="button"
                onClick={() => setEnrollModalStudent(null)}
                className="text-ink-muted hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSaveEnrollSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-ink-2 font-medium mb-1">Aluno</label>
                <input
                  type="text"
                  disabled
                  value={`${enrollModalStudent.name} (${enrollModalStudent.email})`}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-chip border border-line text-ink-2 opacity-80"
                />
              </div>

              <div>
                <label className="block text-ink-2 font-medium mb-1">
                  Meta Principal do Aluno
                </label>
                <textarea
                  ref={enrollGoalRef}
                  rows={3}
                  maxLength={600}
                  placeholder="ex: Foco em gabaritar Física e Química no ENEM e USP..."
                  value={enrollGoal}
                  onChange={(e) => {
                    setEnrollGoal(e.target.value);
                    if (enrollGoalError) setEnrollGoalError('');
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border ${
                    enrollGoalError ? 'border-danger focus:border-danger' : 'border-line focus:border-brand-soft'
                  } text-ink focus:outline-none resize-none text-xs`}
                />
                {enrollGoalError && (
                  <p className="text-xs text-danger mt-1">{enrollGoalError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-2 font-medium mb-1">Prova-Alvo</label>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder="ex: ENEM 2026"
                    value={enrollExamTarget}
                    onChange={(e) => setEnrollExamTarget(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  />
                </div>

                <div>
                  <label className="block text-ink-2 font-medium mb-1">
                    Meta de Horas / Semana
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="25"
                    value={enrollHoursTarget}
                    onChange={(e) => setEnrollHoursTarget(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-2 font-medium mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={enrollStartDate}
                    onChange={(e) => setEnrollStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  />
                </div>

                <div>
                  <label className="block text-ink-2 font-medium mb-1">Status da Mentoria</label>
                  <select
                    value={enrollStatus}
                    onChange={(e) => setEnrollStatus(e.target.value as MentoriaStatus)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  >
                    <option value="active">Ativa</option>
                    <option value="paused">Pausada</option>
                    <option value="ended">Encerrada</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setEnrollModalStudent(null)}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEnroll}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-glow-sm"
                >
                  {isSavingEnroll ? 'Salvando...' : 'Salvar Matrícula'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR / EDITAR TAREFA */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-surface border border-line p-6 space-y-5 shadow-pop">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                <Target className="w-4 h-4 text-brand-soft" />
                {editingTask ? 'Editar Tarefa' : 'Nova Tarefa Semanal'}
              </h3>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="text-ink-muted hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSaveTaskSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-ink-2 font-medium mb-1">Título da Tarefa</label>
                <input
                  ref={taskTitleRef}
                  type="text"
                  maxLength={160}
                  placeholder="ex: Resolver lista de 45 exercícios de Óptica Geométrica"
                  value={taskTitle}
                  onChange={(e) => {
                    setTaskTitle(e.target.value);
                    if (taskTitleError) setTaskTitleError('');
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border ${
                    taskTitleError ? 'border-danger focus:border-danger' : 'border-line focus:border-brand-soft'
                  } text-ink focus:outline-none text-xs`}
                />
                {taskTitleError && (
                  <p className="text-xs text-danger mt-1">{taskTitleError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-2 font-medium mb-1">Tipo de Tarefa</label>
                  <select
                    value={taskKind}
                    onChange={(e) => setTaskKind(e.target.value as TaskKind)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  >
                    <option value="questoes">Questões</option>
                    <option value="aula">Aula</option>
                    <option value="simulado">Simulado</option>
                    <option value="revisao">Revisão</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-ink-2 font-medium mb-1">
                    Prazo Específico (Opcional)
                  </label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink-2 font-medium mb-1">
                  Orientações / Detalhes (Opcional)
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="ex: Focar nas questões de refração e espelhos esféricos..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft resize-none text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingTask}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-glow-sm"
                >
                  {isSavingTask ? 'Salvando...' : editingTask ? 'Salvar Alterações' : 'Criar Tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR / EDITAR ENCONTRO */}
      {encontroModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-surface border border-line p-6 space-y-5 shadow-pop">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                {editingEncontro ? 'Editar Encontro' : 'Agendar Encontro de Mentoria'}
              </h3>
              <button
                type="button"
                onClick={() => setEncontroModalOpen(false)}
                className="text-ink-muted hover:text-ink cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSaveEncontroSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-2 font-medium mb-1">Modalidade</label>
                  <select
                    value={encontroScope}
                    onChange={(e) => setEncontroScope(e.target.value as 'individual' | 'grupo')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  >
                    <option value="individual">Individual ({selectedStudent?.name || 'Aluno'})</option>
                    <option value="grupo">Em Grupo (Todos os alunos da mentoria)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-ink-2 font-medium mb-1">Duração (minutos)</label>
                  <input
                    type="number"
                    min="5"
                    max="600"
                    value={encontroDurationMin}
                    onChange={(e) => setEncontroDurationMin(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink-2 font-medium mb-1">Título do Encontro</label>
                <input
                  ref={encontroTitleRef}
                  type="text"
                  maxLength={160}
                  placeholder="ex: Alinhamento Estratégico de Estudos"
                  value={encontroTitle}
                  onChange={(e) => {
                    setEncontroTitle(e.target.value);
                    if (encontroTitleError) setEncontroTitleError('');
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-inset border ${
                    encontroTitleError ? 'border-danger focus:border-danger' : 'border-line focus:border-brand-soft'
                  } text-ink focus:outline-none text-xs`}
                />
                {encontroTitleError && (
                  <p className="text-xs text-danger mt-1">{encontroTitleError}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink-2 font-medium mb-1">Data</label>
                  <input
                    type="date"
                    value={encontroDate}
                    onChange={(e) => setEncontroDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  />
                </div>

                <div>
                  <label className="block text-ink-2 font-medium mb-1">Horário</label>
                  <input
                    type="time"
                    value={encontroTime}
                    onChange={(e) => setEncontroTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink-2 font-medium mb-1">
                  Link da Sala (Google Meet / Zoom - deve iniciar com https://)
                </label>
                <input
                  type="url"
                  maxLength={500}
                  placeholder="https://meet.google.com/..."
                  value={encontroLink}
                  onChange={(e) => setEncontroLink(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft text-xs"
                />
              </div>

              <div>
                <label className="block text-ink-2 font-medium mb-1">
                  Pauta / Descrição do Encontro (Opcional)
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="ex: Avaliação dos últimos simulados e organização da reta final..."
                  value={encontroDescription}
                  onChange={(e) => setEncontroDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-inset border border-line text-ink focus:outline-none focus:border-brand-soft resize-none text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setEncontroModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-chip hover:bg-chip-hover text-ink-2 font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEncontro}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-glow-sm"
                >
                  {isSavingEncontro ? 'Salvando...' : editingEncontro ? 'Salvar Alterações' : 'Agendar Encontro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
