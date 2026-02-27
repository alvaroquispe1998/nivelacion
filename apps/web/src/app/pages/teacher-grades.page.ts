import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface TeacherAssignment {
  sectionCourseId: string;
  sectionId: string;
  sectionName: string;
  sectionCode: string | null;
  courseId: string;
  courseName: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Registro de notas</div>
        <div class="text-sm text-slate-600">Selecciona tu curso-sección.</div>
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

    <div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th class="px-4 py-3">Sección</th>
            <th class="px-4 py-3">Curso</th>
            <th class="px-4 py-3">Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let item of assignments; trackBy: trackItem" class="border-t border-slate-100">
            <td class="px-4 py-3 font-medium">{{ item.sectionCode || item.sectionName }}</td>
            <td class="px-4 py-3">{{ item.courseName }}</td>
            <td class="px-4 py-3">
              <a
                class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                [routerLink]="['/teacher/grades', item.sectionCourseId]"
              >
                Abrir
              </a>
            </td>
          </tr>
          <tr *ngIf="assignments.length === 0" class="border-t border-slate-100">
            <td class="px-4 py-6 text-slate-600" colspan="3">Sin asignaciones docentes.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class TeacherGradesPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  assignments: TeacherAssignment[] = [];
  error: string | null = null;

  async ngOnInit() {
    await this.load();
  }

  trackItem(_: number, item: TeacherAssignment) {
    return item.sectionCourseId;
  }

  async load() {
    this.error = null;
    try {
      this.assignments = await firstValueFrom(
        this.http.get<TeacherAssignment[]>('/api/teacher/assignments')
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar asignaciones';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
