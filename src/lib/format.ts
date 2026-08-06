import type { Parcela } from './types';

export const formatCurrency = (value: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export const formatDate = (date: string | null | undefined) => {
  if (!date) return '-';
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR').format(parsed);
};

export const todayISO = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const dateToISO = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const fixedMonthlyDueDateISO = (firstDueDate: string, monthOffset: number) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstDueDate);

  // Mantém compatibilidade caso algum valor antigo não esteja no formato ISO esperado.
  if (!match) {
    const parsed = new Date(`${firstDueDate}T12:00:00`);
    parsed.setMonth(parsed.getMonth() + monthOffset);
    return dateToISO(parsed);
  }

  const baseYear = Number(match[1]);
  const baseMonth = Number(match[2]) - 1;
  const baseDay = Number(match[3]);

  // Cada parcela parte sempre da data-base original, nunca da parcela anterior.
  const targetMonth = new Date(baseYear, baseMonth + monthOffset, 1, 12, 0, 0, 0);
  const lastDayOfTargetMonth = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
    12,
    0,
    0,
    0
  ).getDate();

  // Ex.: dia 31 em fevereiro vira o último dia de fevereiro; em março volta ao dia 31.
  const nominalDay = Math.min(Math.max(baseDay, 1), lastDayOfTargetMonth);
  const dueDate = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    nominalDay,
    12,
    0,
    0,
    0
  );

  // Final de semana altera somente o vencimento daquele mês.
  if (dueDate.getDay() === 6) dueDate.setDate(dueDate.getDate() + 2);
  else if (dueDate.getDay() === 0) dueDate.setDate(dueDate.getDate() + 1);

  return dateToISO(dueDate);
};

/**
 * Gera vencimentos mensais mantendo o dia fixo da primeira parcela.
 * Sábado e domingo são deslocados para a segunda-feira seguinte.
 */
export const addMonthsISO = (date: string, months: number) => fixedMonthlyDueDateISO(date, months);

// Nome explícito para novos pontos do sistema que gerarem parcelas futuramente.
export const installmentDueDateISO = fixedMonthlyDueDateISO;

export const addDaysISO = (date: string, days: number) => {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return dateToISO(parsed);
};

export const getParcelaSituacao = (parcela: Pick<Parcela, 'status' | 'vencimento'>) => {
  if (parcela.status === 'pago') return 'pago';
  if (parcela.status === 'cancelado') return 'cancelado';
  if (parcela.vencimento < todayISO()) return 'atrasada';
  return 'pendente';
};

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CL';

export const normalizePhone = (phone: string | null | undefined) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
};

export const whatsappLink = (phone: string | null | undefined, message: string) => {
  const normalized = normalizePhone(phone);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : '#';
};
