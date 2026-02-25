import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription, firstValueFrom, skip } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';

interface AdminPeriodView {
  id: string;
  code: string;
  name: string;
  status?: string;
}

interface ExecutiveSummaryRow {
  label: string;
  totalGroups: number;
  courseGroups: Record<string, number>;
  courseGroupSizes: Record<string, number[]>;
}

interface ExecutiveSummaryFaculty {
  facultyGroup: string;
  totalGroups: number;
  totalHours: number;
  totalPay4Weeks: number;
  rows: ExecutiveSummaryRow[];
}

interface ExecutiveSummaryResponse {
  summary: {
    byFaculty: ExecutiveSummaryFaculty[];
    totalPay4Weeks: number;
    totalGroupsAllM: number;
  };
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <div class="rounded-2xl bg-slate-900 p-6 text-white shadow-sm">
        <h1 class="text-2xl font-semibold">Panoramica por facultades</h1>
        <p class="mt-2 text-sm text-slate-200">
          Resumen ejecutivo del periodo seleccionado, usando toda la data del sistema para ese periodo.
        </p>
        <p *ngIf="periodLabel()" class="mt-2 text-xs font-semibold text-emerald-300">
          Periodo: {{ periodLabel() }}
        </p>
      </div>

      <div *ngIf="error()" class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {{ error() }}
      </div>

      <div *ngIf="loading()" class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        Cargando panoramica...
      </div>

      <div
        *ngIf="!loading() && !error() && faculties().length === 0"
        class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500"
      >
        No hay informacion para el periodo seleccionado.
      </div>

      <ng-container *ngIf="!loading() && !error()">
        <div *ngFor="let fac of faculties()" class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <h2 class="text-lg font-semibold text-slate-900">Resumen {{ fac.facultyGroup }}</h2>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div class="text-xs uppercase tracking-wide text-blue-700">Total grupos</div>
              <div class="mt-1 text-2xl font-bold text-blue-900">{{ fac.totalGroups }}</div>
            </div>
            <div class="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div class="text-xs uppercase tracking-wide text-indigo-700">Horas (4 sem)</div>
              <div class="mt-1 text-2xl font-bold text-indigo-900">{{ fac.totalHours }}</div>
            </div>
            <div class="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div class="text-xs uppercase tracking-wide text-emerald-700">Total presupuestado</div>
              <div class="mt-1 text-2xl font-bold text-emerald-900">S/ {{ fac.totalPay4Weeks | number: '1.2-2' }}</div>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full min-w-[900px] text-left text-sm">
              <thead class="bg-slate-900 text-white">
                <tr>
                  <th class="px-4 py-3">Sede - Modalidad</th>
                  <th class="px-4 py-3 text-center" *ngFor="let course of courseColumns()">{{ course }}</th>
                  <th class="px-4 py-3 text-center">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr *ngFor="let row of fac.rows">
                  <td class="px-4 py-3 font-medium text-slate-900">{{ row.label }}</td>
                  <td class="px-4 py-3 text-center" *ngFor="let course of courseColumns()">
                    <div class="font-semibold text-slate-900">{{ row.courseGroups[course] || 0 }}</div>
                    <div class="text-[11px] text-slate-500" *ngIf="row.courseGroupSizes[course]?.length">
                      {{ row.courseGroupSizes[course].join(' + ') }}
                    </div>
                    <div class="text-[11px] text-slate-300" *ngIf="!row.courseGroupSizes[course]?.length">-</div>
                  </td>
                  <td class="px-4 py-3 text-center font-bold text-slate-900">{{ row.totalGroups }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-2xl bg-indigo-700 p-6 text-white shadow-sm">
          <div class="text-xs font-semibold uppercase tracking-wide text-indigo-100">Gran total presupuestado</div>
          <div class="mt-1 text-3xl font-bold">S/ {{ totalPay4Weeks() | number: '1.2-2' }}</div>
        </div>
      </ng-container>
    </div>
  `,
})
export class AdminReportsSummaryPage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private periodSub?: Subscription;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly periodId = signal<string | null>(null);
  readonly periodLabel = signal<string>('');

  readonly faculties = signal<ExecutiveSummaryFaculty[]>([]);
  readonly totalPay4Weeks = signal(0);

  readonly courseColumns = computed(() => {
    const courses = new Set<string>();
    for (const faculty of this.faculties()) {
      for (const row of faculty.rows || []) {
        for (const key of Object.keys(row.courseGroups || {})) {
          courses.add(key);
        }
      }
    }
    return Array.from(courses).sort((a, b) => a.localeCompare(b));
  });

  async ngOnInit() {
    await this.reloadAll();
    this.periodSub = this.adminPeriodContext.changes$
      .pipe(skip(1))
      .subscribe(() => void this.reloadAll());
  }

  ngOnDestroy() {
    this.periodSub?.unsubscribe();
  }

  private async reloadAll() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const selected = await this.resolvePeriodContext();
      const id = String(selected?.id || '').trim();
      if (!id) {
        throw new Error('No hay periodo de trabajo seleccionado.');
      }
      this.periodId.set(id);
      this.periodLabel.set(`${selected.code} - ${selected.name}`);

      const response = await firstValueFrom(
        this.http.get<ExecutiveSummaryResponse>(
          `/api/admin/leveling/reports/executive-summary?periodId=${encodeURIComponent(id)}`
        )
      );
      this.faculties.set(response?.summary?.byFaculty ?? []);
      this.totalPay4Weeks.set(Number(response?.summary?.totalPay4Weeks ?? 0));
    } catch (error: any) {
      this.error.set(this.extractError(error, 'No se pudo cargar la vision ejecutiva.'));
      this.faculties.set([]);
      this.totalPay4Weeks.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  private async resolvePeriodContext() {
    const selected = this.adminPeriodContext.getSelectedPeriod();
    if (selected?.id) return selected;
    const rows = await firstValueFrom(this.http.get<AdminPeriodView[]>('/api/admin/periods'));
    const resolved = this.adminPeriodContext.resolveFromPeriodList(rows);
    if (!resolved?.id) {
      throw new Error('No hay periodos disponibles para trabajar.');
    }
    return resolved;
  }

  private extractError(error: any, fallback: string): string {
    const raw =
      error?.error?.message ??
      error?.error?.error ??
      error?.message ??
      fallback;
    return String(raw || fallback);
  }
}
