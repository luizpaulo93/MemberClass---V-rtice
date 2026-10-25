import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Edit3,
  Trash2,
  Check,
  LayoutGrid,
  ArrowLeft,
  Cake,
} from 'lucide-react';
import {
  CalendarEvent,
  CalendarEventCategory,
  CalendarEventColor,
  Student,
  UserProgress,
  generateSafeId,
  sanitizeString,
} from '../types';

export interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[];
  isAdmin: boolean;
  currentUserUid: string;
  students?: Student[];
  userProgress?: UserProgress | null;
  onVisibleYearChange?: (year: number) => void;
  onSaveEvent: (
    event: Omit<CalendarEvent, 'createdAt' | 'updatedAt'>,
    isNew: boolean
  ) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MONTH_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const COLOR_PALETTE: Record<
  CalendarEventColor,
  {
    label: string;
    pillBg: string;
    circleBg: string;
    circleBorder: string;
    highlighterBg: string;
    badgeBg: string;
    badgeText: string;
    dotBg: string;
    accentBorder: string;
    glowClass: string;
  }
> = {
  blue: {
    label: 'Azul',
    pillBg: 'bg-blue-600',
    circleBg: 'bg-blue-500/20',
    circleBorder: 'border-blue-400/50',
    highlighterBg: 'bg-blue-500/25',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-200 [html.theme-light_&]:text-blue-700',
    dotBg: 'bg-blue-400',
    accentBorder: 'border-blue-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(59,130,246,0.5)]',
  },
  violet: {
    label: 'Violeta',
    pillBg: 'bg-violet-500',
    circleBg: 'bg-violet-500/20',
    circleBorder: 'border-violet-400/50',
    highlighterBg: 'bg-violet-500/25',
    badgeBg: 'bg-violet-500/20',
    badgeText: 'text-violet-200 [html.theme-light_&]:text-violet-700',
    dotBg: 'bg-violet-400',
    accentBorder: 'border-violet-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(139,92,246,0.5)]',
  },
  emerald: {
    label: 'Esmeralda',
    pillBg: 'bg-emerald-500',
    circleBg: 'bg-emerald-500/20',
    circleBorder: 'border-emerald-400/50',
    highlighterBg: 'bg-emerald-500/25',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-200 [html.theme-light_&]:text-emerald-700',
    dotBg: 'bg-emerald-400',
    accentBorder: 'border-emerald-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(16,185,129,0.5)]',
  },
  amber: {
    label: 'Âmbar',
    pillBg: 'bg-amber-500',
    circleBg: 'bg-amber-500/20',
    circleBorder: 'border-amber-400/50',
    highlighterBg: 'bg-amber-500/25',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-200 [html.theme-light_&]:text-amber-700',
    dotBg: 'bg-amber-400',
    accentBorder: 'border-amber-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(245,158,11,0.5)]',
  },
  cyan: {
    label: 'Celeste',
    pillBg: 'bg-cyan-500',
    circleBg: 'bg-cyan-500/20',
    circleBorder: 'border-cyan-400/50',
    highlighterBg: 'bg-cyan-500/25',
    badgeBg: 'bg-cyan-500/20',
    badgeText: 'text-cyan-200 [html.theme-light_&]:text-cyan-700',
    dotBg: 'bg-cyan-400',
    accentBorder: 'border-cyan-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(6,182,212,0.5)]',
  },
  rose: {
    label: 'Coral / Rosa',
    pillBg: 'bg-rose-500',
    circleBg: 'bg-rose-500/20',
    circleBorder: 'border-rose-400/50',
    highlighterBg: 'bg-rose-500/25',
    badgeBg: 'bg-rose-500/20',
    badgeText: 'text-rose-200 [html.theme-light_&]:text-rose-700',
    dotBg: 'bg-rose-400',
    accentBorder: 'border-rose-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(244,63,94,0.5)]',
  },
  pink: {
    label: 'Magenta',
    pillBg: 'bg-pink-500',
    circleBg: 'bg-pink-500/20',
    circleBorder: 'border-pink-400/50',
    highlighterBg: 'bg-pink-500/25',
    badgeBg: 'bg-pink-500/20',
    badgeText: 'text-pink-200 [html.theme-light_&]:text-pink-700',
    dotBg: 'bg-pink-400',
    accentBorder: 'border-pink-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(236,72,153,0.5)]',
  },
  indigo: {
    label: 'Índigo',
    pillBg: 'bg-indigo-500',
    circleBg: 'bg-indigo-500/20',
    circleBorder: 'border-indigo-400/50',
    highlighterBg: 'bg-indigo-500/25',
    badgeBg: 'bg-indigo-500/20',
    badgeText: 'text-indigo-200 [html.theme-light_&]:text-indigo-700',
    dotBg: 'bg-indigo-400',
    accentBorder: 'border-indigo-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(99,102,241,0.5)]',
  },
  teal: {
    label: 'Turquesa',
    pillBg: 'bg-teal-500',
    circleBg: 'bg-teal-500/20',
    circleBorder: 'border-teal-400/50',
    highlighterBg: 'bg-teal-500/25',
    badgeBg: 'bg-teal-500/20',
    badgeText: 'text-teal-200 [html.theme-light_&]:text-teal-700',
    dotBg: 'bg-teal-400',
    accentBorder: 'border-teal-500/50',
    glowClass: 'shadow-[0_0_12px_rgba(20,184,166,0.5)]',
  },
};

