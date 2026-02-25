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
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom, skip } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';

interface AdminPeriodView {
  id: string;
  code: string;
  name: string;
  status?: string;
}

interface ProgramNeedRow {
  careerName: string;
  facultyGroup: string;
  campusName: string;
  sourceModality: string;
  needsByCourse: Record<string, number>;
  totalNeeds: number;
}

interface ProgramNeedCareerRow {
  careerName: string;
  needsByCourse: Record<string, number>;
  totalNeeds: number;
}

interface ProgramNeedsResponse {
  programNeeds: {
    facultyGroups: string[];
    campuses: string[];
    modalities: string[];
    rows: ProgramNeedRow[];
  };
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 class="text-2xl font-semibold text-slate-900">Mapeo academico y necesidades generales</h1>
        <p class="mt-2 text-sm text-slate-600">
          Conteo desde las cargas de nivelacion del periodo seleccionado.
        </p>
        <p *ngIf="periodLabel()" class="mt-2 text-xs font-semibold text-emerald-700">
          Periodo: {{ periodLabel() }}
        </p>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="grid gap-3 md:grid-cols-4">
          <label class="text-sm text-slate-700">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha examen</span>
            <select
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              [ngModel]="selectedExamDate()"
              (ngModelChange)="onFilterChange('examDate', $event)"
              [disabled]="loading()"
            >
              <option value="ALL">Todos</option>
              <option *ngFor="let d of examDates()" [value]="d">{{ d }}</option>
            </select>
          </label>

          <label class="text-sm text-slate-700">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Facultad</span>
            <select
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              [ngModel]="selectedFaculty()"
              (ngModelChange)="onFilterChange('faculty', $event)"
              [disabled]="loading()"
            >
              <option value="ALL">Todos</option>
              <option *ngFor="let f of faculties()" [value]="f">{{ f }}</option>
            </select>
          </label>

          <label class="text-sm text-slate-700">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sede</span>
            <select
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              [ngModel]="selectedCampus()"
              (ngModelChange)="onFilterChange('campus', $event)"
              [disabled]="loading()"
            >
              <option value="ALL">Todos</option>
              <option *ngFor="let c of campuses()" [value]="c">{{ c }}</option>
            </select>
          </label>

          <label class="text-sm text-slate-700">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Modalidad</span>
            <select
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              [ngModel]="selectedModality()"
              (ngModelChange)="onFilterChange('modality', $event)"
              [disabled]="loading()"
            >
              <option value="ALL">Todos</option>
              <option *ngFor="let m of modalities()" [value]="m">{{ m }}</option>
            </select>
          </label>
        </div>
      </div>

      <div *ngIf="error()" class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {{ error() }}
      </div>

      <div *ngIf="loading()" class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
        Cargando reporte...
      </div>

      <div
        *ngIf="!loading() && !error() && groupedRows().length === 0"
        class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500"
      >
        No hay datos para el periodo/filtros seleccionados.
      </div>

