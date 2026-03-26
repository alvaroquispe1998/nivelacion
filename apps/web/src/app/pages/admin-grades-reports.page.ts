import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom, skip } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';

interface GradesReportFilters {
  periodId: string;
  faculties: Array<{ facultyGroup: string; facultyName: string }>;
  campuses: string[];
  careers: string[];
}

interface StudentsReportRow {
  studentId: string;
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  careerName: string | null;
}

interface AveragesReportRow extends StudentsReportRow {
  average: number;
  approved: 'SI' | 'NO';
}

interface AttendanceReportResponse {
  dates: string[];
  rows: Array<
    StudentsReportRow & {
      attendanceByDate: Record<string, 'ASISTIO' | 'FALTO' | ''>;
      totalAsistencias: number;
    }
  >;
}

interface WeeklySummaryCount {
  attendedCount: number;
  absentCount: number;
}

interface WeeklySummaryWeekRange {
  label: string;
  startDate: string | null;
  endDate: string | null;
}

interface WeeklySummaryAggregate {
  studentCount: number;
  week1: WeeklySummaryCount;
  week2: WeeklySummaryCount;
  week3: WeeklySummaryCount;
  totalAttendedCount: number;
  totalAbsentCount: number;
  totalAttendancePct: number;
  totalAbsencePct: number;
  studentsWithGrades: number;
  approvedCount: number;
  failedCount: number;
  approvedPct: number;
  failedPct: number;
}

interface WeeklySummaryCareerRow extends WeeklySummaryAggregate {
  careerName: string;
}

interface WeeklySummaryBlock {
  sectionCourseId: string;
  courseName: string;
  sectionCode: string | null;
  sectionName: string;
  currentCampusName: string;
  currentModality: string;
  weeks: WeeklySummaryWeekRange[];
  careers: WeeklySummaryCareerRow[];
  totals: WeeklySummaryAggregate;
}

interface WeeklySummaryResponse {
  filters: {
    originCampuses: string[];
    faculties: Array<{ facultyGroup: string; facultyName: string }>;
    sourceModalities: string[];
    courses: string[];
  };
  rows: WeeklySummaryBlock[];
  totals: WeeklySummaryAggregate;
}

function createEmptyWeeklySummaryAggregate(): WeeklySummaryAggregate {
  return {
    studentCount: 0,
    week1: { attendedCount: 0, absentCount: 0 },
    week2: { attendedCount: 0, absentCount: 0 },
    week3: { attendedCount: 0, absentCount: 0 },
    totalAttendedCount: 0,
    totalAbsentCount: 0,
    totalAttendancePct: 0,
    totalAbsencePct: 0,
    studentsWithGrades: 0,
    approvedCount: 0,
    failedCount: 0,
    approvedPct: 0,
    failedPct: 0,
  };
}

