import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  inject,
} from '@angular/core';
import { Subscription, firstValueFrom, skip } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';

interface AssignedSectionCourseRow {
  sectionCourseId: string;
  sectionCode: string | null;
  sectionName: string;
  courseId: string;
  courseAkademicId: string | null;
  courseName: string;
  teacherId: string;
  teacherDni: string | null;
  teacherName: string;
  studentCount: number;
  periodCode: string;
  periodName: string;
}

interface ActivePeriod {
  id: string;
  code: string;
  name: string;
  status?: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Exportacion seccion-curso</div>
        <div class="text-sm text-slate-600">
          Exporta plantilla para cursos de secciones con docente asignado.
        </div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
      >
        Refrescar
      </button>
    </div>

    <div
      class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      Alerta: solo se exportaran relaciones <b>seccion-curso</b> que tengan
      <b>docente asignado</b> en el periodo activo.
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm text-slate-700">
          Periodo de trabajo:
          <b>{{ activePeriod ? activePeriod.code + ' - ' + activePeriod.name : '-' }}</b>
        </div>
        <button
          class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          [disabled]="rows.length === 0 || downloading"
          (click)="downloadExcel()"
        >
          {{ downloading ? 'Descargando...' : 'Exportar Excel' }}
        </button>
      </div>
      <div class="mt-1 text-xs text-slate-600">
        Registros listados: {{ rows.length }} | Alumnos alcanzados:
        {{ totalStudents }}
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th class="px-4 py-3">Seccion</th>
            <th class="px-4 py-3">Curso</th>
            <th class="px-4 py-3">Docente</th>
            <th class="px-4 py-3">Alumnos</th>
            <th class="px-4 py-3">Periodo</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let row of rows; trackBy: trackRow" class="border-t border-slate-100">
            <td class="px-4 py-3">
              <div class="font-medium">{{ row.sectionCode || row.sectionName }}</div>
              <div class="text-xs text-slate-600">{{ row.sectionName }}</div>
            </td>
            <td class="px-4 py-3">
              <div>{{ row.courseName }}</div>
              <div class="text-xs text-slate-500">
                ID Curso: {{ row.courseAkademicId || row.courseId }}
              </div>
            </td>
            <td class="px-4 py-3">
              <div>{{ row.teacherName }}</div>
              <div class="text-xs text-slate-500">{{ row.teacherDni || '-' }}</div>
            </td>
            <td class="px-4 py-3 font-semibold">{{ row.studentCount }}</td>
            <td class="px-4 py-3">{{ row.periodCode }} - {{ row.periodName }}</td>
          </tr>
          <tr *ngIf="rows.length === 0" class="border-t border-slate-100">
            <td class="px-4 py-5 text-slate-500" colspan="5">
              No hay seccion-curso con docente asignado en el periodo seleccionado.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class AdminExportAssignedPage implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private periodSub?: Subscription;

  rows: AssignedSectionCourseRow[] = [];
  activePeriod: ActivePeriod | null = null;
  error: string | null = null;
  downloading = false;

  get totalStudents() {
    return this.rows.reduce((acc, row) => acc + Number(row.studentCount || 0), 0);
  }

  async ngOnInit() {
    await this.load();
    this.periodSub = this.adminPeriodContext.changes$
      .pipe(skip(1))
      .subscribe(() => void this.load());
  }

  ngOnDestroy() {
    this.periodSub?.unsubscribe();
  }

  trackRow(_: number, row: AssignedSectionCourseRow) {
    return row.sectionCourseId;
  }

  async load() {
    this.error = null;
    try {
      const selectedPeriod = await this.resolvePeriodContext();
      const [rows, activePeriod] = await Promise.all([
        firstValueFrom(
          this.http.get<AssignedSectionCourseRow[]>('/api/admin/sections/export/assigned-courses')
        ),
        Promise.resolve({
          id: selectedPeriod.id,
          code: selectedPeriod.code,
          name: selectedPeriod.name,
        }),
      ]);
      this.rows = rows;
      this.activePeriod = activePeriod;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar datos de exportacion';
    } finally {
      this.cdr.detectChanges();
    }
  }

  private async resolvePeriodContext() {
    const selected = this.adminPeriodContext.getSelectedPeriod();
    if (selected?.id) return selected;
    const rows = await firstValueFrom(this.http.get<ActivePeriod[]>('/api/admin/periods'));
    const resolved = this.adminPeriodContext.resolveFromPeriodList(rows);
    if (!resolved?.id) {
      throw new Error('No hay periodos disponibles para trabajar.');
    }
    return resolved;
  }

  async downloadExcel() {
    if (this.rows.length === 0) return;
    this.downloading = true;
    this.error = null;
    try {
      const blob = await firstValueFrom(
        this.http.get('/api/admin/sections/export/assigned-courses/excel', {
          responseType: 'blob',
        })
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const periodCode = this.activePeriod?.code || 'periodo';
      a.href = url;
      a.download = `plantilla_docentes_${periodCode}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo descargar el Excel';
    } finally {
      this.downloading = false;
      this.cdr.detectChanges();
    }
  }
}
