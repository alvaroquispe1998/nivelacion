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

      <div *ngIf="error" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ error }}
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-5">
        <div class="grid gap-2 md:grid-cols-3">
          <label class="text-xs font-semibold text-slate-700">
            Facultad
            <select class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" [(ngModel)]="reportFaculty" (ngModelChange)="loadReports()">
              <option value="">Todas</option>
              <option *ngFor="let f of reportFilters.faculties; trackBy: trackFaculty" [value]="f.facultyGroup">{{ f.facultyName }}</option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Sede
            <select class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" [(ngModel)]="reportCampus" (ngModelChange)="loadReports()">
              <option value="">Todas</option>
              <option *ngFor="let c of reportFilters.campuses; trackBy: trackText" [value]="c">{{ c }}</option>
            </select>
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Carrera
            <select class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" [(ngModel)]="reportCareer" (ngModelChange)="loadReports()">
              <option value="">Todas</option>
              <option *ngFor="let c of reportFilters.careers; trackBy: trackText" [value]="c">{{ c }}</option>
            </select>
          </label>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            [ngClass]="activeTab === 'students' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
            (click)="activeTab = 'students'"
          >
            Total alumnado por carrera
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            [ngClass]="activeTab === 'averages' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
            (click)="activeTab = 'averages'"
          >
            Promedio del alumno
          </button>
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-xs font-semibold"
            [ngClass]="activeTab === 'attendance' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
            (click)="activeTab = 'attendance'"
          >
            Asistencia por carrera
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
                <tr *ngFor="let row of studentsReport; trackBy: trackStudentReport" class="border-t border-slate-100">
                  <td class="px-3 py-2">{{ row.dni }}</td>
                  <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                  <td class="px-3 py-2">{{ row.fullName }}</td>
                  <td class="px-3 py-2">{{ row.careerName || 'SIN CARRERA' }}</td>
                </tr>
                <tr *ngIf="studentsReport.length === 0"><td colspan="4" class="px-3 py-4 text-center text-slate-500">Sin datos</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-4" *ngIf="activeTab === 'averages'">
          <div class="text-sm font-semibold">Reporte de nota promedio del alumno</div>
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
                <tr *ngFor="let row of averagesReport; trackBy: trackStudentReport" class="border-t border-slate-100">
                  <td class="px-3 py-2">{{ row.dni }}</td>
                  <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                  <td class="px-3 py-2">{{ row.fullName }}</td>
                  <td class="px-3 py-2 text-right">{{ row.average | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-center">{{ row.approved }}</td>
                </tr>
                <tr *ngIf="averagesReport.length === 0"><td colspan="5" class="px-3 py-4 text-center text-slate-500">Sin datos</td></tr>
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
                  <th class="px-3 py-2 text-center" *ngFor="let date of attendanceReport.dates; trackBy: trackText">{{ date }}</th>
                  <th class="px-3 py-2 text-right">Asistencias totales</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let row of attendanceReport.rows; trackBy: trackStudentReport" class="border-t border-slate-100">
                  <td class="px-3 py-2">{{ row.dni }}</td>
                  <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                  <td class="px-3 py-2">{{ row.fullName }}</td>
                  <td class="px-3 py-2">{{ row.careerName || 'SIN CARRERA' }}</td>
                  <td class="px-3 py-2 text-center" *ngFor="let date of attendanceReport.dates; trackBy: trackText">
                    {{ attendanceLabel(row.attendanceByDate[date]) }}
                  </td>
                  <td class="px-3 py-2 text-right font-semibold">{{ row.totalAsistencias }}</td>
                </tr>
                <tr *ngIf="attendanceReport.rows.length === 0">
                  <td [attr.colspan]="5 + attendanceReport.dates.length" class="px-3 py-4 text-center text-slate-500">Sin datos</td>
                </tr>
              </tbody>
            </table>
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
  activeTab: 'students' | 'averages' | 'attendance' = 'students';
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

  attendanceLabel(status: 'ASISTIO' | 'FALTO' | '' | undefined) {
    if (status === 'ASISTIO') return 'SI';
    if (status === 'FALTO') return 'NO';
    return '-';
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
        !filters.faculties.some((x) => x.facultyGroup === this.reportFaculty)
      ) {
        this.reportFaculty = '';
      }
      if (this.reportCampus && !filters.campuses.includes(this.reportCampus)) {
        this.reportCampus = '';
      }
      if (this.reportCareer && !filters.careers.includes(this.reportCareer)) {
        this.reportCareer = '';
      }
      await this.loadReports();
    } catch (e: any) {
      this.error = this.extractError(e, 'No se pudo cargar reportes por carrera.');
      this.cdr.detectChanges();
    }
  }

  async loadReports() {
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
      this.cdr.detectChanges();
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
      const endpoint =
        this.activeTab === 'students'
          ? `/api/admin/grades/reports/students/export/${suffix}`
          : this.activeTab === 'averages'
            ? `/api/admin/grades/reports/averages/export/${suffix}`
            : `/api/admin/grades/reports/attendance/export/${suffix}`;
      const response = await firstValueFrom(
        this.http.get(endpoint, {
          observe: 'response',
          params: this.buildReportParams(),
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

  private buildDownloadFileName(extension: 'xlsx' | 'pdf') {
    const period = this.adminPeriodContext.getSelectedPeriod();
    const periodPart = this.sanitizeFilePart(period?.code ?? 'periodo');
    const filters = [this.reportFaculty, this.reportCampus, this.reportCareer]
      .map((item) => this.sanitizeFilePart(item))
      .filter(Boolean)
      .join('_');
    const base =
      this.activeTab === 'students'
        ? 'reporte_alumnado'
        : this.activeTab === 'averages'
          ? 'reporte_promedios'
          : 'reporte_asistencia';
    const fileName = [base, periodPart, filters]
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
