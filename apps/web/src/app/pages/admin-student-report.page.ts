import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  AdminStudentReportResponse,
  AdminStudentReportSearchItem,
  StudentGradesReportRow,
} from '@uai/shared';
import { Subscription, firstValueFrom, skip } from 'rxjs';
import { StudentWeeklyScheduleComponent } from '../components/student-weekly-schedule.component';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';

type StudentDetailSection =
  | 'general'
  | 'schedule'
  | 'enrollment'
  | 'grades'
  | 'attendance';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, StudentWeeklyScheduleComponent],
  template: `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-xl font-semibold">Reporte por alumno</div>
            <div class="text-sm text-slate-600">
              Consulta individual del alumno en el periodo de trabajo actual.
            </div>
            <div class="mt-1 text-xs text-slate-500">
              Periodo:
              <b>{{ currentPeriodLabel }}</b>
            </div>
          </div>
          <button
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            (click)="refresh()"
          >
            Refrescar
          </button>
        </div>
      </div>

      <div
        *ngIf="error"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ error }}
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label class="text-xs font-semibold text-slate-700">
            Buscar alumno
            <input
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              [(ngModel)]="studentQuery"
              placeholder="Buscar por nombres, apellidos, DNI o codigo de estudiante"
              (ngModelChange)="queueSearch()"
              (keyup.enter)="searchStudentsImmediately()"
            />
          </label>
          <button
            class="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="searchLoading"
            (click)="searchStudentsImmediately()"
          >
            {{ searchLoading ? 'Buscando...' : 'Buscar' }}
          </button>
        </div>

        <div class="mt-2 text-xs text-slate-500">
          Busca un solo alumno y selecciona la coincidencia exacta.
        </div>

        <div
          *ngIf="emptyMessage"
          class="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
        >
          {{ emptyMessage }}
        </div>

        <div *ngIf="studentMatches.length > 0" class="mt-4 rounded-xl border border-slate-200">
          <div class="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            Coincidencias
          </div>
          <div class="divide-y divide-slate-100">
            <button
              *ngFor="let item of studentMatches; trackBy: trackMatch"
              type="button"
              class="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              [class.bg-sky-50]="item.studentId === selectedStudentId"
              (click)="selectStudent(item.studentId)"
            >
              <div>
                <div class="font-semibold text-slate-900">{{ item.fullName }}</div>
                <div class="text-xs text-slate-600">
                  DNI: {{ item.dni }} | Codigo: {{ item.codigoAlumno || 'SIN CODIGO' }}
                </div>
              </div>
              <div class="text-xs font-medium text-slate-500">
                {{ item.careerName || 'SIN CARRERA' }}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      *ngIf="detailModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeDetailModal()"
    >
      <div
        class="flex max-h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="border-b border-slate-200 px-5 py-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-base font-semibold text-slate-900">
                {{ modalStudentName }}
              </div>
              <div class="mt-1 text-xs text-slate-600">
                DNI {{ modalStudentDni }} | Codigo {{ modalStudentCode }}
              </div>
              <div class="mt-1 text-xs text-slate-500">
                Carrera: {{ modalStudentCareer }}
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                [disabled]="!selectedStudentId || reportLoading || exportingExcel"
                (click)="downloadExcel()"
              >
                {{ exportingExcel ? 'Descargando...' : 'Exportar Excel' }}
              </button>
              <button
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                [disabled]="!selectedStudentId || reportLoading || exportingPdf"
                (click)="downloadPdf()"
              >
                {{ exportingPdf ? 'Descargando...' : 'Exportar PDF' }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                (click)="closeDetailModal()"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>

        <div class="border-b border-slate-200 px-5 py-4">
          <div class="flex flex-wrap gap-2">
            <button
              *ngFor="let section of detailSections"
              type="button"
              class="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              [disabled]="reportLoading || !studentReport"
              [ngClass]="activeSection === section.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
              (click)="setActiveSection(section.id)"
            >
              {{ section.label }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <div
            *ngIf="reportLoading"
            class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600"
          >
            Cargando reporte del alumno...
          </div>

          <div
            *ngIf="!reportLoading && error"
            class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {{ error }}
          </div>

          <div
            *ngIf="!reportLoading && !studentReport"
            class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600"
          >
            No se pudo cargar el reporte del alumno.
          </div>

          <ng-container *ngIf="studentReport && !reportLoading">
            <div
              *ngIf="activeSection === null"
              class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-600"
            >
              Selecciona una seccion para ver el reporte del alumno.
            </div>

            <div
              *ngIf="activeSection === 'general'"
              class="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div class="text-base font-semibold">Datos generales</div>
              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <div *ngFor="let field of generalDataFields">
                  <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-slate-800">{{ field.value }}</div>
                </div>
              </div>
            </div>

            <div
              *ngIf="activeSection === 'schedule'"
              class="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <app-student-weekly-schedule
                [title]="'Horario del estudiante'"
                [subtitle]="'Vista semanal del periodo seleccionado.'"
                [items]="studentReport.schedule"
                [emptyMessage]="'No hay horario registrado para este alumno en el periodo actual.'"
              />
            </div>

            <div
              *ngIf="activeSection === 'enrollment'"
              class="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div class="text-base font-semibold">Matricula</div>
              <div class="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                <table class="min-w-full text-sm">
                  <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th class="px-4 py-3">Curso</th>
                      <th class="px-4 py-3">Seccion</th>
                      <th class="px-4 py-3">Sede</th>
                      <th class="px-4 py-3">Modalidad</th>
                      <th class="px-4 py-3">Docente</th>
                      <th class="px-4 py-3">Aula</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      *ngFor="let row of studentReport.enrollment; trackBy: trackEnrollment"
                      class="border-t border-slate-100"
                    >
                      <td class="px-4 py-3">{{ row.courseName }}</td>
                      <td class="px-4 py-3">{{ row.sectionCode || row.sectionName }}</td>
                      <td class="px-4 py-3">{{ row.campusName || '-' }}</td>
                      <td class="px-4 py-3">{{ row.modality || '-' }}</td>
                      <td class="px-4 py-3">{{ row.teacherName || 'Sin docente asignado' }}</td>
                      <td class="px-4 py-3">{{ row.classroomLabel || 'Sin aula asignada' }}</td>
                    </tr>
                    <tr *ngIf="studentReport.enrollment.length === 0" class="border-t border-slate-100">
                      <td class="px-4 py-6 text-slate-500" colspan="6">
                        No hay matricula registrada.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div
              *ngIf="activeSection === 'grades'"
              class="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div class="text-base font-semibold">Notas</div>
              <div
                class="mt-4 space-y-4"
                *ngIf="studentReport.grades.rows.length > 0; else noGradesBlock"
              >
                <article
                  *ngFor="let row of studentReport.grades.rows; trackBy: trackGradeRow"
                  class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div class="text-base font-semibold">{{ row.courseName }}</div>
                      <div class="text-xs text-slate-600">
                        {{ row.sectionCode || row.sectionName }} | {{ row.campusName || '-' }} |
                        {{ row.modality || '-' }}
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-xs text-slate-500">Promedio final</div>
                      <div class="text-lg font-bold">{{ row.finalAverage | number:'1.0-0' }}</div>
                      <span
                        class="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                        [class.bg-emerald-100]="isGradeComplete(row) && row.approved"
                        [class.text-emerald-700]="isGradeComplete(row) && row.approved"
                        [class.bg-rose-100]="isGradeComplete(row) && !row.approved"
                        [class.text-rose-700]="isGradeComplete(row) && !row.approved"
                        [class.bg-amber-100]="!isGradeComplete(row)"
                        [class.text-amber-700]="!isGradeComplete(row)"
                      >
                        {{ gradeStatus(row) }}
                      </span>
                    </div>
                  </div>

                  <div class="mt-3 overflow-x-auto">
                    <table class="min-w-full text-sm">
                      <thead class="bg-white text-left text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th class="px-3 py-2">Componente</th>
                          <th class="px-3 py-2 text-right">Peso %</th>
                          <th class="px-3 py-2 text-right">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          *ngFor="let item of row.components; trackBy: trackGradeComponent"
                          class="border-t border-slate-100"
                        >
                          <td class="px-3 py-2">{{ item.name }}</td>
                          <td class="px-3 py-2 text-right">{{ item.weight | number:'1.0-2' }}</td>
                          <td class="px-3 py-2 text-right font-semibold">
                            {{ item.score === null ? '-' : (item.score | number:'1.2-2') }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
              <ng-template #noGradesBlock>
                <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
                  No hay notas registradas.
                </div>
              </ng-template>
            </div>

            <div
              *ngIf="activeSection === 'attendance'"
              class="space-y-5"
            >
              <div class="rounded-2xl border border-slate-200 bg-white p-5">
                <div class="text-base font-semibold">Asistencia resumen</div>
                <div class="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                  <table class="min-w-full text-sm">
                    <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th class="px-4 py-3">Curso</th>
                        <th class="px-4 py-3 text-right">Sesiones</th>
                        <th class="px-4 py-3 text-right">Asistencias</th>
                        <th class="px-4 py-3 text-right">Faltas</th>
                        <th class="px-4 py-3 text-right">% asistencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        *ngFor="let row of studentReport.attendance.summaryByCourse; trackBy: trackAttendanceSummary"
                        class="border-t border-slate-100"
                      >
                        <td class="px-4 py-3">{{ row.courseName }}</td>
                        <td class="px-4 py-3 text-right">{{ row.totalSessions }}</td>
                        <td class="px-4 py-3 text-right">{{ row.attendedCount }}</td>
                        <td class="px-4 py-3 text-right">{{ row.absentCount }}</td>
                        <td class="px-4 py-3 text-right">{{ row.attendanceRate | number:'1.0-2' }}</td>
                      </tr>
                      <tr *ngIf="studentReport.attendance.summaryByCourse.length === 0" class="border-t border-slate-100">
                        <td class="px-4 py-6 text-slate-500" colspan="5">Sin asistencia registrada.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-5">
                <div class="text-base font-semibold">Asistencia detalle</div>
                <div class="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                  <table class="min-w-full text-sm">
                    <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th class="px-4 py-3">Curso</th>
                        <th class="px-4 py-3">Fecha</th>
                        <th class="px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        *ngFor="let row of studentReport.attendance.sessions; trackBy: trackAttendanceSession"
                        class="border-t border-slate-100"
                      >
                        <td class="px-4 py-3">{{ row.courseName }}</td>
                        <td class="px-4 py-3">{{ row.sessionDate }}</td>
                        <td class="px-4 py-3">
                          <span
                            class="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
                            [class.bg-emerald-100]="row.status === 'ASISTIO'"
                            [class.text-emerald-800]="row.status === 'ASISTIO'"
                            [class.bg-rose-100]="row.status === 'FALTO'"
                            [class.text-rose-800]="row.status === 'FALTO'"
                          >
                            {{ row.status }}
                          </span>
                        </td>
                      </tr>
                      <tr *ngIf="studentReport.attendance.sessions.length === 0" class="border-t border-slate-100">
                        <td class="px-4 py-6 text-slate-500" colspan="3">Sin sesiones registradas.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ng-container>
        </div>
      </div>
    </div>
  `,
})
export class AdminStudentReportPage implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private periodSub?: Subscription;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private latestSearchRequestId = 0;

  readonly detailSections: Array<{ id: StudentDetailSection; label: string }> = [
    { id: 'general', label: 'Datos generales' },
    { id: 'schedule', label: 'Horario' },
    { id: 'enrollment', label: 'Matricula' },
    { id: 'grades', label: 'Notas' },
    { id: 'attendance', label: 'Asistencia' },
  ];

  studentQuery = '';
  studentMatches: AdminStudentReportSearchItem[] = [];
  selectedStudentId: string | null = null;
  studentReport: AdminStudentReportResponse | null = null;
  detailModalOpen = false;
  activeSection: StudentDetailSection | null = null;
  searchLoading = false;
  reportLoading = false;
  exportingExcel = false;
  exportingPdf = false;
  error: string | null = null;
  emptyMessage: string | null = null;

  get currentPeriodLabel() {
    const period = this.adminPeriodContext.getSelectedPeriod();
    if (!period?.id) return 'Periodo operativo actual';
    return `${period.code} - ${period.name}`;
  }

  get selectedStudentMatch() {
    if (!this.selectedStudentId) return null;
    return (
      this.studentMatches.find((item) => item.studentId === this.selectedStudentId) ??
      null
    );
  }

  get modalStudentName() {
    return (
      this.studentReport?.student.fullName ||
      this.selectedStudentMatch?.fullName ||
      'Alumno seleccionado'
    );
  }

  get modalStudentDni() {
    return (
      this.studentReport?.student.dni ||
      this.selectedStudentMatch?.dni ||
      '-'
    );
  }

  get modalStudentCode() {
    return (
      this.studentReport?.student.codigoAlumno ||
      this.selectedStudentMatch?.codigoAlumno ||
      'SIN CODIGO'
    );
  }

  get modalStudentCareer() {
    return (
      this.studentReport?.student.careerName ||
      this.selectedStudentMatch?.careerName ||
      'SIN CARRERA'
    );
  }

  get generalDataFields() {
    const student = this.studentReport?.student;
    if (!student) return [];
    return [
      { label: 'Nombre completo', value: this.displayValue(student.fullName) },
      { label: 'Nombres', value: this.displayValue(student.names) },
      { label: 'Apellido paterno', value: this.displayValue(student.paternalLastName) },
      { label: 'Apellido materno', value: this.displayValue(student.maternalLastName) },
      { label: 'DNI', value: this.displayValue(student.dni) },
      { label: 'Codigo', value: student.codigoAlumno || 'SIN CODIGO' },
      { label: 'Carrera', value: student.careerName || 'SIN CARRERA' },
      { label: 'Sexo', value: this.displayValue(student.sex) },
      { label: 'Email', value: this.displayValue(student.email) },
      { label: 'Fecha de examen', value: this.displayValue(student.examDate) },
    ];
  }

  async ngOnInit() {
    this.periodSub = this.adminPeriodContext.changes$
      .pipe(skip(1))
      .subscribe(() => void this.refresh());
  }

  ngOnDestroy() {
    this.periodSub?.unsubscribe();
    this.clearSearchDebounce();
  }

  trackMatch(_: number, item: AdminStudentReportSearchItem) {
    return item.studentId;
  }

  trackEnrollment(_: number, item: { sectionCourseId: string }) {
    return item.sectionCourseId;
  }

  trackGradeRow(_: number, item: { sectionCourseId: string }) {
    return item.sectionCourseId;
  }

  trackGradeComponent(_: number, item: { componentId: string }) {
    return item.componentId;
  }

  trackAttendanceSummary(_: number, item: { courseName: string }) {
    return item.courseName;
  }

  trackAttendanceSession(_: number, item: { courseName: string; sessionDate: string }) {
    return `${item.courseName}::${item.sessionDate}`;
  }

  isGradeComplete(row: StudentGradesReportRow) {
    if (Array.isArray(row.components) && row.components.length > 0) {
      return row.components.every((component) => component.score !== null);
    }
    return Boolean(row.isComplete);
  }

  gradeStatus(row: StudentGradesReportRow) {
    if (!this.isGradeComplete(row)) return 'PENDIENTE';
    return row.approved ? 'APROBADO' : 'DESAPROBADO';
  }

  setActiveSection(section: StudentDetailSection) {
    this.activeSection = section;
  }

  closeDetailModal() {
    this.detailModalOpen = false;
    this.activeSection = null;
    this.cdr.detectChanges();
  }

  queueSearch() {
    this.clearSearchDebounce();
    this.searchDebounceTimer = setTimeout(() => {
      void this.searchStudents();
    }, 250);
  }

  async searchStudentsImmediately() {
    this.clearSearchDebounce();
    await this.searchStudents();
  }

  async searchStudents() {
    const normalized = String(this.studentQuery ?? '').trim();
    const requestId = ++this.latestSearchRequestId;
    this.error = null;
    this.emptyMessage = null;
    this.studentMatches = [];
    this.studentReport = null;
    this.selectedStudentId = null;
    this.detailModalOpen = false;
    this.activeSection = null;

    if (!normalized) {
      this.searchLoading = false;
      this.emptyMessage = 'Ingresa al menos 2 caracteres.';
      this.cdr.detectChanges();
      return;
    }

    if (normalized.length < 2) {
      this.searchLoading = false;
      this.emptyMessage = 'Ingresa al menos 2 caracteres.';
      this.cdr.detectChanges();
      return;
    }

    this.searchLoading = true;
    try {
      const matches = await firstValueFrom(
        this.http.get<AdminStudentReportSearchItem[]>(
          `/api/admin/grades/reports/student-search?q=${encodeURIComponent(normalized)}`
        )
      );
      if (requestId !== this.latestSearchRequestId) {
        return;
      }
      this.studentMatches = matches;
      if (this.studentMatches.length === 0) {
        this.emptyMessage = 'No se encontraron alumnos.';
      } else {
        this.emptyMessage = 'Selecciona un alumno para ver el reporte.';
      }
    } catch (e: any) {
      if (requestId !== this.latestSearchRequestId) {
        return;
      }
      this.error = e?.error?.message ?? 'No se pudo buscar alumnos.';
    } finally {
      if (requestId === this.latestSearchRequestId) {
        this.searchLoading = false;
      }
      this.cdr.detectChanges();
    }
  }

  async selectStudent(studentId: string) {
    this.selectedStudentId = studentId;
    this.detailModalOpen = true;
    this.activeSection = null;
    await this.loadSelectedStudent();
  }

  async refresh() {
    this.error = null;
    if (this.selectedStudentId) {
      await this.loadSelectedStudent();
      return;
    }
    const normalized = String(this.studentQuery ?? '').trim();
    if (normalized.length >= 2) {
      await this.searchStudents();
    } else {
      this.cdr.detectChanges();
    }
  }

  async downloadExcel() {
    if (!this.selectedStudentId) return;
    this.exportingExcel = true;
    this.error = null;
    try {
      await this.downloadBlob(
        `/api/admin/grades/reports/student/${this.selectedStudentId}/export/excel`
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo descargar el Excel.';
    } finally {
      this.exportingExcel = false;
      this.cdr.detectChanges();
    }
  }

  async downloadPdf() {
    if (!this.selectedStudentId) return;
    this.exportingPdf = true;
    this.error = null;
    try {
      await this.downloadBlob(
        `/api/admin/grades/reports/student/${this.selectedStudentId}/export/pdf`
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo descargar el PDF.';
    } finally {
      this.exportingPdf = false;
      this.cdr.detectChanges();
    }
  }

  private async loadSelectedStudent() {
    if (!this.selectedStudentId) return;
    this.reportLoading = true;
    this.error = null;
    this.studentReport = null;
    try {
      this.studentReport = await firstValueFrom(
        this.http.get<AdminStudentReportResponse>(
          `/api/admin/grades/reports/student/${this.selectedStudentId}`
        )
      );
    } catch (e: any) {
      this.studentReport = null;
      this.error = e?.error?.message ?? 'No se pudo cargar el reporte del alumno.';
    } finally {
      this.reportLoading = false;
      this.cdr.detectChanges();
    }
  }

  private displayValue(value: string | null | undefined) {
    return String(value ?? '').trim() || '-';
  }

  private async downloadBlob(url: string) {
    const response = await firstValueFrom(
      this.http.get(url, {
        observe: 'response',
        responseType: 'blob',
      })
    );
    const blob = response.body;
    if (!blob) {
      throw new Error('No se recibio archivo para descargar.');
    }
    const student = this.studentReport?.student;
    const periodCode =
      String(this.adminPeriodContext.getSelectedPeriod()?.code ?? '').trim() ||
      'PERIODO';
    const base = student?.codigoAlumno || student?.dni || 'reporte_alumno';
    const extension = url.endsWith('/pdf') ? 'pdf' : 'xlsx';
    const fallbackName = `reporte_alumno_${this.sanitizeFilePart(base)}_${this.sanitizeFilePart(periodCode)}.${extension}`;
    const fileName = this.extractDownloadFileName(
      response.headers.get('content-disposition'),
      fallbackName
    );
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  }

  private extractDownloadFileName(
    disposition: string | null,
    fallbackName: string
  ) {
    const encodedMatch = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
      return this.cleanFileName(decodeURIComponent(encodedMatch[1]));
    }
    const simpleMatch = disposition?.match(/filename=\"?([^\";]+)\"?/i);
    if (simpleMatch?.[1]) {
      return this.cleanFileName(simpleMatch[1]);
    }
    return fallbackName;
  }

  private cleanFileName(value: string) {
    return String(value ?? '').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'archivo';
  }

  private sanitizeFilePart(value: string | null | undefined) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  private clearSearchDebounce() {
    if (!this.searchDebounceTimer) return;
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = null;
  }
}
