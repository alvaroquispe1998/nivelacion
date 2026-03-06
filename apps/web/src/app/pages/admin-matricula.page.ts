import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, skip, Subscription } from 'rxjs';
import type {
  LevelingMatriculationPreviewResponse,
  LevelingMatriculationResult,
  LevelingRunConflictItem,
} from '@uai/shared';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
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
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {{ success }}
    </div>

    <div *ngIf="loading" class="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Cargando contexto de matricula...
    </div>

    <div *ngIf="!loading && !runId" class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      No existe una corrida de nivelacion activa. Primero aplica estructura en Nivelacion.
    </div>

    <div *ngIf="runId && viewMode === 'default'" class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="text-sm text-slate-700">
        Estado del proceso de matricula:
        <b>{{ runStatusLabel(runStatus) }}</b>
      </div>
    </div>

    <div *ngIf="runId && viewMode === 'default'" class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <label class="text-xs text-slate-700">
          Facultad (solo listas para matricula)
          <select
            class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            [(ngModel)]="selectedFaculty"
            (ngModelChange)="onSelectedFacultyChange($event)"
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
          class="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          [disabled]="clearing || !selectedFaculty"
          (click)="clearMatriculation()"
        >
          {{ clearing ? 'Borrando...' : 'Eliminar matrícula actual' }}
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

    <div *ngIf="runId && viewMode !== 'default'" class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <label class="text-xs text-slate-700 block">
        Facultad
        <select
          class="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          [(ngModel)]="selectedFaculty"
          (ngModelChange)="onSelectedFacultyChange($event)"
          [ngModelOptions]="{ standalone: true }"
        >
          <option value="" disabled>Selecciona facultad</option>
          <option *ngFor="let fac of matriculableFaculties" [value]="fac.facultyGroup">
            {{ fac.facultyGroup }} ({{ fac.totalSectionCourses }} cursos-seccion)
          </option>
        </select>
      </label>
    </div>

    <div *ngIf="viewMode === 'default' && preview && preview.selectedFacultyGroup" class="mt-4 space-y-4">
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
                <td class="px-3 py-2">{{ capacityLabel(row.modality, row.initialCapacity, row.maxExtraCapacity, row.classroomCapacity, row.capacitySource, row.assignedCount, row.enforceVirtualCapacity) }}</td>
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

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Detalle por alumno ({{ previewStudentDetailRows.length }} asignaciones)</div>
        <div class="mt-1 text-xs text-slate-500">Verifica que cada alumno tenga sus cursos en la misma sección.</div>
        <div class="mt-3 max-h-[520px] overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left text-slate-700 sticky top-0">
              <tr>
                <th class="px-3 py-2">Carrera</th>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Seccion</th>
                <th class="px-3 py-2">Modalidad</th>
                <th class="px-3 py-2">Curso</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let row of previewStudentDetailRows; let i = index"
                class="border-t border-slate-100"
                [ngClass]="row.groupIndex % 2 === 0 ? 'bg-white' : 'bg-blue-100'"
              >
                <td class="px-3 py-1.5">{{ row.careerName || '-' }}</td>
                <td class="px-3 py-1.5" [class.font-semibold]="row.isNewStudent">{{ studentCode(row.studentCode) }} - {{ row.studentName }}</td>
                <td class="px-3 py-1.5 font-semibold">{{ row.sectionCode }}</td>
                <td class="px-3 py-1.5">
                  <span
                    class="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    [ngClass]="row.modality === 'VIRTUAL' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'"
                  >{{ row.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial' }}</span>
                </td>
                <td class="px-3 py-1.5">{{ row.courseName }}</td>
              </tr>
              <tr *ngIf="previewStudentDetailRows.length === 0" class="border-t border-slate-100">
                <td class="px-3 py-3 text-slate-500" colspan="5">Sin asignaciones simuladas.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div class="text-sm font-semibold text-amber-900">Alumnos en secciones presenciales distintas ({{ previewMultiSectionStudents.length }})</div>
        <div class="mt-2 max-h-60 overflow-auto rounded-xl border border-amber-200 bg-white">
          <table class="min-w-full text-xs">
            <thead class="bg-amber-50 text-left text-amber-800">
              <tr>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Carrera</th>
                <th class="px-3 py-2">Secciones presenciales</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of previewMultiSectionStudents" class="border-t border-amber-100">
                <td class="px-3 py-1.5">{{ studentCode(s.studentCode) }} - {{ s.studentName }}</td>
                <td class="px-3 py-1.5">{{ s.careerName || '-' }}</td>
                <td class="px-3 py-1.5 font-semibold">{{ s.sections }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      *ngIf="runId && selectedFaculty && viewMode === 'validation'"
      id="section-validation"
      class="rounded-2xl border border-emerald-200 bg-white p-4 mt-4"
    >
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold text-emerald-800">Validacion de matricula actual</div>
          <div class="mt-0.5 text-xs text-slate-500">Muestra lo que ya esta guardado en base de datos.</div>
        </div>
        <button
          class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          [disabled]="matriculatedReportLoading"
          (click)="loadMatriculatedReport()"
        >
          {{ matriculatedReportLoading ? 'Cargando...' : 'Cargar reporte' }}
        </button>
      </div>
      <div *ngIf="matriculatedReport" class="mt-3 max-h-[520px] overflow-auto rounded-xl border border-emerald-200">
        <table class="min-w-full text-xs">
          <thead class="bg-emerald-50 text-left text-emerald-800 sticky top-0">
            <tr>
              <th class="px-3 py-2">Carrera</th>
              <th class="px-3 py-2">Alumno</th>
              <th class="px-3 py-2">Seccion</th>
              <th class="px-3 py-2">Modalidad</th>
              <th class="px-3 py-2">Curso</th>
            </tr>
          </thead>
          <tbody>
            <tr
              *ngFor="let row of matriculatedReport"
              class="border-t border-emerald-100"
              [ngClass]="row.groupIndex % 2 === 0 ? 'bg-white' : 'bg-emerald-50'"
            >
              <td class="px-3 py-1.5">{{ row.careerName || '-' }}</td>
              <td class="px-3 py-1.5">{{ studentCode(row.studentCode) }} - {{ row.studentName }}</td>
              <td class="px-3 py-1.5 font-semibold">{{ row.sectionCode }}</td>
              <td class="px-3 py-1.5">
                <span
                  class="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  [ngClass]="row.modality === 'VIRTUAL' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'"
                >{{ row.modality === 'VIRTUAL' ? 'Virtual' : 'Presencial' }}</span>
              </td>
              <td class="px-3 py-1.5">{{ row.courseName }}</td>
            </tr>
            <tr *ngIf="matriculatedReport.length === 0" class="border-t">
              <td class="px-3 py-3 text-slate-500" colspan="5">No hay alumnos matriculados para esta facultad.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div *ngIf="matriculatedReport" class="mt-2 text-xs text-slate-500">Total: {{ matriculatedReport.length }} asignaciones</div>

      <div *ngIf="matriculatedReport" class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div class="text-xs font-semibold text-amber-900">Alumnos en secciones presenciales distintas ({{ matriculatedMultiSectionStudents.length }})</div>
        <div class="mt-2 max-h-60 overflow-auto rounded-lg border border-amber-200 bg-white">
          <table class="min-w-full text-xs">
            <thead class="bg-amber-50 text-left text-amber-800">
              <tr>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Carrera</th>
                <th class="px-3 py-2">Secciones presenciales</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of matriculatedMultiSectionStudents" class="border-t border-amber-100">
                <td class="px-3 py-1.5">{{ studentCode(s.studentCode) }} - {{ s.studentName }}</td>
                <td class="px-3 py-1.5">{{ s.careerName || '-' }}</td>
                <td class="px-3 py-1.5 font-semibold">{{ s.sections }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      *ngIf="runId && selectedFaculty && viewMode === 'reassignments'"
      id="section-reassignments"
      class="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-slate-800">Cambios de sección registrados</div>
          <div class="mt-0.5 text-xs text-slate-500">
            Historial de reubicaciones para la facultad seleccionada.
          </div>
        </div>
        <button
          class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          [disabled]="sectionReassignmentsLoading"
          (click)="loadSectionReassignments()"
        >
          {{ sectionReassignmentsLoading ? 'Cargando...' : 'Actualizar' }}
        </button>
      </div>

      <div *ngIf="sectionReassignments" class="mt-3 max-h-[420px] overflow-auto rounded-xl border border-slate-200">
        <table class="min-w-full text-xs">
          <thead class="bg-slate-50 text-left text-slate-700">
            <tr>
              <th class="px-3 py-2">Fecha</th>
              <th class="px-3 py-2">Alumno</th>
              <th class="px-3 py-2">De sección</th>
              <th class="px-3 py-2">A sección</th>
              <th class="px-3 py-2">Curso</th>
              <th class="px-3 py-2">Motivo</th>
              <th class="px-3 py-2">Responsable</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of sectionReassignments" class="border-t border-slate-100">
              <td class="px-3 py-1.5 text-slate-600">{{ row.changedAt | date: 'dd/MM HH:mm' }}</td>
              <td class="px-3 py-1.5">
                <div class="font-semibold">{{ studentCode(row.studentCode) }} - {{ row.studentName }}</div>
                <div class="text-[11px] text-slate-500">{{ row.careerName || '-' }}</div>
              </td>
              <td class="px-3 py-1.5">
                <div class="font-semibold">{{ row.fromSectionCode }}</div>
                <div class="text-[10px] font-semibold"
                  [ngClass]="row.fromModality === 'VIRTUAL' ? 'text-violet-700' : 'text-emerald-700'">
                  {{ row.fromModality === 'VIRTUAL' ? 'Virtual' : 'Presencial' }}
                </div>
              </td>
              <td class="px-3 py-1.5">
                <div class="font-semibold">{{ row.toSectionCode }}</div>
                <div class="text-[10px] font-semibold"
                  [ngClass]="row.toModality === 'VIRTUAL' ? 'text-violet-700' : 'text-emerald-700'">
                  {{ row.toModality === 'VIRTUAL' ? 'Virtual' : 'Presencial' }}
                </div>
              </td>
              <td class="px-3 py-1.5">
                {{ row.fromCourseName === row.toCourseName ? row.toCourseName : (row.fromCourseName + ' -> ' + row.toCourseName) }}
              </td>
              <td class="px-3 py-1.5">{{ row.reason || '-' }}</td>
              <td class="px-3 py-1.5">{{ row.changedByName || 'N/D' }}</td>
            </tr>
            <tr *ngIf="sectionReassignments.length === 0" class="border-t">
              <td class="px-3 py-3 text-slate-500" colspan="7">No se registran cambios de sección para esta facultad.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div *ngIf="sectionReassignments" class="mt-2 text-xs text-slate-500">
        Total mostrados: {{ sectionReassignments.length }} (máx. 200 recientes)
      </div>
    </div>

    <div
      *ngIf="confirmClearOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div class="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div class="flex items-start gap-3">
            <span
              class="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-700"
            >
              !
            </span>
            <div>
              <div class="text-base font-semibold text-slate-900">Eliminar matrícula</div>
              <div class="text-xs text-slate-500">Facultad: {{ selectedFaculty || '-' }}</div>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            [disabled]="clearing"
            (click)="closeConfirmClear()"
          >
            Cerrar
          </button>
        </div>

        <div class="px-5 py-4 text-sm text-slate-700">
          Se eliminará la matrícula actual de la facultad seleccionada. Esta acción no crea oferta nueva y permite regenerar
          la matrícula desde cero.
        </div>

        <div class="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            [disabled]="clearing"
            (click)="closeConfirmClear()"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="clearing"
            (click)="clearMatriculation({ silent: true })"
          >
            {{ clearing ? 'Eliminando...' : 'Eliminar matrícula' }}
          </button>
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
          <ng-container *ngIf="showOverwriteWarning; else normalMsg">
            Se eliminará la matrícula existente para <b>{{ selectedFaculty }}</b> y se volverá a generar solo con las
            asignaciones pendientes. No se creará oferta nueva.
          </ng-container>
          <ng-template #normalMsg>
            Se ejecutará la matrícula automática para <b>{{ selectedFaculty }}</b>. Esta acción agregará solo
            asignaciones pendientes, sin borrar matrículas previas ni crear oferta nueva.
          </ng-template>
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
            (click)="confirmGenerateMatriculationV2()"
          >
            {{ generating ? 'Generando...' : 'Confirmar y generar' }}
          </button>
        </div>
      </div>
    </div>

    <div *ngIf="studentsModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div class="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-xl">
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
                <th class="px-4 py-3">Sede</th>
                <th class="px-4 py-3">Carrera</th>
                <th class="px-4 py-3">Modalidad</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let student of studentsModalRows; trackBy: trackStudent" class="border-t border-slate-100">
                <td class="px-4 py-3 font-semibold">{{ studentCode(student.studentCode) }}</td>
                <td class="px-4 py-3">{{ student.studentName }}</td>
                <td class="px-4 py-3">{{ student.campusName || '-' }}</td>
                <td class="px-4 py-3">{{ student.careerName || '-' }}</td>
                <td class="px-4 py-3">{{ student.demandModality || '-' }}</td>
              </tr>
              <tr *ngIf="studentsModalRows.length === 0" class="border-t border-slate-100">
                <td class="px-4 py-4 text-sm text-slate-500" colspan="5">Sin alumnos en este curso-seccion.</td>
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
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private readonly route = inject(ActivatedRoute);
  private periodSub?: Subscription;

  loading = false;
  previewLoading = false;
  generating = false;
  clearing = false;
  confirmClearOpen = false;
  showOverwriteWarning = false;
  error: string | null = null;
  success: string | null = null;

  runId: string | null = null;
  runStatus: string | null = null;
  viewMode: 'default' | 'reassignments' | 'validation' = 'default';

  preview: LevelingMatriculationPreviewResponse | null = null;
  selectedFaculty = '';
  generateConfirmOpen = false;

  studentsModalOpen = false;
  studentsModalTitle = '';
  studentsModalRows: Array<{
    studentId: string;
    studentCode?: string | null;
    studentName: string;
    careerName?: string | null;
    demandModality?: string | null;
    campusName?: string | null;
  }> = [];

  matriculatedReport: Array<{
    studentId: string;
    studentCode: string | null;
    studentName: string;
    careerName: string | null;
    sectionCode: string;
    modality: string;
    courseName: string;
    groupIndex: number;
  }> | null = null;
  matriculatedReportLoading = false;
  sectionReassignments: Array<{
    id: string;
    changedAt: string | Date | null;
    studentId: string;
    studentCode: string | null;
    studentName: string;
    careerName: string | null;
    fromSectionCode: string;
    fromSectionName: string;
    fromModality: string;
    fromCourseName: string;
    toSectionCode: string;
    toSectionName: string;
    toModality: string;
    toCourseName: string;
    reason: string | null;
    changedByName: string | null;
  }> | null = null;
  sectionReassignmentsLoading = false;
  private pendingAnchor: string | null = null;

  get matriculableFaculties() {
    // Mostrar todas las facultades conocidas, aunque no haya pendientes, para permitir limpiar matrícula existente.
    return (this.preview?.faculties ?? []).slice();
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
      !this.generating &&
      (this.preview?.canMatriculateSelectedFaculty ?? true)
    );
  }

  get hasAssignedMatricula() {
    const summary = this.preview?.summaryBySectionCourse ?? [];
    return summary.some((row) => Number(row.assignedCount ?? 0) > 0);
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
      enforceVirtualCapacity?: boolean | null;
      students: Array<{
        studentId: string;
        studentCode?: string | null;
        studentName: string;
        careerName?: string | null;
        demandModality?: string | null;
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
          enforceVirtualCapacity:
            course.enforceVirtualCapacity ??
            section.enforceVirtualCapacity ??
            null,
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

  get previewStudentDetailRows(): Array<{
    studentId: string;
    studentCode: string | null;
    studentName: string;
    careerName: string | null;
    sectionCode: string;
    modality: string;
    courseName: string;
    isNewStudent: boolean;
    groupIndex: number;
  }> {
    const rows: Array<{
      studentId: string;
      studentCode: string | null;
      studentName: string;
      careerName: string | null;
      sectionCode: string;
      modality: string;
      courseName: string;
      isNewStudent: boolean;
      groupIndex: number;
    }> = [];

    for (const section of this.preview?.sections ?? []) {
      for (const course of section.sectionCourses ?? []) {
        for (const student of course.students ?? []) {
          rows.push({
            studentId: student.studentId,
            studentCode: student.studentCode ?? null,
            studentName: student.studentName ?? '',
            careerName: student.careerName ?? null,
            sectionCode: section.sectionCode ?? section.sectionName ?? course.sectionCode ?? course.sectionName ?? '-',
            modality: String(section.modality ?? '').toUpperCase().includes('VIRTUAL') ? 'VIRTUAL' : 'PRESENCIAL',
            courseName: course.courseName ?? '',
            isNewStudent: false,
            groupIndex: 0,
          });
        }
      }
    }

    // Sort: career → student name → section → modality → course
    rows.sort((a, b) => {
      const careerCmp = (a.careerName ?? '').localeCompare(b.careerName ?? '');
      if (careerCmp !== 0) return careerCmp;
      const nameCmp = (a.studentName ?? '').localeCompare(b.studentName ?? '');
      if (nameCmp !== 0) return nameCmp;
      const codeCmp = (a.studentCode ?? '').localeCompare(b.studentCode ?? '');
      if (codeCmp !== 0) return codeCmp;
      const sectionCmp = a.sectionCode.localeCompare(b.sectionCode);
      if (sectionCmp !== 0) return sectionCmp;
      const modCmp = a.modality.localeCompare(b.modality);
      if (modCmp !== 0) return modCmp;
      return a.courseName.localeCompare(b.courseName);
    });

    // Mark first row of each student + assign alternating group index
    let prevStudentId = '';
    let groupIndex = 0;
    for (const row of rows) {
      if (row.studentId !== prevStudentId) {
        row.isNewStudent = true;
        if (prevStudentId !== '') groupIndex++;
        prevStudentId = row.studentId;
      }
      row.groupIndex = groupIndex;
    }

    return rows;
  }

  private extractMultiSectionStudents(
    rows: Array<{ studentId: string; studentCode: string | null; studentName: string; careerName: string | null; sectionCode: string; modality: string }>
  ): Array<{ studentId: string; studentCode: string | null; studentName: string; careerName: string | null; sections: string }> {
    const byStudent = new Map<string, {
      studentCode: string | null; studentName: string; careerName: string | null; presencialSections: Set<string>;
    }>();
    for (const row of rows) {
      if (row.modality === 'VIRTUAL') continue;
      if (!byStudent.has(row.studentId)) {
        byStudent.set(row.studentId, {
          studentCode: row.studentCode, studentName: row.studentName,
          careerName: row.careerName, presencialSections: new Set(),
        });
      }
      byStudent.get(row.studentId)!.presencialSections.add(row.sectionCode);
    }
    const result: Array<{ studentId: string; studentCode: string | null; studentName: string; careerName: string | null; sections: string }> = [];
    for (const [studentId, info] of byStudent.entries()) {
      if (info.presencialSections.size > 1) {
        result.push({
          studentId,
          studentCode: info.studentCode,
          studentName: info.studentName,
          careerName: info.careerName,
          sections: [...info.presencialSections].sort().join(', '),
        });
      }
    }
    result.sort((a, b) => (a.careerName ?? '').localeCompare(b.careerName ?? '') || a.studentName.localeCompare(b.studentName));
    return result;
  }

  get previewMultiSectionStudents() {
    return this.extractMultiSectionStudents(this.previewStudentDetailRows);
  }

  get matriculatedMultiSectionStudents() {
    return this.extractMultiSectionStudents(this.matriculatedReport ?? []);
  }


  async ngOnInit() {
    this.periodSub = this.adminPeriodContext.changes$
      .pipe(skip(1))
      .subscribe(() => {
        void this.handlePeriodChanged();
      });
    this.route.queryParamMap.subscribe((params) => {
      const view = String(params.get('view') ?? '').trim().toLowerCase();
      if (view === 'reassignments' || view === 'validation') {
        this.viewMode = view;
      } else {
        this.viewMode = 'default';
      }
      if (view === 'reassignments') {
        this.pendingAnchor = 'section-reassignments';
      } else if (view === 'validation') {
        this.pendingAnchor = 'section-validation';
      } else {
        this.pendingAnchor = null;
      }
      if (this.pendingAnchor) {
        setTimeout(() => this.scrollToAnchor(this.pendingAnchor!), 200);
      }
      void this.autoloadByView();
    });
    await this.loadContext();
  }

  ngOnDestroy() {
    this.periodSub?.unsubscribe();
  }

  private async handlePeriodChanged() {
    this.resetUiStateForPeriodChange();
    await this.loadContext();
    this.workflowState.notifyWorkflowChanged({ reason: 'period-change' });
  }

  private resetUiStateForPeriodChange() {
    this.error = null;
    this.success = null;
    this.preview = null;
    this.selectedFaculty = '';
    this.generateConfirmOpen = false;
    this.matriculatedReport = null;
    this.sectionReassignments = null;
    this.closeStudentsModal();
  }

  private scrollToAnchor(anchorId: string) {
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private async autoloadByView() {
    if (!this.runId || !this.selectedFaculty) return;
    if (this.viewMode === 'reassignments') {
      await this.loadSectionReassignments();
    } else if (this.viewMode === 'validation') {
      await this.loadMatriculatedReport();
    }
  }

  onSelectedFacultyChange(value: string) {
    this.selectedFaculty = String(value ?? '').trim();
    this.success = null;
    this.error = null;
    this.matriculatedReport = null;
    this.sectionReassignments = null;
    void this.autoloadByView();
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
    assignedCount: number,
    enforceVirtualCapacity?: boolean | null
  ) {
    void initialCapacity;
    void maxExtraCapacity;
    const mod = String(modality ?? '').trim().toUpperCase();
    if (mod.includes('VIRTUAL')) {
      if (enforceVirtualCapacity) {
        const target =
          Math.max(0, Number(initialCapacity ?? 0)) + Math.max(0, Number(maxExtraCapacity ?? 0));
        const available = Math.max(0, target - Number(assignedCount ?? 0));
        return `${target} (disp. ${available})`;
      }
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
    this.success = null;
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
      await this.autoloadByView();
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
        { params: new HttpParams().set('strategy', 'FULL_REBUILD') }
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
    this.success = null;
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
        .set('strategy', 'FULL_REBUILD');
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
    this.success = null;
    try {
      const result = await firstValueFrom(
        this.http.post<LevelingMatriculationResult>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate`,
          { facultyGroup: this.selectedFaculty, strategy: 'FULL_REBUILD' }
        )
      );
      this.runStatus = result.status;
      await this.previewMatriculation();
      const assigned = Math.max(0, Number(result.assignedCount ?? 0));
      const unassigned = Array.isArray(result.unassigned) ? result.unassigned.length : 0;
      const statusLabel = this.runStatusLabel(result.status);
      this.success = `Matricula generada para ${this.selectedFaculty}. Asignados: ${assigned}. No asignados: ${unassigned}. Estado: ${statusLabel}.`;
      this.workflowState.notifyWorkflowChanged({ reason: 'matricula-generated' });
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo generar la matricula';
    } finally {
      this.generating = false;
      this.cdr.detectChanges();
    }
  }

  openGenerateConfirm() {
    if (!this.canGenerate || !this.selectedFaculty) return;
    this.showOverwriteWarning = this.hasAssignedMatricula;
    this.generateConfirmOpen = true;
  }

  closeGenerateConfirm() {
    if (this.generating) return;
    this.generateConfirmOpen = false;
  }

  async confirmGenerateMatriculation() {
    if (!this.generateConfirmOpen) return;
    this.generateConfirmOpen = false;
    // FULL_REBUILD limpia y regenera en una sola transacción
    await this.generateMatriculation();
  }

  async confirmGenerateMatriculationV2() {
    if (!this.generateConfirmOpen) return;
    this.generateConfirmOpen = false;
    // FULL_REBUILD limpia y regenera en una sola transacción atómica,
    // garantizando que el resultado sea idéntico a la previsualización.
    await this.generateMatriculation();
  }

  async loadMatriculatedReport() {
    if (!this.runId || !this.selectedFaculty) return;
    this.matriculatedReportLoading = true;
    try {
      const resp = await firstValueFrom(
        this.http.get<{
          totalRows: number; rows: Array<{
            studentId: string; studentCode: string | null; studentName: string;
            careerName: string | null; sectionCode: string; modality: string; courseName: string;
          }>
        }>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculated-report`,
          { params: new HttpParams().set('facultyGroup', this.selectedFaculty) }
        )
      );
      const rows = (resp?.rows ?? []).map((r) => ({
        ...r,
        groupIndex: 0,
      }));
      let prevStudentId = '';
      let groupIndex = 0;
      for (const row of rows) {
        if (row.studentId !== prevStudentId) {
          if (prevStudentId !== '') groupIndex++;
          prevStudentId = row.studentId;
        }
        row.groupIndex = groupIndex;
      }
      this.matriculatedReport = rows;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar el reporte';
    } finally {
      this.matriculatedReportLoading = false;
      this.cdr.detectChanges();
    }
  }

  async loadSectionReassignments() {
    if (!this.runId || !this.selectedFaculty) return;
    this.sectionReassignmentsLoading = true;
    try {
      const resp = await firstValueFrom(
        this.http.get<{
          rows: Array<{
            id: string;
            changedAt: string;
            studentId: string;
            studentCode: string | null;
            studentName: string;
            careerName: string | null;
            fromSectionCode: string;
            fromSectionName: string;
            fromModality: string;
            fromCourseName: string;
            toSectionCode: string;
            toSectionName: string;
            toModality: string;
            toCourseName: string;
            reason: string | null;
            changedByName: string | null;
          }>;
        }>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/section-course-reassignments`,
          {
            params: new HttpParams()
              .set('facultyGroup', this.selectedFaculty)
              .set('limit', '200'),
          }
        )
      );
      this.sectionReassignments = (resp?.rows ?? []).map((row) => ({
        id: row.id,
        changedAt: row.changedAt,
        studentId: row.studentId,
        studentCode: row.studentCode,
        studentName: row.studentName,
        careerName: row.careerName,
        fromSectionCode: row.fromSectionCode,
        fromSectionName: row.fromSectionName,
        fromModality: row.fromModality,
        fromCourseName: row.fromCourseName,
        toSectionCode: row.toSectionCode,
        toSectionName: row.toSectionName,
        toModality: row.toModality,
        toCourseName: row.toCourseName,
        reason: row.reason,
        changedByName: row.changedByName,
      }));
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar los cambios de seccion';
    } finally {
      this.sectionReassignmentsLoading = false;
      this.cdr.detectChanges();
    }
  }

  async clearMatriculation(opts: { silent?: boolean } = {}) {
    if (!this.selectedFaculty || this.clearing) return;
    if (!opts.silent) {
      this.confirmClearOpen = true;
      return;
    }
    this.error = null;
    this.success = null;
    this.clearing = true;
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; deleted?: number }>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId ?? '')}/matriculate/clear`,
          { facultyGroup: this.selectedFaculty }
        )
      );
      const deleted = Number(resp?.deleted ?? 0);
      this.success =
        deleted > 0
          ? `Matrícula eliminada (${deleted} registros) para la facultad seleccionada.`
          : 'No se encontraron matrículas para eliminar en esta facultad.';
      await this.loadPreviewBase();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar la matrícula';
    } finally {
      this.clearing = false;
      this.confirmClearOpen = false;
      this.cdr.detectChanges();
    }
  }

  closeConfirmClear() {
    if (this.clearing) return;
    this.confirmClearOpen = false;
  }

  openStudentsModal(
    sectionLabel: string,
    courseName: string,
    students: Array<{
      studentId: string;
      studentCode?: string | null;
      studentName: string;
      careerName?: string | null;
      demandModality?: string | null;
      campusName?: string | null;
    }>
  ) {
    this.studentsModalOpen = true;
    this.studentsModalTitle = `${sectionLabel} - ${courseName}`;
    this.studentsModalRows = students
      .slice()
      .sort((a, b) => {
        const campusCmp = this.valueKey(a.campusName).localeCompare(this.valueKey(b.campusName));
        if (campusCmp !== 0) return campusCmp;
        const careerCmp = this.valueKey(a.careerName).localeCompare(this.valueKey(b.careerName));
        if (careerCmp !== 0) return careerCmp;
        const nameCmp = this.valueKey(a.studentName).localeCompare(this.valueKey(b.studentName));
        if (nameCmp !== 0) return nameCmp;
        return this.valueKey(a.studentCode).localeCompare(this.valueKey(b.studentCode));
      });
  }

  closeStudentsModal() {
    this.studentsModalOpen = false;
    this.studentsModalTitle = '';
    this.studentsModalRows = [];
  }

  private valueKey(value: string | null | undefined) {
    return String(value ?? '').trim().toUpperCase();
  }

}
