import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  GradesSectionCourseOption,
  SectionCourseGradesResponse,
} from '@uai/shared';
import { firstValueFrom, Subscription } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-xl font-semibold">Registro de notas por seccion-curso</div>
            <div class="text-sm text-slate-600">
              Guarda y publica notas por seccion-curso.
            </div>
          </div>
          <button
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            (click)="loadAll()"
          >
            Refrescar
          </button>
        </div>
      </div>

      <div *ngIf="error" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ error }}
      </div>
      <div *ngIf="success" class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {{ success }}
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="mt-1 grid gap-2 md:grid-cols-4">
          <label class="text-xs font-semibold text-slate-700">
            Facultad
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="selectedFaculty"
              (ngModelChange)="applySectionCourseFilter()"
            >
              <option value="">Todas</option>
              <option *ngFor="let value of facultyOptions; trackBy: trackText" [value]="value">
                {{ value }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Sede
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="selectedCampus"
              (ngModelChange)="applySectionCourseFilter()"
            >
              <option value="">Todas</option>
              <option *ngFor="let value of campusOptions; trackBy: trackText" [value]="value">
                {{ value }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Curso
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="selectedCourse"
              (ngModelChange)="applySectionCourseFilter()"
            >
              <option value="">Todos</option>
              <option *ngFor="let value of courseOptions; trackBy: trackText" [value]="value">
                {{ value }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Seccion-curso
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="selectedSectionCourseId"
              (ngModelChange)="onSectionCourseChange()"
            >
              <option value="">Seleccionar</option>
              <option
                *ngFor="let option of filteredSectionCourses; trackBy: trackSectionCourse"
                [value]="option.sectionCourseId"
              >
                {{ option.sectionCode || option.sectionName }} | {{ option.courseName }} ({{ option.studentCount }})
              </option>
            </select>
          </label>
        </div>

        <div *ngIf="sectionGrades" class="mt-4">
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Despues de publicar, el docente no podra editar estas notas. El administrador si podra corregir.
          </div>

          <div class="mt-2 text-xs text-slate-600">
            Publicado:
            <span class="font-semibold" [class.text-emerald-700]="sectionGrades.publication.isPublished">
              {{ sectionGrades.publication.isPublished ? 'Si' : 'No' }}
            </span>
            Celdas completas: {{ sectionGrades.stats.gradedCells }}/{{ sectionGrades.stats.requiredCells }}
          </div>

          <div class="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th class="px-3 py-2">DNI</th>
                  <th class="px-3 py-2">Codigo</th>
                  <th class="px-3 py-2">Alumno</th>
                  <th class="px-3 py-2" *ngFor="let c of activeSchemeComponents; trackBy: trackComponent">
                    {{ c.code }}
                  </th>
                  <th class="px-3 py-2">Promedio</th>
                  <th class="px-3 py-2">Aprobado</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of sectionGrades.students; trackBy: trackStudentGrade" class="border-t border-slate-100">
                  <td class="px-3 py-2">{{ row.dni }}</td>
                  <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                  <td class="px-3 py-2 font-medium">{{ row.fullName }}</td>
                  <td class="px-3 py-2" *ngFor="let c of activeSchemeComponents; trackBy: trackComponent">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="0.01"
                      class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      [ngModel]="editableScores[row.studentId]?.[c.id] ?? ''"
                      (ngModelChange)="setScore(row.studentId, c.id, $event)"
                    />
                  </td>
                  <td class="px-3 py-2">{{ row.finalAverage | number:'1.0-0' }}</td>
                  <td class="px-3 py-2">
                    <span
                      class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                      [class.bg-emerald-100]="isRowComplete(row) && row.approved"
                      [class.text-emerald-700]="isRowComplete(row) && row.approved"
                      [class.bg-rose-100]="isRowComplete(row) && !row.approved"
                      [class.text-rose-700]="isRowComplete(row) && !row.approved"
                      [class.bg-amber-100]="!isRowComplete(row)"
                      [class.text-amber-700]="!isRowComplete(row)"
                    >
                      {{ isRowComplete(row) ? (row.approved ? 'SI' : 'NO') : 'PENDIENTE' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-3 flex flex-wrap justify-end gap-2">
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              [disabled]="savingGrades || publishingGrades"
              (click)="saveGrades()"
            >
              {{ savingGrades ? 'Guardando...' : 'Guardar notas' }}
            </button>
            <button
              class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="savingGrades || publishingGrades"
              (click)="publishGrades()"
            >
              {{ publishingGrades ? 'Publicando...' : 'Publicar notas' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminGradesPage implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private routeSub?: Subscription;

  error: string | null = null;
  success: string | null = null;

  allSectionCourses: GradesSectionCourseOption[] = [];
  filteredSectionCourses: GradesSectionCourseOption[] = [];
  selectedSectionCourseId = '';
  selectedFaculty = '';
  selectedCampus = '';
  selectedCourse = '';
  facultyOptions: string[] = [];
  campusOptions: string[] = [];
  courseOptions: string[] = [];

  sectionGrades: SectionCourseGradesResponse | null = null;
  editableScores: Record<string, Record<string, string>> = {};
  savingGrades = false;
  publishingGrades = false;

  get activeSchemeComponents() {
    return (this.sectionGrades?.scheme.components ?? []).filter((x) => x.isActive);
  }

  ngOnInit() {
    this.routeSub = this.route.queryParams.subscribe((params) => {
      const faculty = String(params['facultyGroup'] ?? '').trim();
      const campus = String(params['campusName'] ?? '').trim();
      const course = String(params['courseName'] ?? '').trim();
      const sectionCourseId = String(params['sectionCourseId'] ?? '').trim();
      if (faculty) this.selectedFaculty = faculty;
      if (campus) this.selectedCampus = campus;
      if (course) this.selectedCourse = course;
      if (sectionCourseId) this.selectedSectionCourseId = sectionCourseId;
      void this.loadAll();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  trackComponent(_: number, item: { id: string }) {
    return item.id;
  }

  trackText(_: number, item: string) {
    return item;
  }

  trackSectionCourse(_: number, item: GradesSectionCourseOption) {
    return item.sectionCourseId;
  }

  trackStudentGrade(_: number, item: { studentId: string }) {
    return item.studentId;
  }

  isRowComplete(row: SectionCourseGradesResponse['students'][number]) {
    const scores = row.scores ? Object.values(row.scores) : [];
    if (scores.length > 0) {
      return scores.every((score) => score !== null);
    }
    return Boolean((row as any).isComplete);
  }

  applySectionCourseFilter() {
    const faculty = this.norm(this.selectedFaculty);
    const campus = this.norm(this.selectedCampus);
    const course = this.norm(this.selectedCourse);
    this.filteredSectionCourses = this.allSectionCourses.filter((x) => {
      if (faculty && this.norm(x.facultyGroup ?? '') !== faculty) return false;
      if (campus && this.norm(x.campusName ?? '') !== campus) return false;
      if (course && this.norm(x.courseName ?? '') !== course) return false;
      return true;
    });
    if (
      this.selectedSectionCourseId &&
      !this.filteredSectionCourses.some((x) => x.sectionCourseId === this.selectedSectionCourseId)
    ) {
      this.selectedSectionCourseId = '';
      this.sectionGrades = null;
      this.editableScores = {};
    }
  }

  async onSectionCourseChange() {
    this.error = null;
    this.success = null;
    if (!this.selectedSectionCourseId) {
      this.sectionGrades = null;
      this.editableScores = {};
      return;
    }
    try {
      this.sectionGrades = await firstValueFrom(
        this.http.get<SectionCourseGradesResponse>(
          `/api/admin/grades/section-courses/${encodeURIComponent(this.selectedSectionCourseId)}`
        )
      );
      this.buildEditableScores();
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudo cargar notas de la seccion-curso.');
      this.sectionGrades = null;
      this.editableScores = {};
    } finally {
      this.cdr.detectChanges();
    }
  }

  setScore(studentId: string, componentId: string, value: unknown) {
    const sid = String(studentId ?? '').trim();
    const cid = String(componentId ?? '').trim();
    if (!sid || !cid) return;
    this.editableScores[sid] = this.editableScores[sid] ?? {};
    this.editableScores[sid][cid] = String(value ?? '').trim();
  }

  async saveGrades() {
    if (!this.sectionGrades || !this.selectedSectionCourseId) return;
    this.error = null;
    this.success = null;
    this.savingGrades = true;
    try {
      const payload = this.buildGradesPayload();
      this.sectionGrades = await firstValueFrom(
        this.http.put<SectionCourseGradesResponse>(
          `/api/admin/grades/section-courses/${encodeURIComponent(this.selectedSectionCourseId)}`,
          { grades: payload }
        )
      );
      this.buildEditableScores();
      this.success = 'Notas guardadas.';
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudieron guardar las notas.');
    } finally {
      this.savingGrades = false;
      this.cdr.detectChanges();
    }
  }

  async publishGrades() {
    if (!this.sectionGrades || !this.selectedSectionCourseId) return;
    this.error = null;
    this.success = null;
    const confirmed = window.confirm(
      'Despues de publicar, el docente no podra editar estas notas. Deseas continuar?'
    );
    if (!confirmed) return;
    this.publishingGrades = true;
    try {
      const result = await firstValueFrom(
        this.http.post<{
          ok: boolean;
          students: number;
          components: number;
        }>(
          `/api/admin/grades/section-courses/${encodeURIComponent(
            this.selectedSectionCourseId
          )}/publish`,
          {}
        )
      );
      this.success = `Notas publicadas. Alumnos: ${result.students}, componentes: ${result.components}.`;
      await this.onSectionCourseChange();
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudieron publicar las notas.');
    } finally {
      this.publishingGrades = false;
      this.cdr.detectChanges();
    }
  }

  async loadAll() {
    this.error = null;
    this.success = null;
    try {
      const sectionCourses = await firstValueFrom(
        this.http.get<GradesSectionCourseOption[]>('/api/admin/grades/section-courses')
      );
      this.allSectionCourses = sectionCourses;
      this.facultyOptions = Array.from(new Set(sectionCourses.map((x) => String(x.facultyGroup ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      this.campusOptions = Array.from(new Set(sectionCourses.map((x) => String(x.campusName ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      this.courseOptions = Array.from(new Set(sectionCourses.map((x) => String(x.courseName ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      this.applySectionCourseFilter();

      if (this.selectedSectionCourseId) {
        await this.onSectionCourseChange();
      }
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudo cargar la pantalla de notas.');
    } finally {
      this.cdr.detectChanges();
    }
  }

  private buildEditableScores() {
    const next: Record<string, Record<string, string>> = {};
    for (const student of this.sectionGrades?.students ?? []) {
      next[student.studentId] = {};
      for (const component of this.sectionGrades?.scheme.components ?? []) {
        const score = student.scores?.[component.id];
        next[student.studentId][component.id] =
          score === null || typeof score === 'undefined' ? '' : String(score);
      }
    }
    this.editableScores = next;
  }

  private buildGradesPayload() {
    const payload: Array<{ studentId: string; componentId: string; score: number }> = [];
    for (const student of this.sectionGrades?.students ?? []) {
      const row = this.editableScores[student.studentId] ?? {};
      for (const component of this.sectionGrades?.scheme.components ?? []) {
        const raw = String(row[component.id] ?? '').trim();
        if (!raw) continue;
        const score = Number(raw);
        if (Number.isFinite(score)) {
          payload.push({
            studentId: student.studentId,
            componentId: component.id,
            score,
          });
        }
      }
    }
    return payload;
  }

  private extractError(error: any, fallback: string) {
    const err = error?.error;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    if (err?.message && typeof err.message === 'object') {
      return JSON.stringify(err.message);
    }
    return String(error?.message ?? fallback);
  }

  private norm(value: string) {
    return String(value ?? '').trim().toUpperCase();
  }
}
