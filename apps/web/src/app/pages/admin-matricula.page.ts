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
import { WorkflowStateService } from '../core/workflow/workflow-state.service';

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
          Previsualiza por facultad y ejecuta solo la matricula de alumnos-curso pendientes, sin cruces de horario.
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
            <option *ngFor="let fac of matriculableFaculties" [value]="fac.facultyGroup">
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

      <div *ngIf="matriculableFaculties.length === 0" class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {{ noMatriculableFacultiesMessage }}
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

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Asignacion simulada por seccion-curso</div>
        <div *ngIf="hiddenPreviewSectionCourseCount > 0" class="mt-2 text-xs text-slate-500">
          Se ocultaron {{ hiddenPreviewSectionCourseCount }} seccion(es)-curso sin alumnos simulados.
        </div>
        <div class="mt-3 max-h-[460px] overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left text-slate-700">
              <tr>
                <th class="px-3 py-2">Seccion</th>
                <th class="px-3 py-2">Curso</th>
                <th class="px-3 py-2">Docente</th>
                <th class="px-3 py-2">Aula</th>
                <th class="px-3 py-2">Aforo</th>
                <th class="px-3 py-2">Asignados</th>
                <th class="px-3 py-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let row of previewAssignedSectionCourseRows; trackBy: trackPreviewSectionCourse"
                class="border-t border-slate-100"
              >
                <td class="px-3 py-2 font-semibold">{{ row.sectionCode || row.sectionName }}</td>
                <td class="px-3 py-2">{{ row.courseName }}</td>
                <td class="px-3 py-2">{{ row.teacherName || row.sectionTeacherName || '-' }}</td>
                <td class="px-3 py-2">{{ classroomLabel(row.modality, row.classroomCode, row.classroomPavilionCode, row.classroomLevelName, row.classroomCapacity, row.capacitySource) }}</td>
                <td class="px-3 py-2">{{ capacityLabel(row.modality, row.initialCapacity, row.maxExtraCapacity, row.classroomCapacity, row.capacitySource, row.assignedCount) }}</td>
                <td class="px-3 py-2 font-semibold">{{ row.assignedCount }}</td>
                <td class="px-3 py-2">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="openStudentsModal(row.sectionCode || row.sectionName, row.courseName, row.students)"
                  >
                    Ver alumnos ({{ row.students.length }})
                  </button>
                </td>
              </tr>
              <tr *ngIf="previewAssignedSectionCourseRows.length === 0" class="border-t border-slate-100">
                <td class="px-3 py-3 text-slate-500" colspan="7">
                  No hay secciones-curso para mostrar en esta previsualizacion.
                </td>
              </tr>
            </tbody>
          </table>
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
          Esta accion agregara solo asignaciones pendientes, sin borrar matriculas previas ni crear oferta nueva.
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
  private readonly workflowState = inject(WorkflowStateService);

  loading = false;
  previewLoading = false;
  generating = false;
  error: string | null = null;

  runId: string | null = null;
  runStatus: string | null = null;

  preview: LevelingMatriculationPreviewResponse | null = null;
  selectedFaculty = '';
  generateConfirmOpen = false;

  studentsModalOpen = false;
  studentsModalTitle = '';
  studentsModalRows: Array<{
    studentId: string;
    studentCode?: string | null;
    studentName: string;
  }> = [];

  get matriculableFaculties() {
    return (this.preview?.faculties ?? []).filter(
      (f) => f.ready && Math.max(0, Number(f.pendingDemands ?? 0)) > 0
    );
  }

  get noMatriculableFacultiesMessage() {
    const faculties = this.preview?.faculties ?? [];
    const hasReady = faculties.some((f) => f.ready);
    if (hasReady) {
      return 'No hay alumnos pendientes por matricular en este periodo.';
    }
    return 'No hay facultades listas. Debes completar horarios, docentes y aula en presencial.';
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

  get previewSectionCourseRows() {
    const out: Array<{
      sectionCourseId: string;
      sectionCode?: string | null;
      sectionName: string;
      sectionTeacherName?: string | null;
      courseName: string;
      teacherName?: string | null;
      modality?: string | null;
      initialCapacity: number;
      maxExtraCapacity: number;
      classroomCode?: string | null;
      classroomPavilionCode?: string | null;
      classroomLevelName?: string | null;
      classroomCapacity?: number | null;
      capacitySource?: 'VIRTUAL' | 'AULA' | 'SIN_AULA' | 'AULA_INACTIVA' | null;
      assignedCount: number;
      students: Array<{
        studentId: string;
        studentCode?: string | null;
        studentName: string;
      }>;
    }> = [];

    for (const section of this.preview?.sections ?? []) {
      for (const course of section.sectionCourses ?? []) {
        out.push({
          sectionCourseId: String(course.sectionCourseId),
          sectionCode: section.sectionCode ?? course.sectionCode ?? null,
          sectionName: section.sectionName || course.sectionName || '-',
          sectionTeacherName: section.teacherName ?? null,
          courseName: course.courseName,
          teacherName: course.teacherName ?? null,
          modality: section.modality ?? null,
          initialCapacity: Number(course.initialCapacity ?? section.initialCapacity ?? 0),
          maxExtraCapacity: Number(course.maxExtraCapacity ?? section.maxExtraCapacity ?? 0),
          classroomCode: course.classroomCode ?? null,
          classroomPavilionCode: course.classroomPavilionCode ?? null,
          classroomLevelName: course.classroomLevelName ?? null,
          classroomCapacity: course.classroomCapacity ?? null,
          capacitySource: course.capacitySource ?? null,
          assignedCount: Number(course.assignedCount ?? 0),
          students: (course.students ?? []).slice(),
        });
      }
    }

    out.sort((a, b) => {
      const sectionCmp = String(a.sectionCode ?? a.sectionName)
        .localeCompare(String(b.sectionCode ?? b.sectionName));
      if (sectionCmp !== 0) return sectionCmp;
      return String(a.courseName).localeCompare(String(b.courseName));
    });
    return out;
  }

  get previewAssignedSectionCourseRows() {
    return this.previewSectionCourseRows.filter((row) => row.assignedCount > 0);
  }

  get hiddenPreviewSectionCourseCount() {
    return Math.max(0, this.previewSectionCourseRows.length - this.previewAssignedSectionCourseRows.length);
  }



  async ngOnInit() {
    await this.loadContext();
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

  trackPreviewSectionCourse(_: number, row: { sectionCourseId: string }) {
    return row.sectionCourseId;
  }

  studentCode(code: string | null | undefined) {
    const value = String(code ?? '').trim();
    return value || 'SIN CODIGO';
  }

  capacityLabel(
    modality: string | null | undefined,
    initialCapacity: number,
    maxExtraCapacity: number,
    classroomCapacity: number | null | undefined,
    capacitySource: string | null | undefined,
    assignedCount: number
  ) {
    void initialCapacity;
    void maxExtraCapacity;
    const mod = String(modality ?? '').trim().toUpperCase();
    if (mod.includes('VIRTUAL')) {
      return 'Sin aforo (virtual)';
    }
    const source = String(capacitySource ?? '').trim().toUpperCase();
    const classroomCap = Math.max(0, Number(classroomCapacity ?? 0));
    if (classroomCap > 0) {
      const available = Math.max(0, classroomCap - Number(assignedCount ?? 0));
      return `${classroomCap} (disp. ${available})`;
    }
    if (source === 'AULA_INACTIVA') return 'Aula inactiva';
    return 'Sin aula';
  }

  classroomLabel(
    modality: string | null | undefined,
    classroomCode: string | null | undefined,
    classroomPavilionCode: string | null | undefined,
    classroomLevelName: string | null | undefined,
    classroomCapacity: number | null | undefined,
    capacitySource: string | null | undefined
  ) {
    const mod = String(modality ?? '').trim().toUpperCase();
    if (mod.includes('VIRTUAL')) return 'Virtual';
    if (String(classroomCode ?? '').trim()) {
      const chunks: string[] = [String(classroomCode ?? '').trim()];
      const pavilion = String(classroomPavilionCode ?? '').trim();
      const level = String(classroomLevelName ?? '').trim();
      if (pavilion) chunks.push(pavilion);
      if (level) chunks.push(level);
      const cap = Math.max(0, Number(classroomCapacity ?? 0));
      if (cap > 0) chunks.push(String(cap));
      return chunks.join(' | ');
    }
    const source = String(capacitySource ?? '').trim().toUpperCase();
    if (source === 'AULA_INACTIVA') return 'Aula inactiva';
    return 'Sin aula';
  }

  dayLabel(dayOfWeek: number) {
    const labels = ['', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
    return labels[Number(dayOfWeek) || 0] ?? String(dayOfWeek);
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
        `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate-preview`,
        { params: new HttpParams().set('strategy', 'INCREMENTAL') }
      )
    );

    const ready = this.matriculableFaculties;
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
    if (
      !this.matriculableFaculties.some((row) => row.facultyGroup === this.selectedFaculty)
    ) {
      this.error = 'La facultad seleccionada no tiene alumnos pendientes por matricular.';
      this.preview = null;
      this.selectedFaculty = '';
      this.cdr.detectChanges();
      return;
    }
    this.previewLoading = true;
    this.error = null;
    try {
      const params = new HttpParams()
        .set('facultyGroup', this.selectedFaculty)
        .set('strategy', 'INCREMENTAL');
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

    this.generating = true;
    this.error = null;
    try {
      const result = await firstValueFrom(
        this.http.post<LevelingMatriculationResult>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate`,
          { facultyGroup: this.selectedFaculty, strategy: 'INCREMENTAL' }
        )
      );
      this.runStatus = result.status;
      await this.previewMatriculation();
      this.workflowState.notifyWorkflowChanged();
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
