// src/utils/mentoriaService.ts
// Camada de dados da MENTORIA (Firestore). Casa 1:1 com o firestore.rules entregue.
// Não tem interface: a tela (MentoriaWindow) e o painel do admin usam estas funções.

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
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { emailToStudentDocId, generateSafeId } from '../types';

// ---------------------------------------------------------------- tipos

export type MentoriaStatus = 'active' | 'paused' | 'ended';
export type TaskKind = 'aula' | 'questoes' | 'simulado' | 'revisao' | 'outro';
export type EncontroScope = 'individual' | 'grupo';

export interface Mentoria {
  id: string; // = emailToStudentDocId(studentEmail)
  studentEmail: string; // sempre em minúsculas
  studentName: string;
  status: MentoriaStatus;
  goal: string; // meta principal (até 600 caracteres)
  examTarget: string; // ex.: "ENEM 2027" (até 120)
  weeklyHoursTarget: number; // meta de horas por semana (0 a 100)
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD ou ''
  mentorId: string;
}

export interface MentoriaTask {
  id: string;
  studentEmail: string;
  weekStart: string; // segunda-feira da semana, YYYY-MM-DD
  title: string;
  description: string;
  kind: TaskKind;
  dueDate: string; // YYYY-MM-DD ou ''
  done: boolean;
  doneAtMs: number; // 0 se não feita
  mentorId: string;
}

export interface MentoriaCheckin {
  id: string; // `${emailToStudentDocId(email)}_${weekStart}`
  studentEmail: string;
  weekStart: string;
  hoursStudied: number; // 0 a 168
  questionsDone: number; // 0 a 5000
  focusRating: number; // 1 a 5
  wins: string; // até 1500
  difficulties: string; // até 1500
  mentorFeedback: string; // só o admin escreve
  feedbackAtMs: number; // 0 se ainda sem feedback
}

export interface MentoriaEncontro {
  id: string;
  scope: EncontroScope;
  studentEmail: string; // '' quando scope === 'grupo'
  title: string;
  description: string;
  startsAtMs: number;
  durationMin: number; // 5 a 600
  link: string; // '' ou começa com https://
  notes: string;
  mentorId: string;
}

// ---------------------------------------------------------------- utilidades

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Segunda-feira da semana de `date` (horário local), no formato YYYY-MM-DD. */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
}

export function checkinDocId(email: string, weekStart: string): string {
  return `${emailToStudentDocId(normalizeEmail(email))}_${weekStart}`;
}

function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return Math.min(max, Math.max(min, v));
}

function clampText(s: string, max: number): string {
  return (s || '').trim().slice(0, max);
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Usuário não autenticado');
  return uid;
}

function withId<T>(snap: { id: string; data(): unknown }): T {
  return { ...(snap.data() as object), id: snap.id } as T;
}

// ---------------------------------------------------------------- ALUNO (leitura)

/** Matrícula do próprio aluno. cb recebe null se não existir. */
export function subscribeMyMentoria(
  email: string,
  cb: (m: Mentoria | null) => void
): Unsubscribe {
  const id = emailToStudentDocId(normalizeEmail(email));
  return onSnapshot(
    doc(db, 'mentorias', id),
    (snap) => cb(snap.exists() ? withId<Mentoria>(snap) : null),
    (err) => {
      cb(null);
      handleFirestoreError(err, OperationType.GET, `mentorias/${id}`);
    }
  );
}

export function subscribeMyTasks(
  email: string,
  cb: (tasks: MentoriaTask[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'mentoriaTasks'),
    where('studentEmail', '==', normalizeEmail(email))
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => withId<MentoriaTask>(d))),
    (err) => {
      cb([]);
      handleFirestoreError(err, OperationType.LIST, 'mentoriaTasks');
    }
  );
}

export function subscribeMyCheckins(
  email: string,
  cb: (list: MentoriaCheckin[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'mentoriaCheckins'),
    where('studentEmail', '==', normalizeEmail(email))
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => withId<MentoriaCheckin>(d))),
    (err) => {
      cb([]);
      handleFirestoreError(err, OperationType.LIST, 'mentoriaCheckins');
    }
  );
}

/** Encontros do aluno: individuais dele + os de grupo (duas consultas juntas). */
export function subscribeMyEncontros(
  email: string,
  cb: (list: MentoriaEncontro[]) => void
): Unsubscribe {
  let individual: MentoriaEncontro[] = [];
  let grupo: MentoriaEncontro[] = [];
  const emit = () =>
    cb([...individual, ...grupo].sort((a, b) => a.startsAtMs - b.startsAtMs));

  const u1 = onSnapshot(
    query(
      collection(db, 'mentoriaEncontros'),
      where('studentEmail', '==', normalizeEmail(email))
    ),
    (snap) => {
      individual = snap.docs.map((d) => withId<MentoriaEncontro>(d));
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'mentoriaEncontros')
  );
  const u2 = onSnapshot(
    query(collection(db, 'mentoriaEncontros'), where('scope', '==', 'grupo')),
    (snap) => {
      grupo = snap.docs.map((d) => withId<MentoriaEncontro>(d));
      emit();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'mentoriaEncontros')
  );
  return () => {
    u1();
    u2();
  };
}