export const CATEGORY_OPTIONS: Array<{
  value: CalendarEventCategory;
  label: string;
  defaultColor: CalendarEventColor;
}> = [
  {
    value: 'assunto_semana',
    label: 'Assunto da Semana',
    defaultColor: 'blue',
  },
  {
    value: 'evento_curso',
    label: 'Evento do Curso',
    defaultColor: 'blue',
  },
  {
    value: 'simulado',
    label: 'Simulado',
    defaultColor: 'blue',
  },
  {
    value: 'revisao',
    label: 'Revisão',
    defaultColor: 'amber',
  },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toDateStr(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function addDaysToDate(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function dateToYMD(d: Date): string {
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Anonymous Gregorian algorithm to compute Easter Sunday for any given year
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month0 = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month0, day);
}

/**
 * Generates Brazilian National Holidays + Pará Regional Holidays for a given year
 */
export function getNationalAndParaHolidays(year: number): CalendarEvent[] {
  const easter = getEasterDate(year);
  const carnivalMon = dateToYMD(addDaysToDate(easter, -48));
  const carnivalTue = dateToYMD(addDaysToDate(easter, -47));
  const goodFriday = dateToYMD(addDaysToDate(easter, -2));
  const easterSun = dateToYMD(easter);
  const corpusChristi = dateToYMD(addDaysToDate(easter, 60));

  // Círio de Nazaré (Pará): 2nd Sunday of October
  const oct1 = new Date(year, 9, 1);
  const firstSundayDay = oct1.getDay() === 0 ? 1 : 1 + (7 - oct1.getDay());
  const secondSundayDay = firstSundayDay + 7;
  const cirioSunStr = toDateStr(year, 9, secondSundayDay);
  const posCirioMonStr = toDateStr(year, 9, secondSundayDay + 1);
  const recirioMonStr = toDateStr(year, 9, secondSundayDay + 15);

  return [
    {
      id: `hol_nac_${year}_0101`,
      title: 'Confraternização Universal',
      description: 'Ano Novo',
      category: 'feriado_nacional',
      startDate: `${year}-01-01`,
      endDate: `${year}-01-01`,
      color: 'rose',
      icon: 'sparkles',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_carnival_mon`,
      title: 'Carnaval (Segunda-feira)',
      description: 'Ponto Facultativo / Festividade',
      category: 'feriado_nacional',
      startDate: carnivalMon,
      endDate: carnivalMon,
      color: 'rose',
      icon: 'sparkles',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_carnival_tue`,
      title: 'Carnaval (Terça-feira)',
      description: 'Feriado de Carnaval',
      category: 'feriado_nacional',
      startDate: carnivalTue,
      endDate: carnivalTue,
      color: 'rose',
      icon: 'sparkles',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_goodfriday`,
      title: 'Sexta-feira Santa',
      description: 'Paixão de Cristo',
      category: 'feriado_nacional',
      startDate: goodFriday,
      endDate: goodFriday,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_eastersun`,
      title: 'Páscoa',
      description: 'Domingo de Páscoa',
      category: 'feriado_nacional',
      startDate: easterSun,
      endDate: easterSun,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_0421`,
      title: 'Tiradentes',
      description: 'Feriado Nacional',
      category: 'feriado_nacional',
      startDate: `${year}-04-21`,
      endDate: `${year}-04-21`,
      color: 'rose',
      icon: 'flag',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_0501`,
      title: 'Dia do Trabalhador',
      description: 'Feriado Nacional',
      category: 'feriado_nacional',
      startDate: `${year}-05-01`,
      endDate: `${year}-05-01`,
      color: 'rose',
      icon: 'flag',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_corpus`,
      title: 'Corpus Christi',
      description: 'Feriado Religioso',
      category: 'feriado_nacional',
      startDate: corpusChristi,
      endDate: corpusChristi,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_pa_${year}_0815`,
      title: 'Adesão do Grão-Pará',
      description: 'Feriado Estadual do Pará',
      category: 'feriado_para',
      startDate: `${year}-08-15`,
      endDate: `${year}-08-15`,
      color: 'rose',
      icon: 'flag',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_0907`,
      title: 'Independência do Brasil',
      description: 'Feriado Nacional',
      category: 'feriado_nacional',
      startDate: `${year}-09-07`,
      endDate: `${year}-09-07`,
      color: 'rose',
      icon: 'flag',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_pa_${year}_cirio_sun`,
      title: 'Círio de Nazaré',
      description: 'Grande Procissão do Círio (Belém/PA)',
      category: 'feriado_para',
      startDate: cirioSunStr,
      endDate: cirioSunStr,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_pa_${year}_cirio_mon`,
      title: 'Pós-Círio de Nazaré',
      description: 'Segunda-feira do Círio (Pará)',
      category: 'feriado_para',
      startDate: posCirioMonStr,
      endDate: posCirioMonStr,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_1012`,
      title: 'Nossa Senhora Aparecida',
      description: 'Padroeira do Brasil',
      category: 'feriado_nacional',
      startDate: `${year}-10-12`,
      endDate: `${year}-10-12`,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_pa_${year}_recirio`,
      title: 'Recírio de Nazaré',
      description: 'Encerramento da Festividade (Pará)',
      category: 'feriado_para',
      startDate: recirioMonStr,
      endDate: recirioMonStr,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_1102`,
      title: 'Finados',
      description: 'Feriado Nacional',
      category: 'feriado_nacional',
      startDate: `${year}-11-02`,
      endDate: `${year}-11-02`,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_1115`,
      title: 'Proclamação da República',
      description: 'Feriado Nacional',
      category: 'feriado_nacional',
      startDate: `${year}-11-15`,
      endDate: `${year}-11-15`,
      color: 'rose',
      icon: 'flag',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_1120`,
      title: 'Consciência Negra',
      description: 'Feriado Nacional',
      category: 'feriado_nacional',
      startDate: `${year}-11-20`,
      endDate: `${year}-11-20`,
      color: 'rose',
      icon: 'flag',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_pa_${year}_1208`,
      title: 'Nossa Senhora da Conceição',
      description: 'Feriado Municipal em Belém (PA)',
      category: 'feriado_para',
      startDate: `${year}-12-08`,
      endDate: `${year}-12-08`,
      color: 'rose',
      icon: 'star',
      isPublished: true,
      authorId: 'system',
    },
    {
      id: `hol_nac_${year}_1225`,
      title: 'Natal',
      description: 'Celebração de Natal',
      category: 'feriado_nacional',
      startDate: `${year}-12-25`,
      endDate: `${year}-12-25`,
      color: 'rose',
      icon: 'sparkles',
      isPublished: true,
      authorId: 'system',
    },
  ];
}

function parseYMD(str: string): { y: number; m: number; d: number } {
  const parts = str.split('-').map(Number);
  return { y: parts[0] || 2026, m: (parts[1] || 1) - 1, d: parts[2] || 1 };
}

export function formatShortDate(dateStr: string): string {
  const { d, m } = parseYMD(dateStr);
  return `${d} de ${MONTH_NAMES[m]}`;
}

export function formatShortDateRange(startStr: string, endStr: string): string {
  if (!startStr) return '';
  if (!endStr || startStr === endStr) return formatShortDate(startStr);
  const s = parseYMD(startStr);
  const e = parseYMD(endStr);
  if (s.m === e.m && s.y === e.y) {
    return `${s.d} a ${e.d} de ${MONTH_NAMES[s.m]}`;
  }
  return `${s.d} de ${MONTH_SHORT[s.m]} a ${e.d} de ${MONTH_SHORT[e.m]}`;
}

export function parseBirthDayAndMonth(
  birthDateStr?: string
): { day: number; month0: number } | null {
  if (!birthDateStr) return null;
  const trimmed = birthDateStr.trim();
  if (!trimmed) return null;

  const brMatch = trimmed.match(
    /^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.]\d{2,4})?$/
  );
  if (brMatch) {
    const d = parseInt(brMatch[1], 10);
    const m = parseInt(brMatch[2], 10) - 1;
    if (d >= 1 && d <= 31 && m >= 0 && m <= 11) {
      return { day: d, month0: m };
    }
  }

  const isoMatch = trimmed.match(/^\d{4}[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    const m = parseInt(isoMatch[1], 10) - 1;
    const d = parseInt(isoMatch[2], 10);
    if (d >= 1 && d <= 31 && m >= 0 && m <= 11) {
      return { day: d, month0: m };
    }
  }

  return null;
}

export interface BirthdayStudent {
  id: string;
  name: string;
  day: number;
  month0: number;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({
  isOpen,
  onClose,
  events,
  isAdmin,
  currentUserUid,
  students = [],
  userProgress = null,
  onVisibleYearChange,
  onSaveEvent,
  onDeleteEvent,
}) => {
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(
    () => toDateStr(now.getFullYear(), now.getMonth(), now.getDate()),
    [now]
  );

  const [selectedYear, setSelectedYear] = useState<number>(() =>
    now.getFullYear()
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(() =>
    now.getMonth()
  );

  // Selected date or range
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => todayStr);
  const [rangeStartStr, setRangeStartStr] = useState<string>(() => todayStr);
  const [rangeEndStr, setRangeEndStr] = useState<string>(() => todayStr);

  // Add Mode Toggle (Only Admin can activate)
  const [isAddMode, setIsAddMode] = useState<boolean>(false);

  // Drag selection state for Add Mode
  const [isDragging, setIsDragging] = useState(false);
  const [dragAnchorDate, setDragAnchorDate] = useState<string | null>(null);
  const [dragCurrentDate, setDragCurrentDate] = useState<string | null>(null);

  const isDraggingRef = useRef(false);
  const dragAnchorRef = useRef(null as string | null);
  const dragCurrentRef = useRef(null as string | null);
  const justOpenedPopupRef = useRef(false);

  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

  // Creation / Edit Popup Modal
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [popupTitle, setPopupTitle] = useState('');
  const [popupTitleError, setPopupTitleError] = useState('');
  const [popupDescription, setPopupDescription] = useState('');
  const [popupStartDate, setPopupStartDate] = useState(todayStr);
  const [popupEndDate, setPopupEndDate] = useState(todayStr);
  const [popupColor, setPopupColor] = useState<CalendarEventColor>('blue');
  const [popupCategory, setPopupCategory] =
    useState<CalendarEventCategory>('assunto_semana');
  const [isSaving, setIsSaving] = useState(false);
  const popupTitleRef = useRef<HTMLInputElement>(null);

  // Notify parent when visible year changes (for conditional Firestore query)
  useEffect(() => {
    if (isOpen && onVisibleYearChange) {
      onVisibleYearChange(selectedYear);
    }
  }, [isOpen, selectedYear, onVisibleYearChange]);

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      const cur = new Date();
      const curStr = toDateStr(
        cur.getFullYear(),
        cur.getMonth(),
        cur.getDate()
      );
      setSelectedYear(cur.getFullYear());
      setSelectedMonth(cur.getMonth());
      setSelectedDateStr(curStr);
      setRangeStartStr(curStr);
      setRangeEndStr(curStr);
      setIsAddMode(false);
      setIsDragging(false);
      setDragAnchorDate(null);
      setDragCurrentDate(null);
      isDraggingRef.current = false;
      dragAnchorRef.current = null;
      dragCurrentRef.current = null;
      justOpenedPopupRef.current = false;
      setViewMode('month');
      setIsPopupOpen(false);
      setEditingEventId(null);
      setPopupTitleError('');
    }
  }, [isOpen]);

  // Combine Firestore events with National & Pará Regional holidays with fixed category colors
  const allYearEvents = useMemo(() => {
    const holidays = getNationalAndParaHolidays(selectedYear);
    const normalizedCustom = events.map((ev) => {
      let effectiveColor: CalendarEventColor = ev.color || 'blue';
      if (ev.category === 'assunto_semana' || ev.category === 'simulado') {
        effectiveColor = 'blue';
      } else if (ev.category === 'revisao') {
        effectiveColor = 'amber';
      } else if (
        ev.category === 'feriado_nacional' ||
        ev.category === 'feriado_para'
      ) {
        effectiveColor = 'rose';
      }
      return {
        ...ev,
        color: effectiveColor,
        startDate: ev.startDate <= ev.endDate ? ev.startDate : ev.endDate,
        endDate: ev.endDate >= ev.startDate ? ev.endDate : ev.startDate,
      };
    });
    return [...normalizedCustom, ...holidays];
  }, [events, selectedYear]);

  // Compute student birthdays
  const allBirthdays = useMemo<BirthdayStudent[]>(() => {
    const list: BirthdayStudent[] = [];
    const seen = new Set<string>();

    if (Array.isArray(students)) {
      for (const stu of students) {
        if (stu?.birthDate && !seen.has(stu.id)) {
          const parsed = parseBirthDayAndMonth(stu.birthDate);
          if (parsed) {
            seen.add(stu.id);
            list.push({
              id: stu.id,
              name: stu.name || stu.email?.split('@')[0] || 'Aluno',
              day: parsed.day,
              month0: parsed.month0,
            });
          }
        }
      }
    }

    if (userProgress?.birthDate && !seen.has(userProgress.userId)) {
      const parsed = parseBirthDayAndMonth(userProgress.birthDate);
      if (parsed) {
        seen.add(userProgress.userId);
        list.push({
          id: userProgress.userId,
          name: userProgress.displayName || 'Você',
          day: parsed.day,
          month0: parsed.month0,
        });
      }
    }

    return list;
  }, [students, userProgress]);

  // Active range during drag or final selected range
  const activeRange = useMemo(() => {
    if (isDragging && dragAnchorDate && dragCurrentDate) {
      const start =
        dragAnchorDate <= dragCurrentDate ? dragAnchorDate : dragCurrentDate;
      const end =
        dragAnchorDate <= dragCurrentDate ? dragCurrentDate : dragAnchorDate;
      return { start, end };
    }
    const start =
      rangeStartStr <= rangeEndStr ? rangeStartStr : rangeEndStr;
    const end =
      rangeEndStr >= rangeStartStr ? rangeEndStr : rangeStartStr;
    return { start, end };
  }, [isDragging, dragAnchorDate, dragCurrentDate, rangeStartStr, rangeEndStr]);

  // Events occurring on the selected date / range
  const selectedScheduleEvents = useMemo(() => {
    const targetDate = selectedDateStr;
    if (!targetDate) return [];
    return allYearEvents
      .filter((ev) => targetDate >= ev.startDate && targetDate <= ev.endDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [allYearEvents, selectedDateStr]);

  // Birthdays on the selected date
  const selectedDateBirthdays = useMemo(() => {
    if (!selectedDateStr) return [];
    const { d, m } = parseYMD(selectedDateStr);
    return allBirthdays.filter((b) => b.day === d && b.month0 === m);
  }, [allBirthdays, selectedDateStr]);

  const clearSelection = useCallback(() => {
    isDraggingRef.current = false;
    dragAnchorRef.current = null;
    dragCurrentRef.current = null;
    setIsDragging(false);
    setDragAnchorDate(null);
    setDragCurrentDate(null);
    setSelectedDateStr('');
    setRangeStartStr('');
    setRangeEndStr('');
  }, []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isAddMode || isPopupOpen || justOpenedPopupRef.current) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest(
          '[data-calendar-date], button, a, input, select, textarea, label, [role="button"]'
        )
      ) {
        return;
      }
      clearSelection();
    },
    [isAddMode, isPopupOpen, clearSelection]
  );

  // Month grid matrix
  const monthWeeksMatrix = useMemo(() => {
    const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const startWeekday = firstDayOfMonth.getDay();

    const cells: Array<{
      dateStr: string;
      dayNumber: number;
      month0: number;
      year: number;
      isCurrentMonth: boolean;
    }> = [];

    if (startWeekday > 0) {
      const prevMonthLastDate = new Date(selectedYear, selectedMonth, 0);
      const prevYear = prevMonthLastDate.getFullYear();
      const prevMonth0 = prevMonthLastDate.getMonth();
      const prevMonthDays = prevMonthLastDate.getDate();
      for (let i = startWeekday - 1; i >= 0; i--) {
        const d = prevMonthDays - i;
        cells.push({
          dateStr: toDateStr(prevYear, prevMonth0, d),
          dayNumber: d,
          month0: prevMonth0,
          year: prevYear,
          isCurrentMonth: false,
        });
      }
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: toDateStr(selectedYear, selectedMonth, d),
        dayNumber: d,
        month0: selectedMonth,
        year: selectedYear,
        isCurrentMonth: true,
      });
    }

    const remainder = cells.length % 7;
    if (remainder > 0) {
      const needed = 7 - remainder;
      const nextMonthFirstDate = new Date(selectedYear, selectedMonth + 1, 1);
      const nextYear = nextMonthFirstDate.getFullYear();
      const nextMonth0 = nextMonthFirstDate.getMonth();
      for (let d = 1; d <= needed; d++) {
        cells.push({
          dateStr: toDateStr(nextYear, nextMonth0, d),
          dayNumber: d,
          month0: nextMonth0,
          year: nextYear,
          isCurrentMonth: false,
        });
      }
    }

    const weeks: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [selectedYear, selectedMonth]);

  // Open Popup Dialog
  const openPopupForRange = useCallback(
    (start: string, end: string) => {
      if (!isAdmin) return;
      const s = start <= end ? start : end;
      const e = end >= start ? end : start;
      setEditingEventId(null);
      setPopupTitle('');
      setPopupTitleError('');
      setPopupDescription('');
      setPopupStartDate(s);
      setPopupEndDate(e);
      setPopupColor('blue');
      setPopupCategory('assunto_semana');
      setIsPopupOpen(true);
    },
    [isAdmin]
  );

  const openPopupForEdit = (ev: CalendarEvent) => {
    if (!isAdmin || ev.authorId === 'system') return;
    setEditingEventId(ev.id);
    setPopupTitle(ev.title);
    setPopupTitleError('');
    setPopupDescription(ev.description || '');
    setPopupStartDate(ev.startDate);
    setPopupEndDate(ev.endDate);
    const cat = ev.category || 'assunto_semana';
    setPopupCategory(cat);
    if (cat === 'evento_curso') {
      setPopupColor(ev.color || 'blue');
    } else if (cat === 'revisao') {
      setPopupColor('amber');
    } else {
      setPopupColor('blue');
    }
    setIsPopupOpen(true);
  };

  const handleDayClick = (dateStr: string) => {
    if (justOpenedPopupRef.current) return;

    if (isAdmin && isAddMode) {
      setRangeStartStr(dateStr);
      setRangeEndStr(dateStr);
      setSelectedDateStr(dateStr);
      openPopupForRange(dateStr, dateStr);
      return;
    }

    setSelectedDateStr(dateStr);
    setRangeStartStr(dateStr);
    setRangeEndStr(dateStr);
  };

  const handleDayMouseDown = (dateStr: string) => {
    if (!isAdmin || !isAddMode) return;
    isDraggingRef.current = true;
    dragAnchorRef.current = dateStr;
    dragCurrentRef.current = dateStr;
    setIsDragging(true);
    setDragAnchorDate(dateStr);
    setDragCurrentDate(dateStr);
  };

  const handleDayMouseEnter = (dateStr: string) => {
    if (!isAdmin || !isAddMode || !isDraggingRef.current) return;
    dragCurrentRef.current = dateStr;
    setDragCurrentDate(dateStr);
  };

  const handleDayMouseUp = useCallback(
    (dateStr?: string) => {
      if (!isAdmin || !isAddMode || !isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        return;
      }
      const anchor = dragAnchorRef.current;
      const current = dateStr || dragCurrentRef.current || anchor;
      isDraggingRef.current = false;
      dragAnchorRef.current = null;
      dragCurrentRef.current = null;
      setIsDragging(false);
      setDragAnchorDate(null);
      setDragCurrentDate(null);

      if (anchor && current) {
        const start = anchor <= current ? anchor : current;
        const end = anchor <= current ? current : anchor;

        setRangeStartStr(start);
        setRangeEndStr(end);
        setSelectedDateStr(start);

        justOpenedPopupRef.current = true;
        setTimeout(() => {
          justOpenedPopupRef.current = false;
        }, 400);

        openPopupForRange(start, end);
      }
    },
    [isAdmin, isAddMode, openPopupForRange]
  );

  useEffect(() => {
    const handleGlobalUp = () => {
      if (isDraggingRef.current) {
        handleDayMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalUp);
    return () => window.removeEventListener('mouseup', handleGlobalUp);
  }, [handleDayMouseUp]);

  const handleTouchStart = (dateStr: string) => {
    if (!isAdmin || !isAddMode) {
      return;
    }

    isDraggingRef.current = true;
    dragAnchorRef.current = dateStr;
    dragCurrentRef.current = dateStr;
    setIsDragging(true);
    setDragAnchorDate(dateStr);
    setDragCurrentDate(dateStr);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isAdmin || !isAddMode || !isDraggingRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const dayElem = elem?.closest('[data-calendar-date]') as HTMLElement | null;
    if (dayElem) {
      const d = dayElem.getAttribute('data-calendar-date');
      if (d && d !== dragCurrentRef.current) {
        dragCurrentRef.current = d;
        setDragCurrentDate(d);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isAdmin || !isAddMode || !isDraggingRef.current) return;
    const anchor = dragAnchorRef.current;
    const current = dragCurrentRef.current || anchor;
    isDraggingRef.current = false;
    dragAnchorRef.current = null;
    dragCurrentRef.current = null;
    setIsDragging(false);
    setDragAnchorDate(null);
    setDragCurrentDate(null);

    if (anchor && current) {
      const start = anchor <= current ? anchor : current;
      const end = anchor <= current ? current : anchor;

      setRangeStartStr(start);
      setRangeEndStr(end);
      setSelectedDateStr(start);

      justOpenedPopupRef.current = true;
      setTimeout(() => {
        justOpenedPopupRef.current = false;
      }, 400);

      openPopupForRange(start, end);
    }
  };

  const handleTouchCancel = () => {
    isDraggingRef.current = false;
    dragAnchorRef.current = null;
    dragCurrentRef.current = null;
    setIsDragging(false);
    setDragAnchorDate(null);
    setDragCurrentDate(null);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(11);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(0);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  // Submit new/edited event with inline validation
  const handleSubmitPopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!popupTitle.trim()) {
      setPopupTitleError('Informe o título.');
      popupTitleRef.current?.focus();
      return;
    }
    if (!popupStartDate || !popupEndDate) return;
    setPopupTitleError('');
    setIsSaving(true);
    try {
      const isNew = !editingEventId;
      const id = editingEventId || generateSafeId('cal');
      const start = popupStartDate <= popupEndDate ? popupStartDate : popupEndDate;
      const end = popupEndDate >= popupStartDate ? popupEndDate : popupStartDate;

      const finalColor: CalendarEventColor =
        popupCategory === 'evento_curso'
          ? popupColor
          : popupCategory === 'revisao'
            ? 'amber'
            : 'blue';

      await onSaveEvent(
        {
          id,
          title: sanitizeString(popupTitle, 160, 'Evento'),
          description: sanitizeString(popupDescription, 2000, ''),
          category: popupCategory,
          startDate: start,
          endDate: end,
          color: finalColor,
          icon: 'star',
          isPublished: true,
          authorId: currentUserUid,
        },
        isNew
      );

      setSelectedDateStr(start);
      setRangeStartStr(start);
      setRangeEndStr(end);
      setIsPopupOpen(false);
      setEditingEventId(null);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleContainerClick}
      className="fixed inset-0 z-[70] bg-canvas overflow-y-auto overflow-x-hidden flex flex-col text-ink selection:bg-brand selection:text-white"
    >
      {/* RADIAL GRADIENT BACKGROUND EFFECT (GPU-FREE) */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[540px] max-w-[140vw] h-[250px] bg-[radial-gradient(closest-side,rgba(37,99,235,0.20),transparent)] pointer-events-none" />

      {/* TOP SCREEN HEADER BAR */}
      <header className="sticky top-0 z-40 bg-canvas/90 backdrop-blur-md px-4 sm:px-8 py-3.5 border-b border-line-soft flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-chip hover:bg-chip-hover text-ink-2 hover:text-ink flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Voltar / Fechar"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center shadow-glow-sm shrink-0">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h1 className="text-base sm:text-lg font-extrabold text-ink tracking-tight truncate">
                Calendário {selectedYear}
              </h1>
            </div>
          </div>
        </div>

        {/* RIGHT CONTROLS */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              setViewMode((prev) => (prev === 'month' ? 'year' : 'month'))
            }
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              viewMode === 'year'
                ? 'bg-brand border-brand-soft text-white'
                : 'bg-chip hover:bg-chip-hover border-line text-ink-2'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {viewMode === 'year' ? 'Ver Mês' : 'Ano Todo'}
            </span>
          </button>

          {/* ADMIN ONLY: ADICIONAR EVENTO TOGGLE BUTTON */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (isAddMode) {
                  setIsAddMode(false);
                } else {
                  setIsAddMode(true);
                  setViewMode('month');
                }
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isAddMode
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_16px_rgba(16,185,129,0.5)] ring-2 ring-emerald-300'
                  : 'bg-brand hover:bg-brand-hover text-white shadow-glow-sm'
              }`}
            >
              {isAddMode ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Modo Adicionar Ativo</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Adicionar Evento</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-chip hover:bg-chip-hover text-ink-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* MAIN SCREEN BODY */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 md:px-8 py-5 sm:py-7 pb-24 md:pb-8 space-y-6">
        {/* MONTH SWITCHER */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={
              viewMode === 'year'
                ? () => setSelectedYear((y) => y - 1)
                : handlePrevMonth
            }
            className="w-8 h-8 rounded-full bg-chip hover:bg-chip-hover text-ink-2 flex items-center justify-center transition-colors cursor-pointer"
            title="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4 text-brand-soft" />
          </button>

          <span className="text-base sm:text-lg font-extrabold text-ink px-1">
            {viewMode === 'year'
              ? `Ano ${selectedYear}`
              : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`}
          </span>

          <button
            type="button"
            onClick={
              viewMode === 'year'
                ? () => setSelectedYear((y) => y + 1)
                : handleNextMonth
            }
            className="w-8 h-8 rounded-full bg-chip hover:bg-chip-hover text-ink-2 flex items-center justify-center transition-colors cursor-pointer"
            title="Próximo mês"
          >
            <ChevronRight className="w-4 h-4 text-brand-soft" />
          </button>
        </div>

        {/* VIEW MODE 1: FULL YEAR OVERVIEW (12 MONTHS) */}
        {viewMode === 'year' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {MONTH_NAMES.map((mName, mIdx) => {
              const firstDay = new Date(selectedYear, mIdx, 1).getDay();
              const daysCount = new Date(selectedYear, mIdx + 1, 0).getDate();
              const isPresentMonth =
                selectedYear === now.getFullYear() && mIdx === now.getMonth();

              return (
                <div
                  key={mName}
                  onClick={() => {
                    setSelectedMonth(mIdx);
                    setViewMode('month');
                  }}
                  className={`p-3.5 rounded-2xl transition-all cursor-pointer ${
                    isPresentMonth
                      ? 'bg-surface-2 border border-brand-soft/60 shadow-glow-sm'
                      : 'bg-surface border border-line hover:border-brand-soft/40 shadow-card'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-ink">
                      {mName}
                    </span>
                    {isPresentMonth && (
                      <span className="w-2 h-2 rounded-full bg-brand-soft" />
                    )}
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                      <span key={i} className="text-[9px] font-bold text-ink-muted">
                        {d}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <span key={`empty-${i}`} className="w-5 h-5" />
                    ))}
                    {Array.from({ length: daysCount }).map((_, i) => {
                      const dNum = i + 1;
                      const dStr = toDateStr(selectedYear, mIdx, dNum);
                      const dayEvs = allYearEvents.filter(
                        (ev) => dStr >= ev.startDate && dStr <= ev.endDate
                      );
                      const topEv = dayEvs[0];
                      const palette = topEv
                        ? COLOR_PALETTE[topEv.color] || COLOR_PALETTE.blue
                        : null;
                      const isToday = dStr === todayStr;
                      const hasBday = allBirthdays.some(
                        (b) => b.day === dNum && b.month0 === mIdx
                      );

                      return (
                        <div
                          key={dStr}
                          className="relative flex flex-col items-center"
                        >
                          {hasBday && (
                            <span className="absolute -top-1.5 text-[7px] leading-none select-none pointer-events-none">
                              🎂
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMonth(mIdx);
                              setSelectedDateStr(dStr);
                              setRangeStartStr(dStr);
                              setRangeEndStr(dStr);
                              setViewMode('month');
                            }}
                            className={`w-5 h-5 mx-auto rounded-full text-[9px] font-bold flex items-center justify-center transition-transform hover:scale-110 ${
                              isToday
                                ? 'bg-brand text-white ring-1 ring-blue-300'
                                : palette
                                  ? `${palette.dotBg} text-black font-extrabold`
                                  : 'text-ink-muted hover:bg-chip-hover'
                            }`}
                          >
                            {dNum}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* VIEW MODE 2: BORDERLESS MONTH CALENDAR */
          <div
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            className={`w-full select-none space-y-2.5 py-1 ${
              isAddMode ? 'touch-none' : 'touch-auto'
            }`}
          >
            {/* Weekdays Labels */}
            <div className="grid grid-cols-7 text-center pb-2.5 border-b border-line-soft">
              {WEEKDAYS_SHORT.map((wd) => (
                <div
                  key={wd}
                  className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-ink-muted py-0.5"
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Weeks Matrix */}
            <div className="space-y-1 sm:space-y-1.5 pt-1">
              {monthWeeksMatrix.map((weekRow, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-7 relative">
                  {weekRow.map((cell, colIdx) => {
                    const { dateStr, dayNumber, month0, isCurrentMonth } = cell;

                    const hasActiveRange = Boolean(
                      activeRange.start && activeRange.end
                    );
                    const isInActiveRange =
                      isAddMode &&
                      hasActiveRange &&
                      dateStr >= activeRange.start &&
                      dateStr <= activeRange.end;
                    const isRangeStart =
                      hasActiveRange && dateStr === activeRange.start;
                    const isRangeEnd =
                      hasActiveRange && dateStr === activeRange.end;

                    const isSelected =
                      Boolean(selectedDateStr) && dateStr === selectedDateStr;
                    const isToday = dateStr === todayStr;

                    const dayEvents = allYearEvents.filter(
                      (ev) => dateStr >= ev.startDate && dateStr <= ev.endDate
                    );
                    const multiDayEvent = dayEvents.find(
                      (ev) => ev.startDate !== ev.endDate
                    );
                    const holidayEvent = dayEvents.find(
                      (ev) =>
                        ev.category === 'feriado_nacional' ||
                        ev.category === 'feriado_para'
                    );
                    const primaryEvent = multiDayEvent || dayEvents[0] || null;
                    const pal = primaryEvent
                      ? COLOR_PALETTE[primaryEvent.color] || COLOR_PALETTE.blue
                      : COLOR_PALETTE.blue;

                    const isMultiDay = Boolean(multiDayEvent);
                    const isSingleDayEvent =
                      !isMultiDay && primaryEvent && primaryEvent.startDate === primaryEvent.endDate;

                    const eventsWithDots = dayEvents.filter(
                      (ev) =>
                        ev.category === 'simulado' ||
                        ev.category === 'revisao' ||
                        ev.category === 'evento_curso'
                    );

                    const dayBirthdays = allBirthdays.filter(
                      (b) => b.day === dayNumber && b.month0 === month0
                    );

                    const getMultiDayBandClasses = (ev: CalendarEvent) => {
                      const isStartOfEvent = dateStr === ev.startDate;
                      const isEndOfEvent = dateStr === ev.endDate;
                      const isRowStart = colIdx === 0;
                      const isRowEnd = colIdx === 6;

                      if (isStartOfEvent && isEndOfEvent) {
                        return 'left-1 right-1 rounded-full border-x';
                      }
                      if (isStartOfEvent) {
                        return 'left-1 right-0 rounded-l-full border-l';
                      }
                      if (isEndOfEvent) {
                        return 'left-0 right-1 rounded-r-full border-r';
                      }
                      if (isRowStart) {
                        return 'left-0 right-0 rounded-l-none';
                      }
                      if (isRowEnd) {
                        return 'left-0 right-0 rounded-r-none';
                      }
                      return 'left-0 right-0 rounded-none';
                    };

                    const getDragBandClasses = () => {
                      const isSingleDay = activeRange.start === activeRange.end;
                      if (isSingleDay) {
                        return 'left-1 right-1 rounded-full border-x';
                      }
                      if (isRangeStart) {
                        return 'left-1 right-0 rounded-l-full border-l';
                      }
                      if (isRangeEnd) {
                        return 'left-0 right-1 rounded-r-full border-r';
                      }
                      if (colIdx === 0) {
                        return 'left-0 right-0 rounded-l-none';
                      }
                      if (colIdx === 6) {
                        return 'left-0 right-0 rounded-r-none';
                      }
                      return 'left-0 right-0 rounded-none';
                    };

                    const getCircleClasses = () => {
                      if (isInActiveRange) {
                        if (isRangeStart || isRangeEnd) {
                          return 'bg-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.9)] scale-105';
                        }
                        return 'text-emerald-200 [html.theme-light_&]:text-emerald-800 font-bold';
                      }

                      if (isSelected) {
                        return 'bg-brand text-white shadow-glow-md scale-105 ring-2 ring-white/60';
                      }

                      if (isToday) {
                        return 'border-2 border-brand-soft text-ink font-extrabold bg-brand/20 shadow-glow-sm';
                      }

                      if (holidayEvent) {
                        return 'bg-rose-500/25 border-2 border-rose-500/80 text-rose-100 [html.theme-light_&]:text-rose-800 font-extrabold shadow-[0_0_12px_rgba(244,63,94,0.4)]';
                      }

                      if (isSingleDayEvent) {
                        return `${pal.circleBg} border-2 ${pal.accentBorder} text-ink font-extrabold shadow-sm`;
                      }

                      if (isMultiDay) {
                        return 'text-ink font-extrabold';
                      }

                      if (isCurrentMonth) {
                        return 'text-ink-2 group-hover:bg-chip-hover';
                      }

                      return 'text-ink-faint group-hover:text-ink-muted';
                    };

                    return (
                      <div
                        key={dateStr}
                        data-calendar-date={dateStr}
                        onClick={() => handleDayClick(dateStr)}
                        onMouseDown={() => handleDayMouseDown(dateStr)}
                        onMouseEnter={() => handleDayMouseEnter(dateStr)}
                        onMouseUp={() => handleDayMouseUp(dateStr)}
                        onTouchStart={() => handleTouchStart(dateStr)}
                        className="relative flex items-center justify-center h-14 sm:h-16 cursor-pointer group transition-all select-none"
                      >
                        {/* MULTI-DAY EVENT CONTINUOUS BAND */}
                        {isMultiDay && !isInActiveRange && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-9 sm:h-10 pointer-events-none transition-all z-0 ${
                              pal.highlighterBg
                            } border-y ${pal.accentBorder} ${getMultiDayBandClasses(
                              primaryEvent
                            )}`}
                          />
                        )}

                        {/* DRAG / ACTIVE RANGE HIGHLIGHT BAND */}
                        {isInActiveRange && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-9 sm:h-10 pointer-events-none bg-emerald-500/25 border-y border-emerald-400/40 z-0 ${getDragBandClasses()}`}
                          />
                        )}

                        {/* TINY BIRTHDAY CAKE SYMBOL ON TOP */}
                        {dayBirthdays.length > 0 && (
                          <span
                            className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] leading-none select-none pointer-events-none z-20 filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                            title={`Aniversariante(s): ${dayBirthdays
                              .map((b) => b.name)
                              .join(', ')}`}
                          >
                            🎂
                          </span>
                        )}

                        {/* PERFECT CIRCULAR DAY NUMBER */}
                        <div
                          className={`relative z-10 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-extrabold aspect-square select-none transition-all ${getCircleClasses()}`}
                        >
                          {dayNumber}
                        </div>

                        {/* PURE COLOR EVENT DOTS */}
                        {eventsWithDots.length > 0 && (
                          <div className="absolute bottom-1 inset-x-0 flex items-center justify-center gap-1 pointer-events-none z-20">
                            {eventsWithDots.slice(0, 3).map((ev) => {
                              const p =
                                COLOR_PALETTE[ev.color] || COLOR_PALETTE.blue;
                              return (
                                <span
                                  key={ev.id}
                                  title={ev.title}
                                  className={`w-1.5 h-1.5 rounded-full ${p.dotBg} shadow-sm shrink-0`}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOTTOM SCHEDULE SECTION */}
        <section className="pt-2 border-t border-line-soft space-y-3">
          {!selectedDateStr ? (
            <div className="p-6 rounded-2xl bg-surface border border-line-soft text-center transform -skew-x-1 sm:-skew-x-2">
              <p className="text-xs sm:text-sm font-semibold text-ink-muted italic">
                Nenhuma data selecionada.
              </p>
            </div>
          ) : selectedScheduleEvents.length === 0 &&
            selectedDateBirthdays.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface border border-line-soft text-center transform -skew-x-1 sm:-skew-x-2">
              <p className="text-xs sm:text-sm font-semibold text-ink-muted italic">
                Nenhuma programação ou evento agendado para este dia.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* BIRTHDAY CARDS */}
              {selectedDateBirthdays.map((b) => (
                <div
                  key={`bday-${b.id}`}
                  className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-400/40 shadow-[0_4px_20px_rgba(245,158,11,0.15)] flex items-start justify-between gap-3 transform -skew-x-2 transition-transform hover:-skew-x-1"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-amber-500/25 border border-amber-400/50 text-amber-400 [html.theme-light_&]:text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Cake className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 [html.theme-light_&]:text-amber-800 italic uppercase tracking-wider">
                          🎂 Aniversariante
                        </span>
                        <span className="text-[10px] font-bold text-amber-400 [html.theme-light_&]:text-amber-700 italic">
                          Hoje!
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-extrabold text-ink italic tracking-wide truncate">
                        {b.name}
                      </h3>
                      <p className="text-[11px] text-ink-2 italic font-medium">
                        Dia de celebrar mais um ano de vida e conquistas!
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* EVENT CARDS */}
              {selectedScheduleEvents.map((ev) => {
                const pal = COLOR_PALETTE[ev.color] || COLOR_PALETTE.blue;
                const isSystemHoliday = ev.authorId === 'system';
                const spansMultipleDays = ev.startDate !== ev.endDate;

                return (
                  <div
                    key={ev.id}
                    className={`relative p-4 rounded-2xl bg-surface border ${pal.accentBorder} flex items-start justify-between gap-3 transform -skew-x-2 transition-transform hover:-skew-x-1 overflow-hidden shadow-card`}
                  >
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1.5 ${pal.pillBg}`}
                    />

                    <div className="flex items-start gap-3 min-w-0 pl-1.5">
                      <span
                        className={`w-3 h-3 rounded-full ${pal.dotBg} shrink-0 mt-1.5 ${pal.glowClass}`}
                      />

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold italic uppercase tracking-wider ${pal.badgeBg} ${pal.badgeText}`}
                          >
                            {ev.category === 'assunto_semana'
                              ? 'Assunto da Semana'
                              : ev.category === 'evento_curso'
                                ? 'Evento do Curso'
                                : ev.category === 'simulado'
                                  ? 'Simulado'
                                  : ev.category === 'revisao'
                                    ? 'Revisão'
                                    : ev.category === 'feriado_nacional'
                                      ? 'Feriado Nacional'
                                      : 'Feriado Pará'}
                          </span>

                          <span className="text-[11px] font-bold text-brand-soft italic">
                            {spansMultipleDays
                              ? `Período: ${formatShortDateRange(
                                  ev.startDate,
                                  ev.endDate
                                )}`
                              : formatShortDate(ev.startDate)}
                          </span>
                        </div>

                        <h3 className="text-sm sm:text-base font-extrabold text-ink italic tracking-wide leading-snug">
                          {ev.title}
                        </h3>

                        {ev.description && (
                          <p className="text-xs text-ink-2 italic font-medium leading-relaxed">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Admin Edit/Delete */}
                    {isAdmin && !isSystemHoliday && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openPopupForEdit(ev)}
                          className="w-7 h-7 rounded-full bg-chip hover:bg-chip-hover text-ink-2 hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteEvent(ev.id)}
                          className="w-7 h-7 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* POPUP MODAL TO ADD / EDIT EVENT */}
      {isAdmin && isPopupOpen && (
        <div
          onClick={() => {
            setIsPopupOpen(false);
            setEditingEventId(null);
            if (isAddMode) {
              clearSelection();
            }
          }}
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-surface border border-brand-soft/40 p-5 sm:p-6 shadow-pop space-y-4 relative"
          >
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="text-sm sm:text-base font-extrabold text-ink flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand" />
                <span>
                  {editingEventId
                    ? 'Editar Evento / Assunto'
                    : 'Adicionar no Calendário'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsPopupOpen(false);
                  setEditingEventId(null);
                }}
                className="w-7 h-7 rounded-full bg-chip hover:bg-chip-hover text-ink-muted hover:text-ink flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleSubmitPopup} className="space-y-3.5">
              {/* Category Pills */}
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((cat) => {
                  const active = popupCategory === cat.value;
                  const isAssunto = cat.value === 'assunto_semana';
                  const catPal = COLOR_PALETTE[cat.defaultColor];
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => {
                        setPopupCategory(cat.value);
                        if (cat.value === 'evento_curso') {
                          if (!popupColor) setPopupColor('blue');
                        } else {
                          setPopupColor(cat.defaultColor);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                        active
                          ? 'bg-brand border-brand-soft text-white shadow-glow-sm'
                          : 'bg-surface-2 border-line text-ink-2 hover:text-ink'
                      }`}
                    >
                      {isAssunto ? (
                        <span className="w-3.5 h-1.5 rounded-full bg-blue-400" title="Apenas marcação contínua" />
                      ) : (
                        <span className={`w-2 h-2 rounded-full ${catPal.dotBg}`} />
                      )}
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Title Input */}
              <div>
                <label className="block text-[11px] font-semibold text-ink-2 mb-1">
                  Nome do Evento / Assunto da Semana
                </label>
                <input
                  ref={popupTitleRef}
                  type="text"
                  maxLength={160}
                  value={popupTitle}
                  onChange={(e) => {
                    setPopupTitle(e.target.value);
                    if (popupTitleError) setPopupTitleError('');
                  }}
                  placeholder="Ex: Cinemática e Leis de Newton"
                  className={`w-full px-3.5 py-2.5 rounded-2xl bg-inset border ${
                    popupTitleError ? 'border-danger focus:border-danger' : 'border-line focus:border-brand-soft'
                  } text-xs text-ink placeholder-ink-faint focus:outline-none`}
                  autoFocus
                />
                {popupTitleError && (
                  <p className="text-xs text-danger mt-1">{popupTitleError}</p>
                )}
              </div>

              {/* Date Period Inputs */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    Início
                  </label>
                  <input
                    type="date"
                    value={popupStartDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPopupStartDate(v);
                      if (popupEndDate < v) setPopupEndDate(v);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-inset border border-line text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                    Término
                  </label>
                  <input
                    type="date"
                    min={popupStartDate}
                    value={popupEndDate}
                    onChange={(e) => setPopupEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-inset border border-line text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                  />
                </div>
              </div>

              {/* Description Textarea */}
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  Descrição ou Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={popupDescription}
                  onChange={(e) => setPopupDescription(e.target.value)}
                  placeholder="Detalhes adicionais para os alunos..."
                  className="w-full px-3.5 py-2 rounded-2xl bg-inset border border-line text-xs text-ink placeholder-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft/50 focus:border-brand-soft"
                />
              </div>

              {/* Pure Color Selector - 5-column mobile grid */}
              {popupCategory === 'evento_curso' && (
                <div>
                  <label className="block text-[11px] font-semibold text-ink-muted mb-1.5">
                    Cor do Evento
                  </label>
                  <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-2">
                    {(Object.keys(COLOR_PALETTE) as CalendarEventColor[]).map(
                      (cKey) => {
                        const pal = COLOR_PALETTE[cKey];
                        const selected = popupColor === cKey;
                        return (
                          <button
                            key={cKey}
                            type="button"
                            onClick={() => setPopupColor(cKey)}
                            title={pal.label}
                            className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center border transition-all cursor-pointer ${
                              pal.circleBg
                            } ${pal.circleBorder} ${
                              selected
                                ? 'ring-2 ring-ink scale-110 shadow-glow-sm'
                                : 'opacity-70 hover:opacity-100'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full ${pal.dotBg} flex items-center justify-center`}
                            >
                              {selected && (
                                <Check className="w-2.5 h-2.5 text-black stroke-[3]" />
                              )}
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPopupOpen(false);
                    setEditingEventId(null);
                  }}
                  className="px-4 py-2 rounded-full bg-chip hover:bg-chip-hover text-xs font-bold text-ink-2 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 rounded-full bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-glow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
