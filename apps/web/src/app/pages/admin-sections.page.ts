import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  AdminCourseScopeProgress,
  AdminClassroom,
  AdminFacultyFilterOption,
  AdminReassignmentOption,
  AdminReassignmentResult,
  AdminSection,
  AdminTeacher,
} from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import { WorkflowStateService } from '../core/workflow/workflow-state.service';

const COURSE_CONTEXT_STORAGE_KEY = 'admin.sections.selectedCourseName';
const FACULTY_FILTER_STORAGE_KEY = 'admin.sections.filter.faculty';
const CAMPUS_FILTER_STORAGE_KEY = 'admin.sections.filter.campus';
const COURSE_FILTER_STORAGE_KEY = 'admin.sections.filter.course';

interface SectionStudentRow {
  id: string;
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  careerName?: string | null;
  sectionCourseId?: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">
          {{ viewMode === 'students' ? 'Alumnos por Sección' : 'Horarios y Docentes' }}
        </div>
        <div class="text-sm text-slate-600">
          {{ viewMode === 'students' ? 'Listado de alumnos por sección' : 'Gestión de horarios y asignación de docentes' }}
        </div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="reloadAll()"
      >
        Refrescar
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="text-sm font-semibold">Ver detalle por seccion ({{ sections.length }})</div>

      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        <label class="text-xs text-slate-700">
          Facultad *
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="facultyFilter"
            (ngModelChange)="onFacultyChange()"
          >
            <option value="">Seleccionar facultad</option>
            <option *ngFor="let f of faculties; trackBy: trackFaculty" [value]="f.facultyGroup">
              {{ facultyOptionLabel(f) }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Sede *
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
            [(ngModel)]="campusFilter"
            (ngModelChange)="onCampusChange()"
            [disabled]="!facultyFilter"
          >
            <option value="">Seleccionar sede</option>
            <option *ngFor="let campus of campuses; trackBy: trackText" [value]="campus">
              {{ campus }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Curso *
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
            [(ngModel)]="courseFilter"
            (ngModelChange)="onCourseChange()"
            [disabled]="!campusFilter"
          >
            <option value="">Seleccionar curso</option>
            <option *ngFor="let c of courses; trackBy: trackText" [value]="c">
              {{ c }}
            </option>
          </select>
        </label>
      </div>

      <div
        *ngIf="!hasMandatoryFilters"
        class="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
      >
        Selecciona Facultad, Sede y Curso para mostrar alumnos por seccion-curso.
      </div>

      <div *ngIf="hasMandatoryFilters && viewMode === 'schedule'" class="mt-3 grid gap-2 sm:grid-cols-4">
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="text-[11px] uppercase tracking-wide text-slate-500">Alumnos matriculados</div>
          <div class="mt-1 text-lg font-semibold text-slate-900">
            {{ courseProgress?.matriculados ?? 0 }}
          </div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="text-[11px] uppercase tracking-wide text-slate-500">Alumnos por matricular</div>
          <div class="mt-1 text-lg font-semibold text-slate-900">
            {{ courseProgress?.porMatricular ?? 0 }}
          </div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="text-[11px] uppercase tracking-wide text-slate-500">Capacidad planificada</div>
          <div class="mt-1 text-lg font-semibold text-slate-900">
            {{ courseProgress?.capacidadPlanificada ?? 0 }}
          </div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="text-[11px] uppercase tracking-wide text-slate-500">Brecha</div>
          <div class="mt-1 text-lg font-semibold text-slate-900">
            {{ courseProgress?.brecha ?? 0 }}
          </div>
        </div>
      </div>
      <div
        *ngIf="hasMandatoryFilters && viewMode === 'schedule' && courseProgress"
        class="mt-2 rounded-xl border px-3 py-2 text-xs"
        [ngClass]="courseProgress.capacidadSuficiente ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'"
      >
        <span *ngIf="courseProgress.capacidadSuficiente">Capacidad suficiente.</span>
        <span *ngIf="!courseProgress.capacidadSuficiente">
          Faltan {{ courseProgress.brecha }} cupos por planificar.
        </span>
      </div>

      <div class="mt-3 overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Codigo</th>
              <th class="px-4 py-3">Modalidad</th>
              <th class="px-4 py-3">Aula</th>
              <th class="px-4 py-3" *ngIf="viewMode === 'schedule'">Aforo aula</th>
              <th class="px-4 py-3" *ngIf="viewMode === 'students'">Aforo / Matriculados</th>
              <th class="px-4 py-3">Horario</th>
              <th class="px-4 py-3">Docente</th>
              <th class="px-4 py-3" *ngIf="viewMode === 'schedule'">Estado</th>
              <th class="px-4 py-3" *ngIf="viewMode === 'schedule'">Matriculados</th>
              <th class="px-4 py-3" *ngIf="viewMode === 'schedule'">Disponibles</th>
              <th class="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of sections; trackBy: trackSection" class="border-t border-slate-100">
              <td class="px-4 py-3 font-semibold">{{ s.code || s.name }}</td>
              <td class="px-4 py-3">{{ s.modality || '-' }}</td>
              <td class="px-4 py-3 text-xs">
                <span *ngIf="isVirtualSection(s)">Virtual</span>
                <span *ngIf="!isVirtualSection(s)">
                  {{ classroomDisplayLabel(s) }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs" *ngIf="viewMode === 'schedule'">
                {{ classroomCapacityLabel(s) }}
              </td>
              <td class="px-4 py-3 text-xs font-medium" *ngIf="viewMode === 'students'">
                {{ aforoMatriculadosLabel(s) }}
              </td>
              <td class="px-4 py-3 text-xs">
                <span
                  *ngIf="s.hasSchedule"
                  class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                >
                  ✓
                </span>
                <span
                  *ngIf="!s.hasSchedule"
                  class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500"
                >
                  -
                </span>
              </td>
              <td class="px-4 py-3 text-xs">
                <div>{{ s.teacherName || '-' }}</div>
                <div class="text-slate-500" *ngIf="s.teacherDni">{{ s.teacherDni }}</div>
              </td>
              <td class="px-4 py-3 text-xs" *ngIf="viewMode === 'schedule'">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  [ngClass]="planningStatusClass(s)"
                >
                  {{ planningStatusLabel(s) }}
                </span>
              </td>
              <td class="px-4 py-3 text-xs font-medium" *ngIf="viewMode === 'schedule'">
                {{ studentCountLabel(s) }}
              </td>
              <td class="px-4 py-3 text-xs font-medium" *ngIf="viewMode === 'schedule'">
                {{ availableSeatsLabel(s) }}
              </td>
              <td class="px-4 py-3 text-xs">
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    (click)="openStudentsModal(s)"
                    [disabled]="loadingStudentsSectionId === s.id || !courseFilter"
                    *ngIf="viewMode === 'students'"
                  >
                    {{ loadingStudentsSectionId === s.id ? 'Cargando...' : 'Ver alumnos' }}
                  </button>
                  <a
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    [routerLink]="['/admin/sections', s.id, 'schedule']"
                    [queryParams]="courseFilter ? { courseName: courseFilter } : undefined"
                    *ngIf="viewMode === 'students'"
                  >
                    Ver horario
                  </a>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    (click)="openClassroomModal(s)"
                    [disabled]="loadingClassrooms || !courseFilter || isVirtualSection(s)"
                    *ngIf="viewMode === 'schedule'"
                  >
                    Aula
                  </button>
                  <a
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    [routerLink]="['/admin/sections', s.id, 'schedule']"
                    [queryParams]="courseFilter ? { courseName: courseFilter } : undefined"
                    *ngIf="viewMode === 'schedule'"
                  >
                    Horario
                  </a>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="openTeacherModal(s)"
                    *ngIf="viewMode === 'schedule'"
                  >
                    Docente
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="sections.length === 0 && hasMandatoryFilters" class="border-t border-slate-100">
              <td class="px-4 py-5 text-slate-500" [attr.colspan]="viewMode === 'schedule' ? 10 : 7">
                Sin secciones para el filtro seleccionado.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      *ngIf="studentsModalSection"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeStudentsModal()"
    >
      <div
        class="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">
              Alumnos de seccion {{ studentsModalSection.code || studentsModalSection.name }}
            </div>
            <div class="text-xs text-slate-600">
              {{ studentsModalSection.facultyGroup }} | {{ studentsModalSection.campusName }} |
              {{ studentsModalSection.modality }} | {{ modalCourseName || '-' }} | {{ studentsModalRows.length }} alumnos
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="relative">
              <button
                type="button"
                class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                [disabled]="exportingStudentsModal"
                (click)="toggleStudentsExportMenu()"
              >
                {{ exportingStudentsModal ? 'Exportando...' : 'Exportar' }}
              </button>
              <div
                *ngIf="studentsExportMenuOpen"
                class="absolute right-0 z-10 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
              >
                <button
                  type="button"
                  class="block w-full rounded-md px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  [disabled]="exportingStudentsModal"
                  (click)="exportStudentsModal('excel')"
                >
                  Exportar Excel
                </button>
                <button
                  type="button"
                  class="block w-full rounded-md px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  [disabled]="exportingStudentsModal"
                  (click)="exportStudentsModal('pdf')"
                >
                  Exportar PDF
                </button>
              </div>
            </div>
            <a
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              [routerLink]="['/admin/sections', studentsModalSection.id, 'attendance']"
              [queryParams]="modalCourseName ? { courseName: modalCourseName } : undefined"
              (click)="closeStudentsModal()"
            >
              Ver asistencia
            </a>
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              (click)="closeStudentsModal()"
            >
              Cerrar
            </button>
          </div>
        </div>

        <div class="max-h-[70vh] overflow-auto p-5">
          <table class="min-w-full table-fixed text-xs">
            <thead class="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-2 w-28">Codigo alumno</th>
                <th class="px-3 py-2 w-24">DNI</th>
                <th class="px-3 py-2 w-[38%]">Alumno</th>
                <th class="px-3 py-2 w-[42%]">Carrera</th>
                <th class="px-3 py-2 w-24">Accion</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let st of studentsModalRows; trackBy: trackStudentRow" class="border-t border-slate-100">
                <td class="px-3 py-2 text-xs">{{ studentCode(st.codigoAlumno) }}</td>
                <td class="px-3 py-2 text-xs">{{ st.dni || '-' }}</td>
                <td class="px-3 py-2 text-xs leading-tight whitespace-normal break-words">{{ st.fullName }}</td>
                <td class="px-3 py-2 text-[11px] leading-tight whitespace-normal break-words">{{ st.careerName || 'SIN CARRERA' }}</td>
                <td class="px-3 py-2 text-xs">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    [disabled]="!st.sectionCourseId"
                    (click)="openReassignModal(st)"
                  >
                    Reubicar curso
                  </button>
                </td>
              </tr>
              <tr *ngIf="studentsModalRows.length === 0">
                <td class="px-3 py-4 text-slate-500" colspan="5">Sin alumnos en la seccion-curso</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      *ngIf="teacherModalSection"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeTeacherModal()"
    >
      <div
        class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">
              Asignar docente
            </div>
            <div class="text-xs text-slate-600">
              Seccion {{ teacherModalSection.code || teacherModalSection.name }} |
              Curso {{ courseFilter || '-' }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            (click)="closeTeacherModal()"
          >
            Cerrar
          </button>
        </div>
        <div class="space-y-3 p-5">
          <div class="text-xs text-slate-600" *ngIf="teacherModalSection.teacherName">
            Actual: <b>{{ teacherModalSection.teacherName }}</b>
          </div>
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            [(ngModel)]="teacherModalTeacherId"
          >
            <option *ngFor="let t of teachers; trackBy: trackTeacher" [value]="t.id">
              {{ t.fullName }} ({{ t.dni }})
            </option>
          </select>
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="!teacherModalTeacherId || loadingAssignId === teacherModalSection.id"
            (click)="saveTeacherAssignment()"
          >
            {{ loadingAssignId === teacherModalSection.id ? 'Guardando...' : 'Guardar docente' }}
          </button>
        </div>
      </div>
    </div>
    <div
      *ngIf="classroomModalSection"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeClassroomModal()"
    >
      <div
        class="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">
              Asignar aula
            </div>
            <div class="text-xs text-slate-600 mt-1">
              {{ classroomModalSection.code || classroomModalSection.name }} | {{ courseFilter || '-' }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            (click)="closeClassroomModal()"
          >
            Cerrar
          </button>
        </div>

        <div class="space-y-3 p-5">
          <div class="text-xs text-slate-600">
            Aula actual:
            <b>{{ classroomDisplayLabel(classroomModalSection) }}</b>
          </div>

          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            [(ngModel)]="classroomModalClassroomId"
            [disabled]="loadingClassroomAssign || loadingClassrooms"
          >
            <option value="">Sin aula</option>
            <option *ngFor="let room of classroomOptions; trackBy: trackClassroom" [value]="room.id">
              {{ classroomOptionLabel(room) }}
            </option>
          </select>

          <div class="text-xs text-slate-500" *ngIf="classroomOptions.length === 0">
            No hay aulas activas disponibles para la sede seleccionada.
          </div>

          <button
            type="button"
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="loadingClassroomAssign || loadingClassrooms"
            (click)="saveClassroomAssignment()"
          >
            {{ loadingClassroomAssign ? 'Guardando...' : 'Guardar aula' }}
          </button>
        </div>
      </div>
    </div>

    <div
      *ngIf="reassignModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeReassignModal()"
    >
      <div
        class="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">Reubicar curso</div>
            <div class="text-xs text-slate-600 mt-1">
              {{ reassignStudentRow?.fullName || '-' }} | {{ modalCourseName || '-' }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            (click)="closeReassignModal()"
          >
            Cerrar
          </button>
        </div>

        <div class="space-y-3 p-5">
          <label class="block text-xs text-slate-700">
            Seccion-curso destino
            <select
              class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              [(ngModel)]="selectedReassignTargetSectionCourseId"
              [disabled]="reassigning"
            >
              <option value="">Seleccionar destino</option>
              <option
                *ngFor="let option of reassignOptions; trackBy: trackReassignOption"
                [value]="option.sectionCourseId"
                [disabled]="option.createsConflict"
              >
                {{ reassignOptionLabel(option) }}
              </option>
            </select>
          </label>

          <label class="block text-xs text-slate-700">
            Motivo (opcional)
            <textarea
              rows="2"
              class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              [(ngModel)]="reassignReason"
              [disabled]="reassigning"
              placeholder="Ejemplo: Solicitud por compatibilidad de horario"
            ></textarea>
          </label>

          <div
            *ngIf="reassignWarning"
            class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
          >
            {{ reassignWarning }}
          </div>
          <div *ngIf="reassignError" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {{ reassignError }}
          </div>

          <div class="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              [disabled]="reassigning"
              (click)="closeReassignModal()"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              [disabled]="reassigning || !selectedReassignTargetSectionCourseId"
              (click)="submitReassign(false)"
            >
              {{ reassigning ? 'Guardando...' : 'Guardar cambio' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-amber-500 bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              *ngIf="reassignNeedsOverCapacityConfirm"
              [disabled]="reassigning"
              (click)="submitReassign(true)"
            >
              Confirmar sobreaforo
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminSectionsPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly workflowState = inject(WorkflowStateService);

  sections: AdminSection[] = [];
  teachers: AdminTeacher[] = [];
  faculties: AdminFacultyFilterOption[] = [];
  campuses: string[] = [];
  courses: string[] = [];
  error: string | null = null;

  facultyFilter = '';
  campusFilter = '';
  courseFilter = '';

  studentsModalSection: AdminSection | null = null;
  studentsModalRows: SectionStudentRow[] = [];
  modalCourseName = '';
  loadingStudentsSectionId: string | null = null;
  studentsExportMenuOpen = false;
  exportingStudentsModal = false;
  reassignModalOpen = false;
  reassignStudentRow: SectionStudentRow | null = null;
  reassignOptions: AdminReassignmentOption[] = [];
  selectedReassignTargetSectionCourseId = '';
  reassignReason = '';
  reassigning = false;
  reassignNeedsOverCapacityConfirm = false;
  reassignError: string | null = null;
  reassignWarning: string | null = null;

  teacherModalSection: AdminSection | null = null;
  teacherModalTeacherId = '';
  loadingAssignId: string | null = null;

  courseProgress: AdminCourseScopeProgress | null = null;

  classroomModalSection: AdminSection | null = null;
  classroomOptions: AdminClassroom[] = [];
  classroomModalClassroomId = '';
  loadingClassrooms = false;
  loadingClassroomAssign = false;

  get hasMandatoryFilters() {
    return Boolean(this.facultyFilter && this.campusFilter && this.courseFilter);
  }

  get selectedReassignTarget() {
    return (
      this.reassignOptions.find(
        (option) => option.sectionCourseId === this.selectedReassignTargetSectionCourseId
      ) ?? null
    );
  }

  viewMode: 'schedule' | 'students' = 'schedule';

  async ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.viewMode = params['view'] === 'students' ? 'students' : 'schedule';
      this.reloadAll();
    });
  }

  trackSection(_: number, item: AdminSection) {
    return item.id;
  }

  trackTeacher(_: number, item: AdminTeacher) {
    return item.id;
  }

  trackFaculty(_: number, item: AdminFacultyFilterOption) {
    return item.facultyGroup;
  }

  trackText(_: number, item: string) {
    return item;
  }

  trackStudentRow(_: number, item: SectionStudentRow) {
    return item.id;
  }

  trackClassroom(_: number, item: AdminClassroom) {
    return item.id;
  }

  trackReassignOption(_: number, item: AdminReassignmentOption) {
    return item.sectionCourseId;
  }

  studentCode(code: string | null | undefined) {
    const value = String(code ?? '').trim();
    return value || 'SIN CODIGO';
  }

  facultyOptionLabel(option: AdminFacultyFilterOption) {
    const group = String(option?.facultyGroup ?? '').trim();
    const name = String(option?.facultyName ?? '').trim();
    if (!name || this.textKey(name) === this.textKey(group)) return group;
    return `${group} - ${name}`;
  }

  isVirtualSection(section: AdminSection) {
    return String(section.modality ?? '')
      .trim()
      .toUpperCase()
      .includes('VIRTUAL');
  }

  async reloadAll() {
    this.error = null;
    this.sections = [];
    this.courseProgress = null;
    this.campuses = [];
    this.courses = [];
    this.closeStudentsModal();
    this.closeTeacherModal();
    if (!this.facultyFilter && !this.campusFilter && !this.courseFilter) {
      this.restoreFiltersFromStorage();
    }
    try {
      const [faculties, teachers] = await Promise.all([
        firstValueFrom(
          this.http.get<AdminFacultyFilterOption[]>(
            '/api/admin/sections/filters/faculties-detailed'
          )
        ),
        firstValueFrom(this.http.get<AdminTeacher[]>('/api/admin/teachers')),
      ]);
      this.faculties = faculties;
      this.teachers = teachers;

      if (
        this.facultyFilter &&
        !this.faculties.some(
          (f) => this.textKey(f.facultyGroup) === this.textKey(this.facultyFilter)
        )
      ) {
        this.facultyFilter = '';
        this.campusFilter = '';
        this.courseFilter = '';
      }

      if (this.facultyFilter) {
        await this.loadCampusesForCurrentFaculty();
      }

      if (
        this.campusFilter &&
        !this.campuses.some((c) => this.textKey(c) === this.textKey(this.campusFilter))
      ) {
        this.campusFilter = '';
        this.courseFilter = '';
      }

      if (this.facultyFilter && this.campusFilter) {
        await this.loadCoursesForCurrentCampus();
      }

      if (
        this.courseFilter &&
        !this.courses.some((c) => this.textKey(c) === this.textKey(this.courseFilter))
      ) {
        this.courseFilter = '';
      }

      this.persistFilters();
      if (this.hasMandatoryFilters) {
        await this.loadSections();
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar configuracion de secciones';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onFacultyChange() {
    this.error = null;
    this.sections = [];
    this.courseProgress = null;
    this.courses = [];
    this.campusFilter = '';
    this.courseFilter = '';
    this.closeStudentsModal();
    this.persistFilters();
    if (!this.facultyFilter) {
      this.campuses = [];
      this.persistFilters();
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadCampusesForCurrentFaculty();
      this.persistFilters();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar sedes';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onCampusChange() {
    this.error = null;
    this.sections = [];
    this.courseProgress = null;
    this.courseFilter = '';
    this.closeStudentsModal();
    this.persistFilters();
    if (!this.facultyFilter || !this.campusFilter) {
      this.courses = [];
      this.persistFilters();
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadCoursesForCurrentCampus();
      this.persistFilters();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar cursos';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onCourseChange() {
    this.persistFilters();
    this.persistSelectedCourse(this.courseFilter);
    this.closeStudentsModal();
    if (!this.hasMandatoryFilters) {
      this.sections = [];
      this.courseProgress = null;
      this.cdr.detectChanges();
      return;
    }
    await this.loadSections();
  }

  private async loadCampusesForCurrentFaculty() {
    const params = new HttpParams().set('facultyGroup', this.facultyFilter);
    this.campuses = await firstValueFrom(
      this.http.get<string[]>('/api/admin/sections/filters/campuses', { params })
    );
  }

  private async loadCoursesForCurrentCampus() {
    const params = new HttpParams()
      .set('facultyGroup', this.facultyFilter)
      .set('campusName', this.campusFilter);
    this.courses = await firstValueFrom(
      this.http.get<string[]>('/api/admin/sections/filters/courses', { params })
    );
  }

  private async loadSections() {
    this.error = null;
    try {
      const params = new HttpParams()
        .set('facultyGroup', this.facultyFilter)
        .set('campusName', this.campusFilter)
        .set('courseName', this.courseFilter);
      this.sections = await firstValueFrom(
        this.http.get<AdminSection[]>('/api/admin/sections', { params })
      );
      if (this.viewMode === 'students') {
        this.sections = this.sections.filter(
          (section) => Math.max(0, Number(section.studentCount ?? 0)) > 0
        );
      }
      if (this.viewMode === 'schedule') {
        this.courseProgress = await firstValueFrom(
          this.http.get<AdminCourseScopeProgress>('/api/admin/sections/stats/course-progress', {
            params,
          })
        );
      } else {
        this.courseProgress = null;
      }
    } catch (e: any) {
      this.sections = [];
      this.courseProgress = null;
      this.error = e?.error?.message ?? 'No se pudo cargar secciones';
    } finally {
      this.cdr.detectChanges();
    }
  }

  classroomCapacityLabel(section: AdminSection) {
    if (this.isVirtualSection(section)) return 'Virtual (sin aforo)';
    const cap = Math.max(0, Number(section.classroomCapacity ?? 0));
    if (cap > 0) return String(cap);
    return 'Sin aula';
  }

  studentCountLabel(section: AdminSection) {
    return Math.max(0, Number(section.studentCount ?? 0));
  }

  availableSeatsLabel(section: AdminSection) {
    if (this.isVirtualSection(section)) return '-';
    const available = Number(section.availableSeats ?? 0);
    return Math.max(0, Number.isFinite(available) ? available : 0);
  }

  aforoMatriculadosLabel(section: AdminSection) {
    const matriculados = Math.max(0, Number(section.studentCount ?? 0));
    if (this.isVirtualSection(section)) return `Virtual / ${matriculados}`;
    const aforo = Math.max(0, Number(section.classroomCapacity ?? 0));
    return `${aforo > 0 ? aforo : 'Sin aula'} / ${matriculados}`;
  }

  planningStatusLabel(section: AdminSection) {
    const key = String(section.planningStatus ?? '').trim().toUpperCase();
    if (key === 'FALTA_AULA') return 'Falta aula';
    if (key === 'CRUCE_AULA') return 'Cruce aula';
    if (key === 'CRUCE_DOCENTE') return 'Cruce docente';
    return 'OK';
  }

  planningStatusClass(section: AdminSection) {
    const key = String(section.planningStatus ?? '').trim().toUpperCase();
    if (key === 'FALTA_AULA') return 'bg-amber-100 text-amber-700';
    if (key === 'CRUCE_AULA' || key === 'CRUCE_DOCENTE') return 'bg-red-100 text-red-700';
    return 'bg-emerald-100 text-emerald-700';
  }

  classroomDisplayLabel(section: AdminSection) {
    if (this.isVirtualSection(section)) return 'Virtual';
    const code = String(section.classroomCode ?? '').trim();
    if (!code) return 'Sin aula';
    return code;
  }

  classroomOptionLabel(room: AdminClassroom) {
    const code = String(room.code ?? '').trim();
    const name = String(room.name ?? '').trim();
    const pavilionCode = String(room.pavilionCode ?? '').trim();
    const pavilionName = String(room.pavilionName ?? '').trim();
    const level = String(room.levelName ?? '').trim();
    const cap = Math.max(0, Number(room.capacity ?? 0));
    const chunks: string[] = [code || name || 'AULA'];
    if (name && name !== code) chunks.push(name);
    if (pavilionCode || pavilionName) {
      chunks.push([pavilionCode, pavilionName].filter(Boolean).join(' - '));
    }
    if (level) chunks.push(level);
    chunks.push(`aforo ${cap}`);
    return chunks.join(' | ');
  }

  async openClassroomModal(section: AdminSection) {
    if (!this.courseFilter) return;
    if (this.isVirtualSection(section)) {
      this.error = 'Las secciones virtuales no requieren aula.';
      this.cdr.detectChanges();
      return;
    }
    this.loadingClassrooms = true;
    this.error = null;
    this.classroomModalSection = section;
    this.classroomModalClassroomId = section.classroomId ?? '';
    try {
      const params = new HttpParams()
        .set('campusName', String(section.campusName ?? '').trim())
        .set('status', 'ACTIVA');
      this.classroomOptions = await firstValueFrom(
        this.http.get<AdminClassroom[]>('/api/admin/classrooms', { params })
      );
      this.classroomOptions = this.classroomOptions.filter((room) => {
        const pavilionId = String(room.pavilionId ?? '').trim();
        const levelName = String(room.levelName ?? '').trim();
        return Boolean(pavilionId) && Boolean(levelName);
      });
    } catch (e: any) {
      this.classroomModalSection = null;
      this.classroomOptions = [];
      this.classroomModalClassroomId = '';
      this.error = e?.error?.message ?? 'No se pudo cargar aulas';
    } finally {
      this.loadingClassrooms = false;
      this.cdr.detectChanges();
    }
  }

  closeClassroomModal() {
    this.classroomModalSection = null;
    this.classroomOptions = [];
    this.classroomModalClassroomId = '';
    this.loadingClassroomAssign = false;
  }

  async saveClassroomAssignment() {
    if (!this.classroomModalSection || !this.courseFilter || this.loadingClassroomAssign) return;
    this.loadingClassroomAssign = true;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/sections/${this.classroomModalSection.id}/course-classroom`, {
          courseName: this.courseFilter,
          classroomId: this.classroomModalClassroomId || null,
        })
      );
      await this.loadSections();
      this.workflowState.notifyWorkflowChanged();
      this.closeClassroomModal();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar aula';
    } finally {
      this.loadingClassroomAssign = false;
      this.cdr.detectChanges();
    }
  }

  async openStudentsModal(section: AdminSection) {
    if (!this.courseFilter) return;
    this.loadingStudentsSectionId = section.id;
    this.error = null;
    try {
      const params = new HttpParams().set('courseName', this.courseFilter);
      const rows = await firstValueFrom(
        this.http.get<SectionStudentRow[]>(`/api/admin/sections/${section.id}/students`, { params })
      );
      this.studentsModalSection = section;
      this.studentsModalRows = rows;
      this.modalCourseName = this.courseFilter;
      this.studentsExportMenuOpen = false;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar alumnos de la seccion';
    } finally {
      this.loadingStudentsSectionId = null;
      this.cdr.detectChanges();
    }
  }

  closeStudentsModal() {
    this.closeReassignModal();
    this.studentsModalSection = null;
    this.studentsModalRows = [];
    this.modalCourseName = '';
    this.studentsExportMenuOpen = false;
    this.exportingStudentsModal = false;
  }

  toggleStudentsExportMenu() {
    if (this.exportingStudentsModal) return;
    this.studentsExportMenuOpen = !this.studentsExportMenuOpen;
  }

  async exportStudentsModal(format: 'excel' | 'pdf') {
    if (!this.studentsModalSection || !this.modalCourseName || this.exportingStudentsModal) return;
    this.exportingStudentsModal = true;
    this.studentsExportMenuOpen = false;
    this.error = null;
    try {
      const params = new HttpParams().set('courseName', this.modalCourseName);
      const blob = await firstValueFrom(
        this.http.get(
          `/api/admin/sections/${encodeURIComponent(this.studentsModalSection.id)}/students/export/${format}`,
          { params, responseType: 'blob' }
        )
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sectionLabel = this.studentsModalSection.code || this.studentsModalSection.name || 'seccion';
      const courseLabel = this.modalCourseName || 'curso';
      const safeName = this.fileSafe(`${sectionLabel}_${courseLabel}`);
      a.download = `alumnos_${safeName}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo exportar alumnos de la seccion';
    } finally {
      this.exportingStudentsModal = false;
      this.cdr.detectChanges();
    }
  }

  async openReassignModal(student: SectionStudentRow) {
    if (!this.studentsModalSection || !this.modalCourseName || !student.sectionCourseId) return;
    this.reassignModalOpen = true;
    this.reassignStudentRow = student;
    this.reassignOptions = [];
    this.selectedReassignTargetSectionCourseId = '';
    this.reassignReason = '';
    this.reassigning = false;
    this.reassignNeedsOverCapacityConfirm = false;
    this.reassignError = null;
    this.reassignWarning = null;

    try {
      const params = new HttpParams()
        .set('studentId', student.id)
        .set('fromSectionCourseId', String(student.sectionCourseId));
      const options = await firstValueFrom(
        this.http.get<AdminReassignmentOption[]>(
          '/api/admin/sections/schedule-conflicts/reassignment-options',
          { params }
        )
      );
      this.reassignOptions = options;
      const firstValid = options.find((option) => !option.createsConflict);
      this.selectedReassignTargetSectionCourseId = firstValid?.sectionCourseId ?? '';
      if (!firstValid) {
        this.reassignWarning = 'No hay destinos disponibles sin cruce de horario para este alumno.';
      }
    } catch (e: any) {
      this.reassignError = e?.error?.message ?? 'No se pudo cargar destinos de reubicacion';
    } finally {
      this.cdr.detectChanges();
    }
  }

  closeReassignModal() {
    this.reassignModalOpen = false;
    this.reassignStudentRow = null;
    this.reassignOptions = [];
    this.selectedReassignTargetSectionCourseId = '';
    this.reassignReason = '';
    this.reassigning = false;
    this.reassignNeedsOverCapacityConfirm = false;
    this.reassignError = null;
    this.reassignWarning = null;
  }

  reassignOptionLabel(option: AdminReassignmentOption) {
    const sectionLabel = option.sectionCode || option.sectionName || 'Seccion';
    const modality = String(option.modality ?? '').trim() || '-';
    let capacityLabel = '';
    if (String(modality).toUpperCase().includes('VIRTUAL')) {
      capacityLabel = 'Virtual';
    } else if (Number(option.classroomCapacity ?? 0) > 0) {
      capacityLabel = `Aforo ${Number(option.classroomCapacity)}`;
    } else {
      capacityLabel = 'Sin aula';
    }
    const marks: string[] = [];
    if (option.createsConflict) marks.push('Con cruce');
    if (option.overCapacity) marks.push('Sobreaforo');
    const suffix = marks.length > 0 ? ` | ${marks.join(' | ')}` : '';
    return `${sectionLabel} | ${modality} | ${capacityLabel} | ${option.currentStudents}->${option.projectedStudents}${suffix}`;
  }

  async submitReassign(forceOverCapacityConfirm: boolean) {
    if (
      !this.reassignStudentRow ||
      !this.reassignStudentRow.sectionCourseId ||
      !this.selectedReassignTargetSectionCourseId ||
      this.reassigning
    ) {
      return;
    }

    const target = this.selectedReassignTarget;
    if (!target) {
      this.reassignError = 'Selecciona un destino valido.';
      this.cdr.detectChanges();
      return;
    }
    if (target.createsConflict) {
      this.reassignError = 'El destino seleccionado genera cruce de horario.';
      this.cdr.detectChanges();
      return;
    }
    if (target.overCapacity && !forceOverCapacityConfirm) {
      this.reassignNeedsOverCapacityConfirm = true;
      this.reassignWarning =
        'El destino seleccionado excede su capacidad fisica. Confirma para continuar con sobreaforo.';
      this.cdr.detectChanges();
      return;
    }

    this.reassigning = true;
    this.reassignError = null;
    this.reassignWarning = null;
    try {
      await firstValueFrom(
        this.http.post<AdminReassignmentResult>('/api/admin/sections/schedule-conflicts/reassign', {
          studentId: this.reassignStudentRow.id,
          fromSectionCourseId: this.reassignStudentRow.sectionCourseId,
          toSectionCourseId: this.selectedReassignTargetSectionCourseId,
          confirmOverCapacity: forceOverCapacityConfirm || target.overCapacity,
          reason: String(this.reassignReason ?? '').trim() || null,
        })
      );
      await this.loadSections();
      await this.reloadStudentsModalRows();
      this.workflowState.notifyWorkflowChanged();
      this.closeReassignModal();
    } catch (e: any) {
      const message = String(e?.error?.message ?? 'No se pudo reubicar alumno');
      this.reassignError = message;
      if (message.toUpperCase().includes('SOBREAFORO')) {
        this.reassignNeedsOverCapacityConfirm = true;
      }
    } finally {
      this.reassigning = false;
      this.cdr.detectChanges();
    }
  }

  openTeacherModal(section: AdminSection) {
    if (!this.courseFilter) {
      this.error = 'Selecciona un curso para asignar docente por seccion-curso.';
      this.cdr.detectChanges();
      return;
    }
    if (this.teachers.length === 0) {
      this.error = 'No hay docentes registrados. Primero crea docentes en la opcion Docentes.';
      this.cdr.detectChanges();
      return;
    }
    this.teacherModalSection = section;
    this.teacherModalTeacherId = section.teacherId ?? this.teachers[0].id;
  }

  closeTeacherModal() {
    this.teacherModalSection = null;
    this.teacherModalTeacherId = '';
  }

  async saveTeacherAssignment() {
    if (!this.teacherModalSection || !this.teacherModalTeacherId || !this.courseFilter) return;
    this.loadingAssignId = this.teacherModalSection.id;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/sections/${this.teacherModalSection.id}/course-teacher`, {
          courseName: this.courseFilter,
          teacherId: this.teacherModalTeacherId,
        })
      );
      await this.loadSections();
      this.closeTeacherModal();
      this.workflowState.notifyWorkflowChanged();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo asignar docente';
    } finally {
      this.loadingAssignId = null;
      this.cdr.detectChanges();
    }
  }

  private async reloadStudentsModalRows() {
    if (!this.studentsModalSection || !this.modalCourseName) return;
    const params = new HttpParams().set('courseName', this.modalCourseName);
    this.studentsModalRows = await firstValueFrom(
      this.http.get<SectionStudentRow[]>(
        `/api/admin/sections/${this.studentsModalSection.id}/students`,
        { params }
      )
    );
  }

  private restoreFiltersFromStorage() {
    if (typeof window === 'undefined') return;
    this.facultyFilter = String(window.localStorage.getItem(FACULTY_FILTER_STORAGE_KEY) ?? '').trim();
    this.campusFilter = String(window.localStorage.getItem(CAMPUS_FILTER_STORAGE_KEY) ?? '').trim();
    this.courseFilter = String(window.localStorage.getItem(COURSE_FILTER_STORAGE_KEY) ?? '').trim();
  }

  private persistFilters() {
    if (typeof window === 'undefined') return;
    this.setStorageValue(FACULTY_FILTER_STORAGE_KEY, this.facultyFilter);
    this.setStorageValue(CAMPUS_FILTER_STORAGE_KEY, this.campusFilter);
    this.setStorageValue(COURSE_FILTER_STORAGE_KEY, this.courseFilter);
  }

  private setStorageValue(key: string, value: string) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) {
      window.localStorage.setItem(key, trimmed);
      return;
    }
    window.localStorage.removeItem(key);
  }

  private textKey(value: string) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  private persistSelectedCourse(courseName: string) {
    if (typeof window === 'undefined') return;
    const value = String(courseName ?? '').trim();
    if (value) {
      window.localStorage.setItem(COURSE_CONTEXT_STORAGE_KEY, value);
      return;
    }
    window.localStorage.removeItem(COURSE_CONTEXT_STORAGE_KEY);
  }

  private fileSafe(value: string) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }
}