// ---------------------------------------------------------------- ALUNO (escrita)

/** O aluno só pode marcar/desmarcar a tarefa como feita. */
export async function setTaskDone(taskId: string, done: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'mentoriaTasks', taskId), {
      done,
      doneAtMs: done ? Date.now() : 0,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `mentoriaTasks/${taskId}`);
    throw err;
  }
}

export interface CheckinInput {
  hoursStudied: number;
  questionsDone: number;
  focusRating: number;
  wins: string;
  difficulties: string;
}

/** Cria o check-in da semana ou edita o que já existe (um por semana). */
export async function saveMyCheckin(
  email: string,
  weekStart: string,
  input: CheckinInput,
  alreadyExists: boolean
): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  const id = checkinDocId(cleanEmail, weekStart);
  const fields = {
    hoursStudied: Math.min(168, Math.max(0, Number(input.hoursStudied) || 0)),
    questionsDone: clampInt(input.questionsDone, 0, 5000),
    focusRating: clampInt(input.focusRating, 1, 5),
    wins: clampText(input.wins, 1500),
    difficulties: clampText(input.difficulties, 1500),
  };
  try {
    if (alreadyExists) {
      await updateDoc(doc(db, 'mentoriaCheckins', id), {
        ...fields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'mentoriaCheckins', id), {
        studentEmail: cleanEmail,
        weekStart,
        ...fields,
        mentorFeedback: '',
        feedbackAtMs: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(
      err,
      alreadyExists ? OperationType.UPDATE : OperationType.CREATE,
      `mentoriaCheckins/${id}`
    );
    throw err;
  }
}

// ---------------------------------------------------------------- ADMIN

export function subscribeAllMentorias(cb: (list: Mentoria[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'mentorias'),
    (snap) => cb(snap.docs.map((d) => withId<Mentoria>(d))),
    (err) => handleFirestoreError(err, OperationType.LIST, 'mentorias')
  );
}

export function subscribeStudentTasks(
  email: string,
  cb: (tasks: MentoriaTask[]) => void
): Unsubscribe {
  return subscribeMyTasks(email, cb); // mesma consulta; o admin passa nas regras
}

export function subscribeStudentCheckins(
  email: string,
  cb: (list: MentoriaCheckin[]) => void
): Unsubscribe {
  return subscribeMyCheckins(email, cb);
}

export function subscribeAllEncontros(
  cb: (list: MentoriaEncontro[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'mentoriaEncontros'),
    (snap) =>
      cb(
        snap.docs
          .map((d) => withId<MentoriaEncontro>(d))
          .sort((a, b) => a.startsAtMs - b.startsAtMs)
      ),
    (err) => handleFirestoreError(err, OperationType.LIST, 'mentoriaEncontros')
  );
}

export type MentoriaInput = Omit<Mentoria, 'id' | 'mentorId' | 'studentEmail'> & {
  studentEmail: string;
};

/** Matricula (ou atualiza) um aluno na mentoria. `isNew` = true na primeira vez. */
export async function saveMentoria(input: MentoriaInput, isNew: boolean): Promise<void> {
  const uid = requireUid();
  const email = normalizeEmail(input.studentEmail);
  const id = emailToStudentDocId(email);
  const base = {
    studentEmail: email,
    studentName: clampText(input.studentName, 120) || 'Aluno',
    status: input.status,
    goal: clampText(input.goal, 600),
    examTarget: clampText(input.examTarget, 120),
    weeklyHoursTarget: clampInt(input.weeklyHoursTarget, 0, 100),
    startDate: input.startDate,
    endDate: input.endDate || '',
    mentorId: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    if (isNew) {
      await setDoc(doc(db, 'mentorias', id), { ...base, createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, 'mentorias', id), base);
    }
  } catch (err) {
    handleFirestoreError(
      err,
      isNew ? OperationType.CREATE : OperationType.UPDATE,
      `mentorias/${id}`
    );
    throw err;
  }
}

export async function deleteMentoria(email: string): Promise<void> {
  const id = emailToStudentDocId(normalizeEmail(email));
  try {
    await deleteDoc(doc(db, 'mentorias', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `mentorias/${id}`);
    throw err;
  }
}

export type TaskInput = Pick<
  MentoriaTask,
  'studentEmail' | 'weekStart' | 'title' | 'description' | 'kind' | 'dueDate'
>;

export async function createTask(input: TaskInput): Promise<void> {
  const uid = requireUid();
  const id = generateSafeId('mtask');
  try {
    await setDoc(doc(db, 'mentoriaTasks', id), {
      studentEmail: normalizeEmail(input.studentEmail),
      weekStart: input.weekStart,
      title: clampText(input.title, 160) || 'Tarefa',
      description: clampText(input.description, 1000),
      kind: input.kind,
      dueDate: input.dueDate || '',
      done: false,
      doneAtMs: 0,
      mentorId: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `mentoriaTasks/${id}`);
    throw err;
  }
}

export async function updateTask(
  taskId: string,
  patch: Partial<Pick<MentoriaTask, 'title' | 'description' | 'kind' | 'dueDate' | 'weekStart'>>
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title !== undefined) data.title = clampText(patch.title, 160) || 'Tarefa';
  if (patch.description !== undefined) data.description = clampText(patch.description, 1000);
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.weekStart !== undefined) data.weekStart = patch.weekStart;
  try {
    await updateDoc(doc(db, 'mentoriaTasks', taskId), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `mentoriaTasks/${taskId}`);
    throw err;
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'mentoriaTasks', taskId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `mentoriaTasks/${taskId}`);
    throw err;
  }
}

/** Copia as tarefas de uma semana para outra (todas voltam como não feitas). */
export async function copyWeekTasks(
  tasks: MentoriaTask[],
  fromWeek: string,
  toWeek: string
): Promise<void> {
  const offset = Math.round(
    (new Date(toWeek).getTime() - new Date(fromWeek).getTime()) / 86400000
  );
  for (const t of tasks.filter((x) => x.weekStart === fromWeek)) {
    await createTask({
      studentEmail: t.studentEmail,
      weekStart: toWeek,
      title: t.title,
      description: t.description,
      kind: t.kind,
      dueDate: t.dueDate ? addDays(t.dueDate, offset) : '',
    });
  }
}

/** Feedback do mentor em um check-in. */
export async function giveCheckinFeedback(checkinId: string, text: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'mentoriaCheckins', checkinId), {
      mentorFeedback: clampText(text, 3000),
      feedbackAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `mentoriaCheckins/${checkinId}`);
    throw err;
  }
}