      <div *ngIf="!loading() && !error() && groupedRows().length > 0" class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full min-w-[980px] text-left text-sm">
          <thead class="bg-slate-900 text-white">
            <tr>
              <th class="px-4 py-3">Programa academico</th>
              <th class="px-4 py-3 text-center" *ngFor="let course of courseColumns()">{{ course }}</th>
              <th class="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr *ngFor="let row of groupedRows()" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-medium text-slate-900">{{ row.careerName }}</td>
              <td class="px-4 py-3 text-center text-slate-900" *ngFor="let course of courseColumns()">
                {{ row.needsByCourse[course] || 0 }}
              </td>
              <td class="px-4 py-3 text-right font-semibold text-slate-900">{{ row.totalNeeds }}</td>
            </tr>
            <tr class="bg-slate-100 font-semibold text-slate-900">
              <td class="px-4 py-3">TOTAL</td>
              <td class="px-4 py-3 text-center" *ngFor="let course of courseColumns()">
                {{ totalsRow().needsByCourse[course] || 0 }}
              </td>
              <td class="px-4 py-3 text-right">{{ totalsRow().totalNeeds }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdminReportsProgramPage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private periodSub?: Subscription;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly periodId = signal<string | null>(null);
  readonly periodLabel = signal<string>('');

  readonly examDates = signal<string[]>([]);
  readonly faculties = signal<string[]>([]);
  readonly campuses = signal<string[]>([]);
  readonly modalities = signal<string[]>([]);
  readonly rows = signal<ProgramNeedRow[]>([]);

  readonly selectedExamDate = signal<string>('ALL');
  readonly selectedFaculty = signal<string>('ALL');
  readonly selectedCampus = signal<string>('ALL');
  readonly selectedModality = signal<string>('ALL');

  readonly groupedRows = computed<ProgramNeedCareerRow[]>(() => {
    const grouped = new Map<string, ProgramNeedCareerRow>();
    for (const row of this.rows()) {
      const careerName = String(row.careerName || 'SIN CARRERA').trim() || 'SIN CARRERA';
      const key = careerName.toUpperCase();
      if (!grouped.has(key)) {
        grouped.set(key, { careerName, needsByCourse: {}, totalNeeds: 0 });
      }
      const target = grouped.get(key)!;
      for (const [course, count] of Object.entries(row.needsByCourse || {})) {
        target.needsByCourse[course] = Number(target.needsByCourse[course] || 0) + Number(count || 0);
      }
    }

    for (const row of grouped.values()) {
      row.totalNeeds = Object.values(row.needsByCourse).reduce(
        (sum, value) => sum + Number(value || 0),
        0
      );
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.careerName.localeCompare(b.careerName)
    );
  });

  readonly courseColumns = computed(() => {
    const courses = new Set<string>();
    for (const row of this.groupedRows()) {
      for (const key of Object.keys(row.needsByCourse || {})) {
        courses.add(key);
      }
    }
    return Array.from(courses).sort((a, b) => a.localeCompare(b));
  });

  readonly totalsRow = computed<ProgramNeedCareerRow>(() => {
    const totals: ProgramNeedCareerRow = {
      careerName: 'TOTAL',
      needsByCourse: {},
      totalNeeds: 0,
    };
    for (const row of this.groupedRows()) {
      totals.totalNeeds += Number(row.totalNeeds || 0);
      for (const course of this.courseColumns()) {
        totals.needsByCourse[course] =
          Number(totals.needsByCourse[course] || 0) + Number(row.needsByCourse[course] || 0);
      }
    }
    return totals;
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

  async onFilterChange(
    target: 'examDate' | 'faculty' | 'campus' | 'modality',
    value: string
  ) {
    const val = String(value || 'ALL');
    if (target === 'examDate') this.selectedExamDate.set(val);
    if (target === 'faculty') this.selectedFaculty.set(val);
    if (target === 'campus') this.selectedCampus.set(val);
    if (target === 'modality') this.selectedModality.set(val);
    await this.reloadProgramNeeds();
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
      await Promise.all([this.reloadExamDates(), this.reloadProgramNeeds()]);
    } catch (error: any) {
      this.error.set(this.extractError(error, 'No se pudo cargar el reporte de Inteligencia/Base.'));
      this.rows.set([]);
      this.examDates.set([]);
      this.faculties.set([]);
      this.campuses.set([]);
      this.modalities.set([]);
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

  private async reloadExamDates() {
    const periodId = this.periodId();
    if (!periodId) return;
    const dates = await firstValueFrom(
      this.http.get<string[]>(
        `/api/admin/leveling/reports/exam-dates?periodId=${encodeURIComponent(periodId)}`
      )
    );
    this.examDates.set((dates || []).map((x) => String(x)).filter(Boolean));
    if (this.selectedExamDate() !== 'ALL' && !this.examDates().includes(this.selectedExamDate())) {
      this.selectedExamDate.set('ALL');
    }
  }

  private async reloadProgramNeeds() {
    const periodId = this.periodId();
    if (!periodId) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = new URLSearchParams();
      params.set('periodId', periodId);
      params.set('examDate', this.selectedExamDate());
      params.set('facultyGroup', this.selectedFaculty());
      params.set('campusName', this.selectedCampus());
      params.set('modality', this.selectedModality());

      const response = await firstValueFrom(
        this.http.get<ProgramNeedsResponse>(
          `/api/admin/leveling/reports/program-needs?${params.toString()}`
        )
      );
      const payload = response?.programNeeds;
      this.rows.set(payload?.rows ?? []);
      this.faculties.set(payload?.facultyGroups ?? []);
      this.campuses.set(payload?.campuses ?? []);
      this.modalities.set(payload?.modalities ?? []);

      let shouldReload = false;
      if (this.selectedFaculty() !== 'ALL' && !this.faculties().includes(this.selectedFaculty())) {
        this.selectedFaculty.set('ALL');
        shouldReload = true;
      }
      if (this.selectedCampus() !== 'ALL' && !this.campuses().includes(this.selectedCampus())) {
        this.selectedCampus.set('ALL');
        shouldReload = true;
      }
      if (this.selectedModality() !== 'ALL' && !this.modalities().includes(this.selectedModality())) {
        this.selectedModality.set('ALL');
        shouldReload = true;
      }
      if (shouldReload) {
        await this.reloadProgramNeeds();
      }
    } catch (error: any) {
      this.error.set(this.extractError(error, 'No se pudo cargar la base por programa.'));
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
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
