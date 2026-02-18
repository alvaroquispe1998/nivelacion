import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DAYS } from '../shared/days';

interface TeacherScheduleItem {
  id: string;
  sectionId: string;
  sectionCourseId: string;
  sectionName: string;
  sectionCode: string | null;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
  zoomUrl?: string | null;
  location?: string | null;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Mi horario</div>
        <div class="text-sm text-slate-600">Cursos-seccion asignados</div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
      >
        Refrescar
      </button>
    </div>

    <div
      *ngIf="error"
      class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th class="px-4 py-3">Seccion</th>
            <th class="px-4 py-3">Curso</th>
            <th class="px-4 py-3">Dia</th>
            <th class="px-4 py-3">Hora</th>
            <th class="px-4 py-3">Vigencia</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let item of items; trackBy: trackItem" class="border-t border-slate-100">
            <td class="px-4 py-3 font-medium">{{ item.sectionCode || item.sectionName }}</td>
            <td class="px-4 py-3">{{ item.courseName }}</td>
            <td class="px-4 py-3">{{ dayLabel(item.dayOfWeek) }}</td>
            <td class="px-4 py-3">{{ item.startTime }}-{{ item.endTime }}</td>
            <td class="px-4 py-3">{{ formatDateRange(item.startDate, item.endDate) }}</td>
          </tr>
          <tr *ngIf="items.length === 0" class="border-t border-slate-100">
            <td class="px-4 py-6 text-slate-600" colspan="5">Sin horarios asignados.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class TeacherSchedulePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly days = DAYS;
  items: TeacherScheduleItem[] = [];
  error: string | null = null;

  async ngOnInit() {
    await this.load();
  }

  trackItem(_: number, item: TeacherScheduleItem) {
    return item.id;
  }

  dayLabel(dow: number) {
    return this.days.find((d) => d.dayOfWeek === dow)?.label ?? String(dow);
  }

  formatDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate) return `${startDate} a ${endDate}`;
    if (startDate) return `Desde ${startDate}`;
    if (endDate) return `Hasta ${endDate}`;
    return 'Sin rango';
  }

  async load() {
    this.error = null;
    try {
      this.items = await firstValueFrom(
        this.http.get<TeacherScheduleItem[]>('/api/teacher/schedule')
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar horario de docente';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
