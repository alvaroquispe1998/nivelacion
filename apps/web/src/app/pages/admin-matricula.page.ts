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
          (click)="generateMatriculation()"
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
        <div class="text-sm font-semibold">Ver detalle por seccion ({{ preview.sections.length }})</div>
        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-4 py-3">Codigo</th>
                <th class="px-4 py-3">Facultad</th>
                <th class="px-4 py-3">Sede</th>
                <th class="px-4 py-3">Modalidad</th>
                <th class="px-4 py-3">Cursos</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let section of preview.sections; trackBy: trackSection" class="border-t border-slate-100">
                <td class="px-4 py-3 font-semibold">{{ section.sectionCode || section.sectionName }}</td>
                <td class="px-4 py-3">
                  <div>{{ section.facultyGroup || '-' }}</div>
                  <div class="text-xs text-slate-600">{{ section.facultyName || '-' }}</div>
                </td>
                <td class="px-4 py-3">{{ section.campusName || '-' }}</td>
                <td class="px-4 py-3">{{ section.modality || '-' }}</td>
                <td class="px-4 py-3 text-xs text-slate-600">{{ sectionCoursesLabel(section) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Asignacion por seccion-curso</div>
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
              <ng-container *ngFor="let section of preview.sections; trackBy: trackSection">
                <tr *ngFor="let sc of section.sectionCourses; trackBy: trackSectionCourse" class="border-t border-slate-100">
                  <td class="px-4 py-3 font-medium">{{ section.sectionCode || section.sectionName }}</td>
                  <td class="px-4 py-3">{{ sc.courseName }}</td>
                  <td class="px-4 py-3 text-xs">{{ sc.teacherName || '-' }}</td>
                  <td class="px-4 py-3 text-xs">{{ sc.initialCapacity }} + {{ sc.maxExtraCapacity }}</td>
                  <td class="px-4 py-3 font-semibold">{{ sc.assignedCount }}</td>
                  <td class="px-4 py-3">
                    <button
                      class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                      (click)="openStudentsModal(section.sectionCode || section.sectionName, sc.courseName, sc.students)"
                    >
                      Ver alumnos ({{ sc.students.length }})
                    </button>
                  </td>
                </tr>
              </ng-container>
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

  async ngOnInit() {
    await this.loadContext();
  }

  trackSection(_: number, row: { sectionId: string }) {
    return row.sectionId;
  }

  trackSectionCourse(_: number, row: { sectionCourseId: string }) {
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

  sectionCoursesLabel(section: {
    sectionCourses: Array<{ courseName: string }>;
  }) {
    return section.sectionCourses.map((sc) => sc.courseName).join(', ') || '-';
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
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo previsualizar la matricula';
    } finally {
      this.previewLoading = false;
      this.cdr.detectChanges();
    }
  }

  async generateMatriculation() {
    if (!this.canGenerate || !this.runId || !this.selectedFaculty) return;
    const ok = window.confirm(
      `Se ejecutara la matricula automatica para ${this.selectedFaculty}. Continuar?`
    );
    if (!ok) return;

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
