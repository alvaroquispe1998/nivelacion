import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface StudentGradesResponse {
  periodId: string;
  components: Array<{
    id: string;
    code: string;
    name: string;
    weight: number;
  }>;
  rows: Array<{
    sectionCourseId: string;
    courseName: string;
    sectionCode?: string | null;
    sectionName: string;
    facultyGroup?: string | null;
    facultyName?: string | null;
    campusName?: string | null;
    modality?: string | null;
    components: Array<{
      componentId: string;
      code: string;
      name: string;
      weight: number;
      score: number | null;
    }>;
    isComplete: boolean;
    finalAverage: number;
    approved: boolean;
  }>;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Mis calificaciones</div>
        <div class="text-sm text-slate-600">Notas guardadas y promedio final por curso.</div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
      >
        Refrescar
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 space-y-4" *ngIf="rows.length > 0">
      <article *ngFor="let row of rows; trackBy: trackRow" class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="text-base font-semibold">{{ row.courseName }}</div>
            <div class="text-xs text-slate-600">
              {{ row.sectionCode || row.sectionName }} | {{ row.campusName || '-' }} | {{ row.modality || '-' }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-500">Promedio final</div>
            <div class="text-lg font-bold">{{ row.finalAverage | number:'1.0-0' }}</div>
            <span
              class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
              [class.bg-emerald-100]="isRowComplete(row) && row.approved"
              [class.text-emerald-700]="isRowComplete(row) && row.approved"
              [class.bg-rose-100]="isRowComplete(row) && !row.approved"
              [class.text-rose-700]="isRowComplete(row) && !row.approved"
              [class.bg-amber-100]="!isRowComplete(row)"
              [class.text-amber-700]="!isRowComplete(row)"
            >
              {{ isRowComplete(row) ? (row.approved ? 'APROBADO' : 'DESAPROBADO') : 'PENDIENTE' }}
            </span>
          </div>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-2">Componente</th>
                <th class="px-3 py-2 text-right">Peso %</th>
                <th class="px-3 py-2 text-right">Nota</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of row.components; trackBy: trackComponent" class="border-t border-slate-100">
                <td class="px-3 py-2">{{ item.name }}</td>
                <td class="px-3 py-2 text-right">{{ item.weight | number:'1.0-2' }}</td>
                <td class="px-3 py-2 text-right font-semibold">
                  {{ item.score === null ? '-' : (item.score | number:'1.2-2') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <div *ngIf="!error && rows.length === 0" class="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600">
      No hay notas registradas todavía.
    </div>
  `,
})
export class StudentGradesPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  rows: StudentGradesResponse['rows'] = [];
  error: string | null = null;

  async ngOnInit() {
    await this.load();
  }

  trackRow(_: number, item: { sectionCourseId: string }) {
    return item.sectionCourseId;
  }

  trackComponent(_: number, item: { componentId: string }) {
    return item.componentId;
  }

  isRowComplete(row: StudentGradesResponse['rows'][number]) {
    if (Array.isArray(row.components) && row.components.length > 0) {
      return row.components.every((component) => component.score !== null);
    }
    return Boolean(row.isComplete);
  }

  async load() {
    this.error = null;
    try {
      const response = await firstValueFrom(
        this.http.get<StudentGradesResponse>('/api/student/grades')
      );
      this.rows = response?.rows ?? [];
    } catch (e: any) {
      this.rows = [];
      this.error = e?.error?.message ?? 'No se pudieron cargar tus notas.';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
