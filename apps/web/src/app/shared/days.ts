export const DAYS = [
  { dayOfWeek: 1, label: 'Lun' },
  { dayOfWeek: 2, label: 'Mar' },
  { dayOfWeek: 3, label: 'Mie' },
  { dayOfWeek: 4, label: 'Jue' },
  { dayOfWeek: 5, label: 'Vie' },
  { dayOfWeek: 6, label: 'Sab' },
  { dayOfWeek: 7, label: 'Dom' },
];

export function minutesFromHHmm(hhmm: string): number {
  const match = String(hhmm ?? '').trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.NaN;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.NaN;
  return hh * 60 + mm;
}
