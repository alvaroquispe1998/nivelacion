import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StudentAttendanceItem } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Asistencia</div>
        <div class="text-sm text-slate-600">Historial de sesiones</div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
      >
        Refrescar
      </button>
    </div>

    <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label class="block max-w-md">
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Curso
        </div>
        <select
          class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          [(ngModel)]="selectedCourse"
        >
          <option [ngValue]="allCoursesOption">Todos los cursos</option>
          <option *ngFor="let c of courseOptions; trackBy: trackText" [ngValue]="c">
            {{ c }}
          </option>
        </select>
      </label>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th class="px-4 py-3">Curso</th>
            <th class="px-4 py-3">Fecha</th>
            <th class="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let it of filteredItems" class="border-t border-slate-100">
            <td class="px-4 py-3 font-medium">{{ it.courseName }}</td>
            <td class="px-4 py-3 text-slate-700">{{ it.sessionDate }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                [class.bg-emerald-100]="it.status==='ASISTIO'"
                [class.text-emerald-800]="it.status==='ASISTIO'"
                [class.bg-rose-100]="it.status==='FALTO'"
                [class.text-rose-800]="it.status==='FALTO'"
              >
                {{ it.status }}
              </span>
            </td>
          </tr>
          <tr *ngIf="filteredItems.length===0" class="border-t border-slate-100">
            <td class="px-4 py-6 text-slate-600" colspan="3">Sin registros</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class StudentAttendancePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  items: StudentAttendanceItem[] = [];
  courseOptions: string[] = [];
  selectedCourse = '__ALL__';
  readonly allCoursesOption = '__ALL__';
  error: string | null = null;

  get filteredItems() {
    if (this.selectedCourse === this.allCoursesOption) return this.items;
    return this.items.filter((x) => x.courseName === this.selectedCourse);
  }

  async ngOnInit() {
    await this.load();
  }

  trackText(_: number, item: string) {
    return item;
  }

  async load() {
    this.error = null;
    try {
      this.items = await firstValueFrom(
        this.http.get<StudentAttendanceItem[]>('/api/student/attendance')
      );
      this.courseOptions = Array.from(
        new Set(
          this.items
            .map((x) => String(x.courseName ?? '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));
      if (
        this.selectedCourse !== this.allCoursesOption &&
        !this.courseOptions.includes(this.selectedCourse)
      ) {
        this.selectedCourse = this.allCoursesOption;
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar la asistencia';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
