import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PrivateRouteContextService } from '../core/navigation/private-route-context.service';

interface StudentCourseRow {
  sectionCourseId: string;
  sectionId: string;
  sectionName: string;
  sectionCode: string | null;
  courseId: string;
  courseName: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Mis cursos</div>
        <div class="text-sm text-slate-600">Cursos-seccion con acceso a asistencia y calificaciones.</div>
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
            <th class="px-4 py-3">Seccion</th>
            <th class="px-4 py-3">Curso</th>
            <th class="px-4 py-3">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let item of items; trackBy: trackItem" class="border-t border-slate-100">
            <td class="px-4 py-3 font-medium">{{ item.sectionCode || item.sectionName }}</td>
            <td class="px-4 py-3">{{ item.courseName }}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  (click)="openAttendance(item)"
                >
                  Ver asistencia
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  (click)="openGrades(item)"
                >
                  Ver calificaciones
                </button>
              </div>
            </td>
          </tr>
          <tr *ngIf="items.length === 0" class="border-t border-slate-100">
            <td class="px-4 py-6 text-slate-600" colspan="3">Sin cursos matriculados.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class StudentCoursesPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly routeContext = inject(PrivateRouteContextService);

  items: StudentCourseRow[] = [];
  error: string | null = null;

  async ngOnInit() {
    await this.load();
  }

  trackItem(_: number, item: StudentCourseRow) {
    return item.sectionCourseId;
  }

  async openAttendance(item: StudentCourseRow) {
    this.routeContext.setStudentAttendanceFocus({
      kind: 'COURSE',
      sectionCourseId: item.sectionCourseId,
    });
    await this.router.navigate(['/student/attendance']);
  }

  async openGrades(item: StudentCourseRow) {
    this.routeContext.setStudentGradesFocus({
      sectionCourseId: item.sectionCourseId,
    });
    await this.router.navigate(['/student/grades']);
  }

  async load() {
    this.error = null;
    try {
      this.items = await firstValueFrom(
        this.http.get<StudentCourseRow[]>('/api/student/courses')
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar tus cursos.';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