export type EncontroInput = Omit<MentoriaEncontro, 'id' | 'mentorId'>;

/** Cria (id vazio) ou edita um encontro. */
export async function saveEncontro(input: EncontroInput, id?: string): Promise<void> {
  const uid = requireUid();
  const docId = id || generateSafeId('menc');
  const link = (input.link || '').trim();
  const data = {
    scope: input.scope,
    studentEmail: input.scope === 'grupo' ? '' : normalizeEmail(input.studentEmail),
    title: clampText(input.title, 160) || 'Encontro',
    description: clampText(input.description, 1000),
    startsAtMs: Math.max(0, Math.round(input.startsAtMs)),
    durationMin: clampInt(input.durationMin, 5, 600),
    link: link.startsWith('https://') ? link.slice(0, 500) : '',
    notes: clampText(input.notes, 3000),
    mentorId: uid,
    updatedAt: serverTimestamp(),
  };
  try {
    if (id) {
      await updateDoc(doc(db, 'mentoriaEncontros', docId), data);
    } else {
      await setDoc(doc(db, 'mentoriaEncontros', docId), {
        ...data,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(
      err,
      id ? OperationType.UPDATE : OperationType.CREATE,
      `mentoriaEncontros/${docId}`
    );
    throw err;
  }
}

export async function deleteEncontro(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'mentoriaEncontros', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `mentoriaEncontros/${id}`);
    throw err;
  }
}

// ---------------------------------------------------------------- resumos (puros)

export interface WeekSummary {
  weekStart: string;
  tasksTotal: number;
  tasksDone: number;
  hoursStudied: number;
  questionsDone: number;
  hasCheckin: boolean;
}

/** Série semanal para o gráfico de evolução (últimas `weeks` semanas, da mais antiga à atual). */
export function buildWeeklySeries(
  tasks: MentoriaTask[],
  checkins: MentoriaCheckin[],
  weeks = 8
): WeekSummary[] {
  const current = getWeekStart();
  const out: WeekSummary[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(current, -7 * i);
    const wt = tasks.filter((t) => t.weekStart === ws);
    const ck = checkins.find((c) => c.weekStart === ws);
    out.push({
      weekStart: ws,
      tasksTotal: wt.length,
      tasksDone: wt.filter((t) => t.done).length,
      hoursStudied: ck?.hoursStudied ?? 0,
      questionsDone: ck?.questionsDone ?? 0,
      hasCheckin: Boolean(ck),
    });
  }
  return out;
}
