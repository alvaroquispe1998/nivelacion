import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SectionCourseGradesResponse } from '@uai/shared';
import { combineLatest, firstValueFrom, Subscription } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="text-xl font-semibold">Notas de sección</div>
          <div class="text-sm text-slate-600">
            {{ sectionLabel }} | {{ courseLabel }}
          </div>
        </div>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="load()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {{ success }}
    </div>

    <div *ngIf="sectionGrades" class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Después de publicar, no podrás editar estas notas.
      </div>
      <div class="mt-2 text-xs text-slate-600">
        Publicado:
        <span class="font-semibold" [class.text-emerald-700]="sectionGrades.publication.isPublished">
          {{ sectionGrades.publication.isPublished ? 'Sí' : 'No' }}
        </span>
        · Celdas completas: {{ sectionGrades.stats.gradedCells }}/{{ sectionGrades.stats.requiredCells }}
      </div>

      <div class="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-3 py-2">DNI</th>
              <th class="px-3 py-2">Código</th>
              <th class="px-3 py-2">Alumno</th>
              <th class="px-3 py-2" *ngFor="let c of activeComponents; trackBy: trackComponent">{{ c.code }}</th>
              <th class="px-3 py-2">Promedio</th>
              <th class="px-3 py-2">Aprobado</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of sectionGrades.students; trackBy: trackStudent" class="border-t border-slate-100">
              <td class="px-3 py-2">{{ row.dni }}</td>
              <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CÓDIGO' }}</td>
              <td class="px-3 py-2 font-medium">{{ row.fullName }}</td>
              <td class="px-3 py-2" *ngFor="let c of activeComponents; trackBy: trackComponent">
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.01"
                  class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  [disabled]="sectionGrades.publication.isPublished || saving"
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
          [disabled]="saving || publishing || sectionGrades.publication.isPublished"
          (click)="save()"
        >
          {{ saving ? 'Guardando...' : 'Guardar notas' }}
        </button>
        <button
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          [disabled]="saving || publishing || sectionGrades.publication.isPublished"
          (click)="publish()"
        >
          {{ publishing ? 'Publicando...' : 'Publicar notas' }}
        </button>
      </div>
    </div>
  `,
})
export class TeacherSectionGradesPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private routeSub?: Subscription;

  sectionCourseId = '';
  sectionGrades: SectionCourseGradesResponse | null = null;
  editableScores: Record<string, Record<string, string>> = {};
  saving = false;
  publishing = false;
  error: string | null = null;
  success: string | null = null;

  get activeComponents() {
    return (this.sectionGrades?.scheme.components ?? []).filter((x) => x.isActive);
  }

  get sectionLabel() {
    const section = this.sectionGrades?.sectionCourse;
    if (!section) return '-';
    return section.sectionCode || section.sectionName || '-';
  }

  get courseLabel() {
    return this.sectionGrades?.sectionCourse?.courseName || '-';
  }

  ngOnInit() {
    this.routeSub = combineLatest([this.route.paramMap]).subscribe(([params]) => {
      this.sectionCourseId = String(params.get('sectionCourseId') ?? '').trim();
      void this.load();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  trackComponent(_: number, item: { id: string }) {
    return item.id;
  }

  trackStudent(_: number, item: { studentId: string }) {
    return item.studentId;
  }

  isRowComplete(row: SectionCourseGradesResponse['students'][number]) {
    const scores = row.scores ? Object.values(row.scores) : [];
    if (scores.length > 0) {
      return scores.every((score) => score !== null);
    }
    return Boolean((row as any).isComplete);
  }

  setScore(studentId: string, componentId: string, value: unknown) {
    this.editableScores[studentId] = this.editableScores[studentId] ?? {};
    this.editableScores[studentId][componentId] = String(value ?? '').trim();
  }

  async load() {
    this.error = null;
    this.success = null;
    if (!this.sectionCourseId) {
      this.sectionGrades = null;
      this.editableScores = {};
      this.error = 'sectionCourseId inválido.';
      this.cdr.detectChanges();
      return;
    }
    try {
      this.sectionGrades = await firstValueFrom(
        this.http.get<SectionCourseGradesResponse>(
          `/api/teacher/grades/section-courses/${encodeURIComponent(this.sectionCourseId)}`
        )
      );
      this.buildEditableScores();
    } catch (e: any) {
      this.sectionGrades = null;
      this.editableScores = {};
      this.error = this.extractError(e, 'No se pudo cargar notas.');
    } finally {
      this.cdr.detectChanges();
    }
  }

  async save() {
    if (!this.sectionGrades) return;
    this.error = null;
    this.success = null;
    this.saving = true;
    try {
      this.sectionGrades = await firstValueFrom(
        this.http.put<SectionCourseGradesResponse>(
          `/api/teacher/grades/section-courses/${encodeURIComponent(this.sectionCourseId)}`,
          { grades: this.buildPayload() }
        )
      );
      this.buildEditableScores();
      this.success = 'Notas guardadas.';
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudieron guardar notas.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async publish() {
    if (!this.sectionGrades) return;
    this.error = null;
    this.success = null;
    const confirmed = window.confirm(
      'Después de publicar, no podrás editar estas notas. ¿Deseas continuar?'
    );
    if (!confirmed) return;
    this.publishing = true;
    try {
      await firstValueFrom(
        this.http.post(
          `/api/teacher/grades/section-courses/${encodeURIComponent(this.sectionCourseId)}/publish`,
          {}
        )
      );
      this.success = 'Notas publicadas.';
      await this.load();
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudieron publicar notas.');
    } finally {
      this.publishing = false;
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

  private buildPayload() {
    const grades: Array<{ studentId: string; componentId: string; score: number }> = [];
    for (const student of this.sectionGrades?.students ?? []) {
      const row = this.editableScores[student.studentId] ?? {};
      for (const component of this.sectionGrades?.scheme.components ?? []) {
        const raw = String(row[component.id] ?? '').trim();
        if (!raw) continue;
        const score = Number(raw);
        if (Number.isFinite(score)) {
          grades.push({
            studentId: student.studentId,
            componentId: component.id,
            score,
          });
        }
      }
    }
    return grades;
  }

  private extractError(error: any, fallback: string) {
    const err = error?.error;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    if (err?.message && typeof err.message === 'object') {
      return String(err.message.message ?? fallback);
    }
    return String(error?.message ?? fallback);
  }
}