function createEmptyWeeklySummaryResponse(): WeeklySummaryResponse {
  return {
    filters: {
      originCampuses: [],
      faculties: [],
      sourceModalities: [],
      courses: [],
    },
    rows: [],
    totals: createEmptyWeeklySummaryAggregate(),
  };
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-xl font-semibold">Reportes por carrera</div>
            <div class="text-sm text-slate-600">
              Reportes academicos y de asistencia por filtros.
            </div>
            <div class="mt-1 text-xs text-slate-500">
              Periodo:
              <b>{{ currentPeriodLabel }}</b>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              [disabled]="exportingExcel"
              (click)="downloadActiveReport('excel')"
            >
              {{ exportingExcel ? 'Descargando...' : 'Exportar Excel' }}
            </button>
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              [disabled]="exportingPdf"
              (click)="downloadActiveReport('pdf')"
            >
              {{ exportingPdf ? 'Descargando...' : 'Exportar PDF' }}
            </button>
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              (click)="loadAll()"
            >
              Refrescar
            </button>
          </div>
        </div>
      </div>

      <div
        *ngIf="error"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ error }}
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div
          class="grid gap-2 md:grid-cols-3"
          *ngIf="activeTab !== 'attendanceWeeklySummary'"
        >
          <label class="text-xs font-semibold text-slate-700">
            Facultad
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="reportFaculty"
              (ngModelChange)="loadReports()"
            >
              <option value="">Todas</option>
              <option
                *ngFor="let f of reportFilters.faculties; trackBy: trackFaculty"
                [value]="f.facultyGroup"
              >
                {{ f.facultyName }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Sede
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="reportCampus"
              (ngModelChange)="loadReports()"
            >
              <option value="">Todas</option>
              <option
                *ngFor="let c of reportFilters.campuses; trackBy: trackText"
                [value]="c"
              >
                {{ c }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Carrera
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="reportCareer"
              (ngModelChange)="loadReports()"
            >
              <option value="">Todas</option>
              <option
                *ngFor="let c of reportFilters.careers; trackBy: trackText"
                [value]="c"
              >
                {{ c }}
              </option>
            </select>
          </label>
        </div>

        <div
          class="grid gap-2 md:grid-cols-4"
          *ngIf="activeTab === 'attendanceWeeklySummary'"
        >
          <label class="text-xs font-semibold text-slate-700">
            Local del alumno (segun Excel)
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="weeklyOriginCampus"
              (ngModelChange)="loadWeeklySummary()"
            >
              <option value="">Todas</option>
              <option
                *ngFor="
                  let campus of weeklySummaryReport.filters.originCampuses;
                  trackBy: trackText
                "
                [value]="campus"
              >
                {{ campus }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Facultad
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="weeklyFacultyGroup"
              (ngModelChange)="loadWeeklySummary()"
            >
              <option value="">Todas</option>
              <option
                *ngFor="
                  let faculty of weeklySummaryReport.filters.faculties;
                  trackBy: trackFaculty
                "
                [value]="faculty.facultyGroup"
              >
                {{ faculty.facultyName }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Modalidad del alumno (segun Excel)
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="weeklySourceModality"
              (ngModelChange)="loadWeeklySummary()"
            >
              <option value="">Todas</option>
              <option
                *ngFor="
                  let modality of weeklySummaryReport.filters.sourceModalities;
                  trackBy: trackText
                "
                [value]="modality"
              >
                {{ modality }}
              </option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Curso
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              [(ngModel)]="weeklyCourseName"
              (ngModelChange)="loadWeeklySummary()"
            >
              <option value="">Todos</option>
              <option
                *ngFor="
                  let course of weeklySummaryReport.filters.courses;
                  trackBy: trackText
                "
                [value]="course"
              >
                {{ course }}
              </option>
            </select>
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            [ngClass]="
              activeTab === 'students'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            "
            (click)="activeTab = 'students'"
          >
            Total alumnado por carrera
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            [ngClass]="
              activeTab === 'averages'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            "
            (click)="activeTab = 'averages'"
          >
            Promedio del alumno
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            [ngClass]="
              activeTab === 'attendance'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            "
            (click)="activeTab = 'attendance'"
          >
            Asistencia por carrera
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            [ngClass]="
              activeTab === 'attendanceWeeklySummary'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            "
            (click)="activeTab = 'attendanceWeeklySummary'"
          >
            Resumen semanal
          </button>
        </div>

        <div class="mt-4" *ngIf="activeTab === 'students'">
          <div class="text-sm font-semibold">Total alumnado por carrera</div>
          <div class="mt-2 overflow-x-auto rounded-xl border border-slate-200">
            <table class="min-w-full text-xs">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-3 py-2 text-left">DNI</th>
                  <th class="px-3 py-2 text-left">Codigo</th>
                  <th class="px-3 py-2 text-left">Nombres completos</th>
                  <th class="px-3 py-2 text-left">Carrera</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let row of studentsReport; trackBy: trackStudentReport"
                  class="border-t border-slate-100"
                >
                  <td class="px-3 py-2">{{ row.dni }}</td>
                  <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                  <td class="px-3 py-2">{{ row.fullName }}</td>
                  <td class="px-3 py-2">{{ row.careerName || 'SIN CARRERA' }}</td>
                </tr>
                <tr *ngIf="studentsReport.length === 0">
                  <td colspan="4" class="px-3 py-4 text-center text-slate-500">
                    Sin datos
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-4" *ngIf="activeTab === 'averages'">
          <div class="text-sm font-semibold">
            Reporte de nota promedio del alumno
          </div>
          <div class="mt-2 overflow-x-auto rounded-xl border border-slate-200">
            <table class="min-w-full text-xs">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-3 py-2 text-left">DNI</th>
                  <th class="px-3 py-2 text-left">Codigo</th>
                  <th class="px-3 py-2 text-left">Nombres completos</th>
                  <th class="px-3 py-2 text-right">Nota</th>
                  <th class="px-3 py-2 text-center">Aprobado</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let row of averagesReport; trackBy: trackStudentReport"
                  class="border-t border-slate-100"
                >
                  <td class="px-3 py-2">{{ row.dni }}</td>
                  <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                  <td class="px-3 py-2">{{ row.fullName }}</td>
                  <td class="px-3 py-2 text-right">
                    {{ row.average | number: '1.2-2' }}
                  </td>
                  <td class="px-3 py-2 text-center">{{ row.approved }}</td>
                </tr>
                <tr *ngIf="averagesReport.length === 0">
                  <td colspan="5" class="px-3 py-4 text-center text-slate-500">
                    Sin datos
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-4" *ngIf="activeTab === 'attendance'">
          <div class="text-sm font-semibold">Reporte de asistencia por carrera</div>
          <div class="mt-2 overflow-x-auto rounded-xl border border-slate-200">
            <table class="min-w-full text-xs">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-3 py-2 text-left">DNI</th>
                  <th class="px-3 py-2 text-left">Codigo</th>
                  <th class="px-3 py-2 text-left">Nombres completos</th>
                  <th class="px-3 py-2 text-left">Carrera</th>
                  <th
                    class="px-3 py-2 text-center"
                    *ngFor="let date of attendanceReport.dates; trackBy: trackText"
                  >
                    {{ date }}
                  </th>
                  <th class="px-3 py-2 text-right">Asistencias totales</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let row of attendanceReport.rows; trackBy: trackStudentReport"
                  class="border-t border-slate-100"
                >
                  <td class="px-3 py-2">{{ row.dni }}</td>
                  <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                  <td class="px-3 py-2">{{ row.fullName }}</td>
                  <td class="px-3 py-2">{{ row.careerName || 'SIN CARRERA' }}</td>
                  <td
                    class="px-3 py-2 text-center"
                    *ngFor="let date of attendanceReport.dates; trackBy: trackText"
                  >
                    {{ attendanceLabel(row.attendanceByDate[date]) }}
                  </td>
                  <td class="px-3 py-2 text-right font-semibold">
                    {{ row.totalAsistencias }}
                  </td>
                </tr>
                <tr *ngIf="attendanceReport.rows.length === 0">
                  <td
                    [attr.colspan]="5 + attendanceReport.dates.length"
                    class="px-3 py-4 text-center text-slate-500"
                  >
                    Sin datos
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-4 space-y-4" *ngIf="activeTab === 'attendanceWeeklySummary'">
          <div class="grid gap-3 md:grid-cols-4">
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div class="text-xs font-semibold text-slate-500">Registros</div>
              <div class="mt-1 text-lg font-semibold text-slate-900">
                {{ weeklySummaryReport.totals.studentCount }}
              </div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div class="text-xs font-semibold text-slate-500">
                Asistencia total
              </div>
              <div class="mt-1 text-lg font-semibold text-slate-900">
                {{ weeklySummaryReport.totals.totalAttendancePct | number: '1.0-2' }}%
              </div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div class="text-xs font-semibold text-slate-500">Aprobados</div>
              <div class="mt-1 text-lg font-semibold text-slate-900">
                {{ weeklySummaryReport.totals.approvedCount }}
              </div>
              <div class="mt-1 text-xs text-slate-500">
                {{ weeklySummaryReport.totals.approvedPct | number: '1.0-2' }}%
              </div>
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div class="text-xs font-semibold text-slate-500">
                Desaprobados
              </div>
              <div class="mt-1 text-lg font-semibold text-slate-900">
                {{ weeklySummaryReport.totals.failedCount }}
              </div>
              <div class="mt-1 text-xs text-slate-500">
                {{ weeklySummaryReport.totals.failedPct | number: '1.0-2' }}%
              </div>
            </div>
          </div>

          <div
            *ngIf="weeklySummaryReport.rows.length === 0"
            class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500"
          >
            Sin datos
          </div>

          <div
            *ngFor="
              let block of weeklySummaryReport.rows;
              trackBy: trackWeeklySummaryBlock
            "
            class="overflow-hidden rounded-2xl border border-slate-200"
          >
            <div class="border-b border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-slate-900">
                    {{ block.courseName }} -
                    {{ block.sectionCode || block.sectionName }}
                  </div>
                  <div class="mt-1 text-xs text-slate-600">
                    Sede actual: <b>{{ block.currentCampusName }}</b> |
                    Modalidad actual: <b>{{ block.currentModality }}</b>
                  </div>
                </div>
                <div class="space-y-1 text-right text-xs text-slate-500">
                  <div *ngFor="let week of block.weeks; trackBy: trackWeeklyWeek">
                    {{ formatWeekRange(week) }}
                  </div>
                </div>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="min-w-full text-xs">
                <thead class="bg-white">
                  <tr>
                    <th class="px-3 py-2 text-left">Carrera</th>
                    <th class="px-3 py-2 text-center">Semana 1</th>
                    <th class="px-3 py-2 text-center">Semana 2</th>
                    <th class="px-3 py-2 text-center">Semana 3</th>
                    <th class="px-3 py-2 text-right">Asistieron total</th>
                    <th class="px-3 py-2 text-right">Faltaron total</th>
                    <th class="px-3 py-2 text-right">% asistencia total</th>
                    <th class="px-3 py-2 text-right">% no asistencia total</th>
                    <th class="px-3 py-2 text-right">Aprobados</th>
                    <th class="px-3 py-2 text-right">Desaprobados</th>
                    <th class="px-3 py-2 text-right">% aprobados</th>
                    <th class="px-3 py-2 text-right">% desaprobados</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    *ngFor="
                      let career of block.careers;
                      trackBy: trackWeeklySummaryCareer
                    "
                    class="border-t border-slate-100"
                  >
                    <td class="px-3 py-2 font-medium text-slate-700">
                      {{ career.careerName }}
                    </td>
                    <td class="px-3 py-2 text-center">
                      {{ formatWeeklyCount(career.week1) }}
                    </td>
                    <td class="px-3 py-2 text-center">
                      {{ formatWeeklyCount(career.week2) }}
                    </td>
                    <td class="px-3 py-2 text-center">
                      {{ formatWeeklyCount(career.week3) }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.totalAttendedCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.totalAbsentCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.totalAttendancePct | number: '1.0-2' }}%
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.totalAbsencePct | number: '1.0-2' }}%
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.approvedCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.failedCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.approvedPct | number: '1.0-2' }}%
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ career.failedPct | number: '1.0-2' }}%
                    </td>
                  </tr>
                  <tr class="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                    <td class="px-3 py-2">TOTAL</td>
                    <td class="px-3 py-2 text-center">
                      {{ formatWeeklyCount(block.totals.week1) }}
                    </td>
                    <td class="px-3 py-2 text-center">
                      {{ formatWeeklyCount(block.totals.week2) }}
                    </td>
                    <td class="px-3 py-2 text-center">
                      {{ formatWeeklyCount(block.totals.week3) }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.totalAttendedCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.totalAbsentCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.totalAttendancePct | number: '1.0-2' }}%
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.totalAbsencePct | number: '1.0-2' }}%
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.approvedCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.failedCount }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.approvedPct | number: '1.0-2' }}%
                    </td>
                    <td class="px-3 py-2 text-right">
                      {{ block.totals.failedPct | number: '1.0-2' }}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminGradesReportsPage implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private periodSub?: Subscription;

  error: string | null = null;
  activeTab:
    | 'students'
    | 'averages'
    | 'attendance'
    | 'attendanceWeeklySummary' = 'students';
  exportingExcel = false;
  exportingPdf = false;

  reportFilters: GradesReportFilters = {
    periodId: '',
    faculties: [],
    campuses: [],
    careers: [],
  };
  reportFaculty = '';
  reportCampus = '';
  reportCareer = '';
  studentsReport: StudentsReportRow[] = [];
  averagesReport: AveragesReportRow[] = [];
  attendanceReport: AttendanceReportResponse = { dates: [], rows: [] };
  weeklyOriginCampus = '';
  weeklyFacultyGroup = '';
  weeklySourceModality = '';
  weeklyCourseName = '';
  weeklySummaryReport: WeeklySummaryResponse = createEmptyWeeklySummaryResponse();

  get currentPeriodLabel() {
    const period = this.adminPeriodContext.getSelectedPeriod();
    if (!period?.id) return 'Periodo operativo actual';
    return `${period.code} - ${period.name}`;
  }

  async ngOnInit() {
    await this.loadAll();
    this.periodSub = this.adminPeriodContext.changes$
      .pipe(skip(1))
      .subscribe(() => void this.loadAll());
  }

  ngOnDestroy() {
    this.periodSub?.unsubscribe();
  }

  trackText(_: number, item: string) {
    return item;
  }

  trackStudentReport(_: number, item: { studentId: string }) {
    return item.studentId;
  }

  trackFaculty(_: number, item: { facultyGroup: string }) {
    return item.facultyGroup;
  }

  trackWeeklySummaryBlock(_: number, item: { sectionCourseId: string }) {
    return item.sectionCourseId;
  }

  trackWeeklySummaryCareer(_: number, item: { careerName: string }) {
    return item.careerName;
  }

  trackWeeklyWeek(_: number, item: WeeklySummaryWeekRange) {
    return `${item.label}:${item.startDate || '-'}:${item.endDate || '-'}`;
  }

  attendanceLabel(status: 'ASISTIO' | 'FALTO' | '' | undefined) {
    if (status === 'ASISTIO') return 'SI';
    if (status === 'FALTO') return 'NO';
    return '-';
  }

  formatWeeklyCount(value: WeeklySummaryCount) {
    return `${Number(value?.attendedCount ?? 0)}/${Number(value?.absentCount ?? 0)}`;
  }

  formatWeekRange(value: WeeklySummaryWeekRange) {
    const label = String(value?.label ?? 'Semana').trim() || 'Semana';
    const startDate = String(value?.startDate ?? '').trim();
    if (!startDate) return `${label}: Sin fechas programadas`;
    return `${label}: ${this.formatWeekDisplayDate(startDate)}`;
  }

  private formatWeekDisplayDate(value: string) {
    const normalized = String(value ?? '').trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return normalized;
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
    const weekday = this.capitalizeFirstLetter(
      date.toLocaleDateString('es-PE', { weekday: 'long' })
    );
    return `${weekday} ${match[3]}/${match[2]}/${match[1]}`;
  }

  private capitalizeFirstLetter(value: string) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  async loadAll() {
    this.error = null;
    try {
      const filters = await firstValueFrom(
        this.http.get<GradesReportFilters>('/api/admin/grades/reports/filters')
      );
      this.reportFilters = filters;
      if (
        this.reportFaculty &&
        !filters.faculties.some((item) => item.facultyGroup === this.reportFaculty)
      ) {
        this.reportFaculty = '';
      }
      if (this.reportCampus && !filters.campuses.includes(this.reportCampus)) {
        this.reportCampus = '';
      }
      if (this.reportCareer && !filters.careers.includes(this.reportCareer)) {
        this.reportCareer = '';
      }
      await Promise.all([this.loadReports(true), this.loadWeeklySummary(true)]);
    } catch (e: any) {
      this.error = this.extractError(
        e,
        'No se pudo cargar reportes por carrera.'
      );
    } finally {
      this.cdr.detectChanges();
    }
  }

  async loadReports(skipDetectChanges = false) {
    this.error = null;
    try {
      const params = this.buildReportParams();
      const [students, averages, attendance] = await Promise.all([
        firstValueFrom(
          this.http.get<StudentsReportRow[]>('/api/admin/grades/reports/students', {
            params,
          })
        ),
        firstValueFrom(
          this.http.get<AveragesReportRow[]>('/api/admin/grades/reports/averages', {
            params,
          })
        ),
        firstValueFrom(
          this.http.get<AttendanceReportResponse>(
            '/api/admin/grades/reports/attendance',
            { params }
          )
        ),
      ]);
      this.studentsReport = students;
      this.averagesReport = averages;
      this.attendanceReport = attendance;
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudieron cargar los reportes.');
      this.studentsReport = [];
      this.averagesReport = [];
      this.attendanceReport = { dates: [], rows: [] };
    } finally {
      if (!skipDetectChanges) {
        this.cdr.detectChanges();
      }
    }
  }

  async loadWeeklySummary(skipDetectChanges = false) {
    this.error = null;
    try {
      const response = await firstValueFrom(
        this.http.get<WeeklySummaryResponse>(
          '/api/admin/grades/reports/attendance-weekly-summary',
          {
            params: this.buildWeeklySummaryParams(),
          }
        )
      );

      let shouldReload = false;
      if (
        this.weeklyOriginCampus &&
        !response.filters.originCampuses.includes(this.weeklyOriginCampus)
      ) {
        this.weeklyOriginCampus = '';
        shouldReload = true;
      }
      if (
        this.weeklyFacultyGroup &&
        !response.filters.faculties.some(
          (item) => item.facultyGroup === this.weeklyFacultyGroup
        )
      ) {
        this.weeklyFacultyGroup = '';
        shouldReload = true;
      }
      if (
        this.weeklySourceModality &&
        !response.filters.sourceModalities.includes(this.weeklySourceModality)
      ) {
        this.weeklySourceModality = '';
        shouldReload = true;
      }
      if (
        this.weeklyCourseName &&
        !response.filters.courses.includes(this.weeklyCourseName)
      ) {
        this.weeklyCourseName = '';
        shouldReload = true;
      }
      if (shouldReload) {
        await this.loadWeeklySummary(skipDetectChanges);
        return;
      }

      this.weeklySummaryReport = response;
    } catch (e: any) {
      this.error = this.extractError(
        e,
        'No se pudo cargar el resumen semanal.'
      );
      this.weeklySummaryReport = createEmptyWeeklySummaryResponse();
    } finally {
      if (!skipDetectChanges) {
        this.cdr.detectChanges();
      }
    }
  }

  async downloadActiveReport(format: 'excel' | 'pdf') {
    this.error = null;
    if (format === 'excel') {
      this.exportingExcel = true;
    } else {
      this.exportingPdf = true;
    }
    try {
      const suffix = format === 'excel' ? 'excel' : 'pdf';
      const extension = format === 'excel' ? 'xlsx' : 'pdf';
      let endpoint = '';
      let params = new HttpParams();

      if (this.activeTab === 'students') {
        endpoint = `/api/admin/grades/reports/students/export/${suffix}`;
        params = this.buildReportParams();
      } else if (this.activeTab === 'averages') {
        endpoint = `/api/admin/grades/reports/averages/export/${suffix}`;
        params = this.buildReportParams();
      } else if (this.activeTab === 'attendance') {
        endpoint = `/api/admin/grades/reports/attendance/export/${suffix}`;
        params = this.buildReportParams();
      } else {
        endpoint = `/api/admin/grades/reports/attendance-weekly-summary/export/${suffix}`;
        params = this.buildWeeklySummaryParams();
      }

      const response = await firstValueFrom(
        this.http.get(endpoint, {
          observe: 'response',
          params,
          responseType: 'blob',
        })
      );
      const blob = response.body;
      if (!blob) {
        throw new Error('No se recibio archivo para descargar.');
      }
      const fileName = this.extractDownloadFileName(
        response.headers.get('content-disposition'),
        this.buildDownloadFileName(extension)
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudo descargar el reporte.');
    } finally {
      this.exportingExcel = false;
      this.exportingPdf = false;
      this.cdr.detectChanges();
    }
  }

  private buildReportParams() {
    let params = new HttpParams();
    if (this.reportFaculty) params = params.set('facultyGroup', this.reportFaculty);
    if (this.reportCampus) params = params.set('campusName', this.reportCampus);
    if (this.reportCareer) params = params.set('careerName', this.reportCareer);
    return params;
  }

  private buildWeeklySummaryParams() {
    let params = new HttpParams();
    if (this.weeklyOriginCampus) {
      params = params.set('originCampus', this.weeklyOriginCampus);
    }
    if (this.weeklyFacultyGroup) {
      params = params.set('facultyGroup', this.weeklyFacultyGroup);
    }
    if (this.weeklySourceModality) {
      params = params.set('sourceModality', this.weeklySourceModality);
    }
    if (this.weeklyCourseName) {
      params = params.set('courseName', this.weeklyCourseName);
    }
    return params;
  }

  private buildDownloadFileName(extension: 'xlsx' | 'pdf') {
    const period = this.adminPeriodContext.getSelectedPeriod();
    const periodPart = this.sanitizeFilePart(period?.code ?? 'periodo');
    const filters =
      this.activeTab === 'attendanceWeeklySummary'
        ? [
            this.weeklyOriginCampus,
            this.weeklyFacultyGroup,
            this.weeklySourceModality,
            this.weeklyCourseName,
          ]
        : [this.reportFaculty, this.reportCampus, this.reportCareer];
    const filterPart = filters
      .map((item) => this.sanitizeFilePart(item))
      .filter(Boolean)
      .join('_');
    const base =
      this.activeTab === 'students'
        ? 'reporte_alumnado'
        : this.activeTab === 'averages'
          ? 'reporte_promedios'
          : this.activeTab === 'attendance'
            ? 'reporte_asistencia'
            : 'reporte_resumen_semanal';
    const fileName = [base, periodPart, filterPart]
      .filter(Boolean)
      .join('_')
      .replace(/\s+/g, '_');
    return `${fileName}.${extension}`;
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
    return (
      String(value ?? '').trim().replace(/[\\/:*?"<>|]+/g, '_') || 'archivo'
    );
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
      .toLowerCase();
  }

  private extractError(error: any, fallback: string) {
    const err = error?.error;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    if (err?.message && typeof err.message === 'object') {
      return JSON.stringify(err.message);
    }
    return String(error?.message ?? fallback);
  }
}
