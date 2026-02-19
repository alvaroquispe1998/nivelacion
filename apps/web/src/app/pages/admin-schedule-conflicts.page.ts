import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  AdminReassignmentOption,
  AdminReassignmentResult,
  AdminScheduleConflictBlock,
  AdminScheduleConflictItem,
} from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import { DAYS } from '../shared/days';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Cruces de horario</div>
        <div class="text-sm text-slate-600">
          Detecta alumnos con traslape de horario y permite reubicarlos por curso.
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
      <div class="grid gap-2 sm:grid-cols-4">
        <label class="text-xs text-slate-700">
          Facultad
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="facultyFilter"
            (ngModelChange)="onFacultyChange()"
          >
            <option value="">Todas</option>
            <option *ngFor="let f of faculties; trackBy: trackText" [value]="f">
              {{ f }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Sede
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
            [(ngModel)]="campusFilter"
            (ngModelChange)="onCampusChange()"
            [disabled]="!facultyFilter"
          >
            <option value="">Todas</option>
            <option *ngFor="let c of campuses; trackBy: trackText" [value]="c">
              {{ c }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Curso
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:bg-slate-100"
            [(ngModel)]="courseFilter"
            [disabled]="!facultyFilter || !campusFilter"
          >
            <option value="">Todos</option>
            <option *ngFor="let c of courses; trackBy: trackText" [value]="c">
              {{ c }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Codigo alumno
          <input
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-slate-400"
            [(ngModel)]="studentCodeFilter"
            placeholder="Ej: 20260001"
          />
        </label>
      </div>

      <div class="mt-3 flex justify-end">
        <button
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          [disabled]="loading"
          (click)="loadConflicts()"
        >
          {{ loading ? 'Cargando...' : 'Buscar cruces' }}
        </button>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white">
      <div class="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
        Resultados: {{ conflicts.length }}
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Codigo</th>
              <th class="px-4 py-3">Alumno</th>
              <th class="px-4 py-3">Bloque A</th>
              <th class="px-4 py-3">Bloque B</th>
              <th class="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let it of conflicts; trackBy: trackConflict" class="border-t border-slate-100 align-top">
              <td class="px-4 py-3 font-mono text-xs">{{ studentCode(it.studentCode) }}</td>
              <td class="px-4 py-3 font-medium">{{ it.studentName }}</td>
              <td class="px-4 py-3 text-xs">
                <div class="font-semibold">{{ blockTitle(it.blockA) }}</div>
                <div>{{ dayLabel(it.dayOfWeek) }} {{ it.blockA.startTime }}-{{ it.blockA.endTime }}</div>
                <div class="text-slate-500">{{ formatDateRange(it.blockA.startDate, it.blockA.endDate) }}</div>
              </td>
              <td class="px-4 py-3 text-xs">
                <div class="font-semibold">{{ blockTitle(it.blockB) }}</div>
                <div>{{ dayLabel(it.dayOfWeek) }} {{ it.blockB.startTime }}-{{ it.blockB.endTime }}</div>
                <div class="text-slate-500">{{ formatDateRange(it.blockB.startDate, it.blockB.endDate) }}</div>
              </td>
              <td class="px-4 py-3 text-xs">
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="openReassignModal(it, 'A')"
                  >
                    Reubicar A
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="openReassignModal(it, 'B')"
                  >
                    Reubicar B
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="!loading && conflicts.length === 0" class="border-t border-slate-100">
              <td class="px-4 py-5 text-slate-500" colspan="5">
                Sin cruces para los filtros seleccionados.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div
      *ngIf="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeReassignModal()"
    >
      <div
        class="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">Reubicar alumno</div>
            <div class="text-xs text-slate-600">
              {{ modalStudentName }} ({{ studentCode(modalStudentCode) }}) |
              Origen: {{ modalFromLabel }}
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

        <div *ngIf="modalError" class="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ modalError }}
        </div>
        <div
          *ngIf="modalWarning"
          class="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {{ modalWarning }}
        </div>

        <div class="max-h-[65vh] overflow-auto p-5">
          <table class="min-w-full text-sm">
            <thead class="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-2"></th>
                <th class="px-3 py-2">Seccion destino</th>
                <th class="px-3 py-2">Curso</th>
                <th class="px-3 py-2">Aforo</th>
                <th class="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let opt of modalOptions; trackBy: trackOption" class="border-t border-slate-100">
                <td class="px-3 py-2">
                  <input
                    type="radio"
                    name="targetSectionCourse"
                    [value]="opt.sectionCourseId"
                    [checked]="selectedTargetSectionCourseId === opt.sectionCourseId"
                    (change)="onTargetChange(opt.sectionCourseId)"
                  />
                </td>
                <td class="px-3 py-2 font-medium">
                  {{ opt.sectionCode || opt.sectionName }}
                </td>
                <td class="px-3 py-2 text-xs">{{ opt.courseName }}</td>
                <td class="px-3 py-2 text-xs">
                  {{ opt.currentStudents }} -> {{ opt.projectedStudents }}
                  <span class="text-slate-500">
                    / {{ capacityLabel(opt.initialCapacity, opt.maxExtraCapacity) }}
                  </span>
                </td>
                <td class="px-3 py-2 text-xs">
                  <span
                    *ngIf="opt.createsConflict"
                    class="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700"
                  >
                    Genera cruce
                  </span>
                  <span
                    *ngIf="!opt.createsConflict && opt.overCapacity"
                    class="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                  >
                    Sobre aforo
                  </span>
                  <span
                    *ngIf="!opt.createsConflict && !opt.overCapacity"
                    class="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                  >
                    Ok
                  </span>
                </td>
              </tr>
              <tr *ngIf="modalOptions.length === 0">
                <td colspan="5" class="px-3 py-4 text-sm text-slate-500">
                  No hay secciones destino disponibles con misma facultad, sede y modalidad.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
            [disabled]="reassigning"
            (click)="closeReassignModal()"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            [disabled]="reassigning || !selectedTarget || selectedTarget.createsConflict"
            (click)="submitReassign(false)"
          >
            {{ reassigning ? 'Guardando...' : 'Reubicar' }}
          </button>
          <button
            *ngIf="needsOverCapacityConfirmation"
            type="button"
            class="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            [disabled]="reassigning || !selectedTarget || selectedTarget.createsConflict"
            (click)="submitReassign(true)"
          >
            Confirmar sobreaforo
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminScheduleConflictsPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly days = DAYS;

  faculties: string[] = [];
  campuses: string[] = [];
  courses: string[] = [];

  facultyFilter = '';
  campusFilter = '';
  courseFilter = '';
  studentCodeFilter = '';

  conflicts: AdminScheduleConflictItem[] = [];
  loading = false;
  error: string | null = null;

  modalOpen = false;
  modalStudentId = '';
  modalStudentName = '';
  modalStudentCode: string | null = null;
  modalFromSectionCourseId = '';
  modalFromLabel = '';
  modalOptions: AdminReassignmentOption[] = [];
  selectedTargetSectionCourseId = '';
  reassigning = false;
  modalError: string | null = null;
  modalWarning: string | null = null;
  needsOverCapacityConfirmation = false;

  get selectedTarget() {
    return (
      this.modalOptions.find((opt) => opt.sectionCourseId === this.selectedTargetSectionCourseId) ??
      null
    );
  }

  async ngOnInit() {
    await this.reloadAll();
  }

  trackText(_: number, item: string) {
    return item;
  }

  trackConflict(_: number, item: AdminScheduleConflictItem) {
    return `${item.studentId}:${item.blockA.blockId}:${item.blockB.blockId}`;
  }

  trackOption(_: number, item: AdminReassignmentOption) {
    return item.sectionCourseId;
  }

  dayLabel(dayOfWeek: number) {
    return this.days.find((d) => d.dayOfWeek === dayOfWeek)?.label ?? String(dayOfWeek);
  }

  studentCode(value?: string | null) {
    const code = String(value ?? '').trim();
    return code || 'SIN CODIGO';
  }

  blockTitle(block: AdminScheduleConflictBlock) {
    return `${block.sectionCode || block.sectionName} | ${block.courseName}`;
  }

  formatDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate) return `${startDate} a ${endDate}`;
    if (startDate) return `Desde ${startDate}`;
    if (endDate) return `Hasta ${endDate}`;
    return 'Sin rango';
  }

  capacityLabel(initialCapacity: number, maxExtraCapacity: number) {
    if (Number(maxExtraCapacity ?? 0) > 0) {
      return String(Number(initialCapacity ?? 0) + Number(maxExtraCapacity ?? 0));
    }
    return `${Number(initialCapacity ?? 0)}+`;
  }

  async reloadAll() {
    this.error = null;
    try {
      this.faculties = await firstValueFrom(this.http.get<string[]>('/api/admin/sections/filters/faculties'));
      if (this.facultyFilter) {
        await this.loadCampuses();
      } else {
        this.campuses = [];
        this.campusFilter = '';
      }
      if (this.facultyFilter && this.campusFilter) {
        await this.loadCourses();
      } else {
        this.courses = [];
        this.courseFilter = '';
      }
      await this.loadConflicts();
    } catch (e: any) {
      this.error = this.getErrorMessage(e, 'No se pudo cargar filtros de cruces');
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onFacultyChange() {
    this.campusFilter = '';
    this.courseFilter = '';
    this.courses = [];
    if (!this.facultyFilter) {
      this.campuses = [];
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadCampuses();
    } catch (e: any) {
      this.error = this.getErrorMessage(e, 'No se pudo cargar sedes');
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onCampusChange() {
    this.courseFilter = '';
    if (!this.facultyFilter || !this.campusFilter) {
      this.courses = [];
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadCourses();
    } catch (e: any) {
      this.error = this.getErrorMessage(e, 'No se pudo cargar cursos');
    } finally {
      this.cdr.detectChanges();
    }
  }

  async loadConflicts() {
    this.loading = true;
    this.error = null;
    try {
      let params = new HttpParams();
      if (this.facultyFilter) params = params.set('facultyGroup', this.facultyFilter);
      if (this.campusFilter) params = params.set('campusName', this.campusFilter);
      if (this.courseFilter) params = params.set('courseName', this.courseFilter);
      if (this.studentCodeFilter.trim()) {
        params = params.set('studentCode', this.studentCodeFilter.trim());
      }
      this.conflicts = await firstValueFrom(
        this.http.get<AdminScheduleConflictItem[]>('/api/admin/sections/schedule-conflicts', {
          params,
        })
      );
    } catch (e: any) {
      this.conflicts = [];
      this.error = this.getErrorMessage(e, 'No se pudo cargar cruces de horario');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async openReassignModal(conflict: AdminScheduleConflictItem, side: 'A' | 'B') {
    const block = side === 'A' ? conflict.blockA : conflict.blockB;
    this.modalOpen = true;
    this.modalStudentId = conflict.studentId;
    this.modalStudentName = conflict.studentName;
    this.modalStudentCode = conflict.studentCode ?? null;
    this.modalFromSectionCourseId = block.sectionCourseId;
    this.modalFromLabel = this.blockTitle(block);
    this.modalOptions = [];
    this.selectedTargetSectionCourseId = '';
    this.modalError = null;
    this.modalWarning = null;
    this.needsOverCapacityConfirmation = false;
    this.reassigning = false;

    try {
      let params = new HttpParams()
        .set('studentId', this.modalStudentId)
        .set('fromSectionCourseId', this.modalFromSectionCourseId);
      this.modalOptions = await firstValueFrom(
        this.http.get<AdminReassignmentOption[]>(
          '/api/admin/sections/schedule-conflicts/reassignment-options',
          { params }
        )
      );
      const firstUsable = this.modalOptions.find((x) => !x.createsConflict);
      this.selectedTargetSectionCourseId = firstUsable?.sectionCourseId ?? '';
    } catch (e: any) {
      this.modalError = this.getErrorMessage(e, 'No se pudo cargar opciones de reubicacion');
    } finally {
      this.cdr.detectChanges();
    }
  }

  closeReassignModal() {
    this.modalOpen = false;
    this.modalStudentId = '';
    this.modalStudentName = '';
    this.modalStudentCode = null;
    this.modalFromSectionCourseId = '';
    this.modalFromLabel = '';
    this.modalOptions = [];
    this.selectedTargetSectionCourseId = '';
    this.reassigning = false;
    this.modalError = null;
    this.modalWarning = null;
    this.needsOverCapacityConfirmation = false;
  }

  async submitReassign(confirmOverCapacity: boolean) {
    const target = this.selectedTarget;
    if (!target) return;
    if (target.createsConflict) {
      this.modalError = 'Selecciona una seccion destino que no genere nuevos cruces.';
      this.cdr.detectChanges();
      return;
    }

    this.reassigning = true;
    this.modalError = null;
    this.modalWarning = null;
    try {
      await firstValueFrom(
        this.http.post<AdminReassignmentResult>('/api/admin/sections/schedule-conflicts/reassign', {
          studentId: this.modalStudentId,
          fromSectionCourseId: this.modalFromSectionCourseId,
          toSectionCourseId: target.sectionCourseId,
          confirmOverCapacity,
        })
      );
      this.closeReassignModal();
      await this.loadConflicts();
    } catch (e: any) {
      const status = Number(e?.status ?? 0);
      const message = this.getErrorMessage(e, 'No se pudo reubicar al alumno');
      if (status === 409 && message.toLowerCase().includes('exceeds capacity')) {
        this.needsOverCapacityConfirmation = true;
        this.modalWarning = message;
      } else {
        this.modalError = message;
      }
    } finally {
      this.reassigning = false;
      this.cdr.detectChanges();
    }
  }

  onTargetChange(sectionCourseId: string) {
    this.selectedTargetSectionCourseId = sectionCourseId;
    this.modalError = null;
    this.modalWarning = null;
    this.needsOverCapacityConfirmation = false;
  }

  private async loadCampuses() {
    const params = new HttpParams().set('facultyGroup', this.facultyFilter);
    this.campuses = await firstValueFrom(
      this.http.get<string[]>('/api/admin/sections/filters/campuses', { params })
    );
  }

  private async loadCourses() {
    const params = new HttpParams()
      .set('facultyGroup', this.facultyFilter)
      .set('campusName', this.campusFilter);
    this.courses = await firstValueFrom(
      this.http.get<string[]>('/api/admin/sections/filters/courses', { params })
    );
  }

  private getErrorMessage(error: any, fallback: string) {
    const raw = error?.error?.message ?? error?.message;
    if (Array.isArray(raw)) return raw.join(', ');
    const text = String(raw ?? '').trim();
    return text || fallback;
  }
}
