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
  const [hh, mm] = hhmm.split(':').map((x) => Number(x));
  return hh * 60 + mm;
}

