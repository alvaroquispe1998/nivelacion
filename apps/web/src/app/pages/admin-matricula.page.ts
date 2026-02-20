import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type {
  LevelingMatriculationPreviewResponse,
  LevelingMatriculationResult,
  LevelingRunConflictItem,
} from '@uai/shared';

interface ActiveRunSummary {
  run: { id: string; status: string } | null;
}

interface AssignmentRow {
  sectionCourseId: string;
  sectionId: string;
  sectionCode: string | null;
  sectionName: string;
  facultyGroup: string | null;
  campusName: string | null;
  modality: string | null;
  scopeLabel: string;
  courseName: string;
  teacherName: string | null;
  initialCapacity: number;
  maxExtraCapacity: number;
  assignedCount: number;
  students: Array<{ studentId: string; studentCode?: string | null; studentName: string }>;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Matricula</div>
        <div class="text-sm text-slate-600">
          Previsualiza por facultad y ejecuta la matricula automatica sin cruces de horario.
        </div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="loadContext()"
      >
        Refrescar
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div *ngIf="loading" class="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Cargando contexto de matricula...
    </div>

    <div *ngIf="!loading && !runId" class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      No existe una corrida de nivelacion activa. Primero aplica estructura en Nivelacion.
    </div>

    <div *ngIf="runId" class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="text-sm text-slate-700">
        Estado del proceso de matricula:
        <b>{{ runStatusLabel(runStatus) }}</b>
      </div>
    </div>

    <div *ngIf="runId" class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <label class="text-xs text-slate-700">
          Facultad (solo listas para matricula)
          <select
            class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            [(ngModel)]="selectedFaculty"
            [ngModelOptions]="{ standalone: true }"
          >
            <option value="" disabled>Selecciona facultad</option>
            <option *ngFor="let fac of readyFaculties" [value]="fac.facultyGroup">
              {{ fac.facultyGroup }} ({{ fac.totalSectionCourses }} cursos-seccion)
            </option>
          </select>
        </label>

        <button
          class="rounded-xl border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
          [disabled]="!selectedFaculty || previewLoading"
          (click)="previewMatriculation()"
        >
          {{ previewLoading ? 'Previsualizando...' : 'Previsualizar' }}
        </button>

        <button
          class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          [disabled]="!canGenerate || generating"
          (click)="openGenerateConfirm()"
        >
          {{ generating ? 'Generando...' : 'Generar matricula' }}
        </button>
      </div>

      <div *ngIf="readyFaculties.length === 0" class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No hay facultades listas. Debes completar horarios y docentes en todas sus secciones-curso.
      </div>
    </div>

