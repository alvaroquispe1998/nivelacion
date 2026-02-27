import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface AdminPeriodContextValue {
  id: string;
  code: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

const ADMIN_PERIOD_CONTEXT_STORAGE_KEY = 'uai.admin.period-context';

@Injectable({ providedIn: 'root' })
export class AdminPeriodContextService {
  private readonly selectedSubject = new BehaviorSubject<AdminPeriodContextValue | null>(
    this.readStored()
  );

  get changes$(): Observable<AdminPeriodContextValue | null> {
    return this.selectedSubject.asObservable();
  }

  getSelectedPeriod(): AdminPeriodContextValue | null {
    return this.selectedSubject.value;
  }

  getSelectedPeriodId(): string | null {
    const id = String(this.selectedSubject.value?.id ?? '').trim();
    return id || null;
  }

  setSelectedPeriod(value: AdminPeriodContextValue | null) {
    if (!value) {
      if (!this.selectedSubject.value) return;
      this.selectedSubject.next(null);
      this.removeStored();
      return;
    }
    const normalized: AdminPeriodContextValue = {
      id: String(value.id ?? '').trim(),
      code: String(value.code ?? '').trim(),
      name: String(value.name ?? '').trim(),
      startsAt: String(value.startsAt ?? '').trim() || null,
      endsAt: String(value.endsAt ?? '').trim() || null,
    };
    if (!normalized.id) return;
    if (this.isSameContext(this.selectedSubject.value, normalized)) {
      this.writeStored(normalized);
      return;
    }
    this.selectedSubject.next(normalized);
    this.writeStored(normalized);
  }

  resolveFromPeriodList(
    periods: Array<{
      id: string;
      code: string;
      name: string;
      status?: string;
      startsAt?: string | null;
      endsAt?: string | null;
    }>
  ): AdminPeriodContextValue | null {
    const storedId = this.getSelectedPeriodId();
    const selected =
      periods.find((p) => String(p.id ?? '').trim() === storedId) ||
      periods.find((p) => String(p.status ?? '').trim() === 'ACTIVE') ||
      periods[0] ||
      null;

    if (!selected) {
      this.setSelectedPeriod(null);
      return null;
    }

    const value: AdminPeriodContextValue = {
      id: String(selected.id ?? '').trim(),
      code: String(selected.code ?? '').trim(),
      name: String(selected.name ?? '').trim(),
      startsAt: String(selected.startsAt ?? '').trim() || null,
      endsAt: String(selected.endsAt ?? '').trim() || null,
    };
    this.setSelectedPeriod(value);
    return value;
  }

  private readStored(): AdminPeriodContextValue | null {
    if (typeof window === 'undefined') return null;
    const raw = String(
      window.localStorage.getItem(ADMIN_PERIOD_CONTEXT_STORAGE_KEY) ?? ''
    ).trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<AdminPeriodContextValue>;
      const id = String(parsed.id ?? '').trim();
      if (!id) return null;
      return {
        id,
        code: String(parsed.code ?? '').trim(),
        name: String(parsed.name ?? '').trim(),
        startsAt: String(parsed.startsAt ?? '').trim() || null,
        endsAt: String(parsed.endsAt ?? '').trim() || null,
      };
    } catch {
      return null;
    }
  }

  private writeStored(value: AdminPeriodContextValue) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      ADMIN_PERIOD_CONTEXT_STORAGE_KEY,
      JSON.stringify(value)
    );
  }

  private removeStored() {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ADMIN_PERIOD_CONTEXT_STORAGE_KEY);
  }

  private isSameContext(
    left: AdminPeriodContextValue | null,
    right: AdminPeriodContextValue | null
  ) {
    if (!left && !right) return true;
    if (!left || !right) return false;
    return (
      String(left.id ?? '').trim() === String(right.id ?? '').trim() &&
      String(left.code ?? '').trim() === String(right.code ?? '').trim() &&
      String(left.name ?? '').trim() === String(right.name ?? '').trim() &&
      (String(left.startsAt ?? '').trim() || null) ===
        (String(right.startsAt ?? '').trim() || null) &&
      (String(left.endsAt ?? '').trim() || null) ===
        (String(right.endsAt ?? '').trim() || null)
    );
  }
}
