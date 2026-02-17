export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh * 60 + mm;
}

export function isHalfHourAligned(hhmm: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return false;
  const mm = Number(m[2]);
  return mm === 0 || mm === 30;
}

export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const a0 = hhmmToMinutes(startA);
  const a1 = hhmmToMinutes(endA);
  const b0 = hhmmToMinutes(startB);
  const b1 = hhmmToMinutes(endB);
  return a0 < b1 && a1 > b0;
}