    <div *ngIf="preview && preview.selectedFacultyGroup" class="mt-4 space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Resumen de previsualizacion</div>
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-600">Facultad</div>
            <div class="text-base font-semibold">{{ preview.selectedFacultyGroup }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-600">Asignaciones simuladas</div>
            <div class="text-base font-semibold">{{ preview.assignedCount }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-600">No asignados</div>
            <div class="text-base font-semibold">{{ preview.unassigned.length }}</div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border p-4" [ngClass]="preview.conflicts.length === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'">
        <div *ngIf="preview.conflicts.length === 0" class="text-sm font-semibold text-emerald-800">
          No hay cruce de horario en la previsualizacion.
        </div>
        <div *ngIf="preview.conflicts.length > 0" class="space-y-2">
          <div class="text-sm font-semibold text-red-800">
            Cruces detectados: {{ preview.conflicts.length }}
          </div>
          <div class="max-h-60 overflow-auto rounded-xl border border-red-200 bg-white">
            <table class="min-w-full text-xs">
              <thead class="bg-red-50 text-left text-red-700">
                <tr>
                  <th class="px-3 py-2">Alumno</th>
                  <th class="px-3 py-2">Dia</th>
                  <th class="px-3 py-2">Bloque A</th>
                  <th class="px-3 py-2">Bloque B</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of preview.conflicts; trackBy: trackConflict" class="border-t border-red-100">
                  <td class="px-3 py-2">{{ studentCode(item.studentCode) }} - {{ item.studentName }}</td>
                  <td class="px-3 py-2">{{ dayLabel(item.dayOfWeek) }}</td>
                  <td class="px-3 py-2">{{ item.blockA.sectionCode || item.blockA.sectionName }} / {{ item.blockA.courseName }} ({{ item.blockA.startTime }}-{{ item.blockA.endTime }})</td>
                  <td class="px-3 py-2">{{ item.blockB.sectionCode || item.blockB.sectionName }} / {{ item.blockB.courseName }} ({{ item.blockB.startTime }}-{{ item.blockB.endTime }})</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Asignacion por seccion-curso ({{ filteredAssignmentRows.length }})</div>
        <div class="mt-3 grid gap-3 lg:grid-cols-3">
          <label class="text-xs text-slate-700">
            Facultad
            <select
              class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              [(ngModel)]="assignmentFilterFaculty"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="">Todas</option>
              <option *ngFor="let item of assignmentFacultyOptions" [value]="item">{{ item }}</option>
            </select>
          </label>

          <label class="text-xs text-slate-700">
            Sede - Modalidad
            <select
              class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              [(ngModel)]="assignmentFilterScope"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="">Todas</option>
              <option *ngFor="let item of assignmentScopeOptions" [value]="item">{{ item }}</option>
            </select>
          </label>

          <label class="text-xs text-slate-700">
            Curso
            <select
              class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              [(ngModel)]="assignmentFilterCourse"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="">Todos</option>
              <option *ngFor="let item of assignmentCourseOptions" [value]="item">{{ item }}</option>
            </select>
          </label>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-4 py-3">Seccion</th>
                <th class="px-4 py-3">Curso</th>
                <th class="px-4 py-3">Docente</th>
                <th class="px-4 py-3">Aforo</th>
                <th class="px-4 py-3">Asignados</th>
                <th class="px-4 py-3">Accion</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of filteredAssignmentRows; trackBy: trackAssignmentRow" class="border-t border-slate-100">
                <td class="px-4 py-3 font-medium">{{ row.sectionCode || row.sectionName }}</td>
                <td class="px-4 py-3">{{ row.courseName }}</td>
                <td class="px-4 py-3 text-xs">{{ row.teacherName || '-' }}</td>
                <td class="px-4 py-3 text-xs">{{ sectionCourseCapacityLabel(row) }}</td>
                <td class="px-4 py-3 font-semibold">{{ row.assignedCount }}</td>
                <td class="px-4 py-3">
                  <button
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="openStudentsModal(row.sectionCode || row.sectionName, row.courseName, row.students)"
                  >
                    Ver alumnos ({{ row.students.length }})
                  </button>
                </td>
              </tr>
              <tr *ngIf="filteredAssignmentRows.length === 0" class="border-t border-slate-100">
                <td class="px-4 py-4 text-sm text-slate-500" colspan="6">
                  Sin resultados para los filtros seleccionados.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div *ngIf="preview.unassigned.length > 0" class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div class="text-sm font-semibold text-amber-900">No asignados</div>
        <div class="mt-3 max-h-72 overflow-auto rounded-xl border border-amber-200 bg-white">
          <table class="min-w-full text-xs">
            <thead class="bg-amber-50 text-left text-amber-800">
              <tr>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Curso</th>
                <th class="px-3 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of preview.unassigned; trackBy: trackUnassigned" class="border-t border-amber-100">
                <td class="px-3 py-2">{{ studentCode(item.studentCode) }} - {{ item.studentName }}</td>
                <td class="px-3 py-2">{{ item.courseName }}</td>
                <td class="px-3 py-2">{{ item.reason }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      *ngIf="generateConfirmOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white"
            >
              !
            </span>
            <div>
              <div class="text-base font-semibold text-slate-900">Confirmar generacion de matricula</div>
              <div class="text-xs text-slate-500">Facultad: {{ selectedFaculty || '-' }}</div>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            [disabled]="generating"
            (click)="closeGenerateConfirm()"
          >
            Cerrar
          </button>
        </div>

        <div class="px-5 py-4 text-sm text-slate-700">
          Se ejecutara la matricula automatica para <b>{{ selectedFaculty }}</b>.
          Esta accion reemplaza la matricula previa de esta facultad en la corrida activa.
        </div>

        <div class="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            [disabled]="generating"
            (click)="closeGenerateConfirm()"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="generating"
            (click)="confirmGenerateMatriculation()"
          >
            {{ generating ? 'Generando...' : 'Confirmar y generar' }}
          </button>
        </div>
      </div>
    </div>

    <div *ngIf="studentsModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold">{{ studentsModalTitle }}</div>
            <div class="text-xs text-slate-600">Alumnos asignados en la previsualizacion</div>
          </div>
          <button class="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold" (click)="closeStudentsModal()">
            Cerrar
          </button>
        </div>

        <div class="mt-3 max-h-96 overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-4 py-3">Codigo</th>
                <th class="px-4 py-3">Alumno</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let student of studentsModalRows; trackBy: trackStudent" class="border-t border-slate-100">
                <td class="px-4 py-3 font-semibold">{{ studentCode(student.studentCode) }}</td>
                <td class="px-4 py-3">{{ student.studentName }}</td>
              </tr>
              <tr *ngIf="studentsModalRows.length === 0" class="border-t border-slate-100">
                <td class="px-4 py-4 text-sm text-slate-500" colspan="2">Sin alumnos en este curso-seccion.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class AdminMatriculaPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = false;
  previewLoading = false;
  generating = false;
  error: string | null = null;

  runId: string | null = null;
  runStatus: string | null = null;

  preview: LevelingMatriculationPreviewResponse | null = null;
  selectedFaculty = '';
  assignmentFilterFaculty = '';
  assignmentFilterScope = '';
  assignmentFilterCourse = '';
  generateConfirmOpen = false;

  studentsModalOpen = false;
  studentsModalTitle = '';
  studentsModalRows: Array<{
    studentId: string;
    studentCode?: string | null;
    studentName: string;
  }> = [];

  get readyFaculties() {
    return (this.preview?.faculties ?? []).filter((f) => f.ready);
  }

  get canGenerate() {
    return (
      Boolean(this.runId) &&
      Boolean(this.selectedFaculty) &&
      Boolean(this.preview?.selectedFacultyGroup) &&
      this.preview?.selectedFacultyGroup === this.selectedFaculty &&
      Boolean(this.preview?.canMatriculateSelectedFaculty) &&
      !this.generating
    );
  }

  get assignmentRows(): AssignmentRow[] {
    if (!this.preview) return [];
    const rows: AssignmentRow[] = [];
    for (const section of this.preview.sections ?? []) {
      for (const course of section.sectionCourses ?? []) {
        rows.push({
          sectionCourseId: String(course.sectionCourseId),
          sectionId: String(section.sectionId),
          sectionCode: section.sectionCode ? String(section.sectionCode) : null,
          sectionName: String(section.sectionName ?? ''),
          facultyGroup: section.facultyGroup ? String(section.facultyGroup) : null,
          campusName: section.campusName ? String(section.campusName) : null,
          modality: section.modality ? String(section.modality) : null,
          scopeLabel: `${section.campusName || '-'} - ${section.modality || '-'}`,
          courseName: String(course.courseName ?? ''),
          teacherName: course.teacherName ? String(course.teacherName) : null,
          initialCapacity: Number(course.initialCapacity ?? 0),
          maxExtraCapacity: Number(course.maxExtraCapacity ?? 0),
          assignedCount: Number(course.assignedCount ?? 0),
          students: (course.students ?? []).map((student) => ({
            studentId: String(student.studentId),
            studentCode: student.studentCode ? String(student.studentCode) : null,
            studentName: String(student.studentName ?? ''),
          })),
        });
      }
    }
    return rows;
  }

  get assignmentFacultyOptions() {
    return Array.from(
      new Set(
        this.assignmentRows
          .map((row) => String(row.facultyGroup ?? '').trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => this.scopeKey(a).localeCompare(this.scopeKey(b)));
  }

  get assignmentScopeOptions() {
    return Array.from(
      new Set(
        this.assignmentRows
          .map((row) => String(row.scopeLabel ?? '').trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => this.scopeKey(a).localeCompare(this.scopeKey(b)));
  }

  get assignmentCourseOptions() {
    return Array.from(
      new Set(
        this.assignmentRows
          .map((row) => String(row.courseName ?? '').trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => this.scopeKey(a).localeCompare(this.scopeKey(b)));
  }

  get filteredAssignmentRows() {
    return this.assignmentRows.filter((row) => {
      if (
        this.assignmentFilterFaculty &&
        this.scopeKey(row.facultyGroup) !== this.scopeKey(this.assignmentFilterFaculty)
      ) {
        return false;
      }
      if (
        this.assignmentFilterScope &&
        this.scopeKey(row.scopeLabel) !== this.scopeKey(this.assignmentFilterScope)
      ) {
        return false;
      }
      if (
        this.assignmentFilterCourse &&
        this.scopeKey(row.courseName) !== this.scopeKey(this.assignmentFilterCourse)
      ) {
        return false;
      }
      return true;
    });
  }

  async ngOnInit() {
    await this.loadContext();
  }

  trackAssignmentRow(_: number, row: AssignmentRow) {
    return row.sectionCourseId;
  }

  trackUnassigned(_: number, row: { studentId: string; courseId: string }) {
    return `${row.studentId}:${row.courseId}`;
  }

  trackConflict(_: number, row: LevelingRunConflictItem) {
    return `${row.studentId}:${row.blockA.blockId}:${row.blockB.blockId}`;
  }

  trackStudent(_: number, row: { studentId: string }) {
    return row.studentId;
  }

  studentCode(code: string | null | undefined) {
    const value = String(code ?? '').trim();
    return value || 'SIN CODIGO';
  }

  dayLabel(dayOfWeek: number) {
    const labels = ['', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
    return labels[Number(dayOfWeek) || 0] ?? String(dayOfWeek);
  }

  sectionCourseCapacityLabel(sectionCourse: {
    modality?: string | null;
    initialCapacity: number;
    maxExtraCapacity: number;
    assignedCount: number;
  }) {
    const modality = String(sectionCourse.modality ?? '').toUpperCase();
    if (modality.includes('VIRTUAL')) {
      return 'Sin aforo (virtual)';
    }
    const initial = Math.max(0, Number(sectionCourse.initialCapacity ?? 0));
    const extra = Math.max(0, Number(sectionCourse.maxExtraCapacity ?? 0));
    const assigned = Math.max(0, Number(sectionCourse.assignedCount ?? 0));
    const total = initial + extra;
    if (total <= 0) return 'Sin limite';
    const available = Math.max(0, total - assigned);
    return `${total} (disp. ${available})`;
  }

  private scopeKey(value: string | null | undefined) {
    return String(value ?? '').trim().toUpperCase();
  }

  private resetAssignmentFilters() {
    this.assignmentFilterFaculty = this.selectedFaculty || '';
    this.assignmentFilterScope = '';
    this.assignmentFilterCourse = '';
  }

  runStatusLabel(status: string | null | undefined) {
    const value = String(status ?? '').trim().toUpperCase();
    if (value === 'STRUCTURED') return 'Estructura aplicada';
    if (value === 'READY') return 'Lista para matricula';
    if (value === 'MATRICULATED') return 'Matricula ejecutada';
    if (value === 'ARCHIVED') return 'Archivada';
    return 'Sin estado';
  }

  async loadContext() {
    this.loading = true;
    this.previewLoading = false;
    this.error = null;
    try {
      const summary = await firstValueFrom(
        this.http.get<ActiveRunSummary>('/api/admin/leveling/active-run-summary')
      );
      this.runId = String(summary?.run?.id ?? '').trim() || null;
      this.runStatus = String(summary?.run?.status ?? '').trim() || null;

      if (!this.runId) {
        this.preview = null;
        this.selectedFaculty = '';
        return;
      }

      await this.loadPreviewBase();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar el contexto de matricula';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async loadPreviewBase() {
    if (!this.runId) return;
    this.preview = await firstValueFrom(
      this.http.get<LevelingMatriculationPreviewResponse>(
        `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate-preview`
      )
    );

    const ready = this.readyFaculties;
    if (ready.length > 0) {
      const exists = ready.some((row) => row.facultyGroup === this.selectedFaculty);
      if (!exists) {
        this.selectedFaculty = ready[0].facultyGroup;
      }
    } else {
      this.selectedFaculty = '';
    }
    this.resetAssignmentFilters();
  }

  async previewMatriculation() {
    if (!this.runId || !this.selectedFaculty) return;
    this.previewLoading = true;
    this.error = null;
    try {
      const params = new HttpParams().set('facultyGroup', this.selectedFaculty);
      this.preview = await firstValueFrom(
        this.http.get<LevelingMatriculationPreviewResponse>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate-preview`,
          { params }
        )
      );
      this.resetAssignmentFilters();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo previsualizar la matricula';
    } finally {
      this.previewLoading = false;
      this.cdr.detectChanges();
    }
  }

  async generateMatriculation() {
    if (!this.canGenerate || !this.runId || !this.selectedFaculty) return;

    this.generating = true;
    this.error = null;
    try {
      const result = await firstValueFrom(
        this.http.post<LevelingMatriculationResult>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate`,
          { facultyGroup: this.selectedFaculty }
        )
      );
      this.runStatus = result.status;
      await this.previewMatriculation();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo generar la matricula';
    } finally {
      this.generating = false;
      this.cdr.detectChanges();
    }
  }

  openGenerateConfirm() {
    if (!this.canGenerate || !this.selectedFaculty) return;
    this.generateConfirmOpen = true;
  }

  closeGenerateConfirm() {
    if (this.generating) return;
    this.generateConfirmOpen = false;
  }

  async confirmGenerateMatriculation() {
    if (!this.generateConfirmOpen) return;
    this.generateConfirmOpen = false;
    await this.generateMatriculation();
  }

  openStudentsModal(
    sectionLabel: string,
    courseName: string,
    students: Array<{ studentId: string; studentCode?: string | null; studentName: string }>
  ) {
    this.studentsModalOpen = true;
    this.studentsModalTitle = `${sectionLabel} - ${courseName}`;
    this.studentsModalRows = students.slice();
  }

  closeStudentsModal() {
    this.studentsModalOpen = false;
    this.studentsModalTitle = '';
    this.studentsModalRows = [];
  }
}
