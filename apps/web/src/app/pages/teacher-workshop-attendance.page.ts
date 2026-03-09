import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttendanceStatus } from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import { PrivateRouteContextService } from '../core/navigation/private-route-context.service';

interface WorkshopScheduleBlock {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface TeacherWorkshopGroup {
  applicationId: string;
  workshopId: string;
  workshopName: string;
  deliveryMode: string;
  venueCampusName: string | null;
  responsibleTeacherName: string | null;
  applicationGroupId: string;
  sourceGroupId: string | null;
  groupCode: string | null;
  groupName: string | null;
  groupIndex: number;
  studentCount: number;
  scheduleSummary: string;
  scheduleBlocks: WorkshopScheduleBlock[];
}

interface TeacherWorkshopAttendanceStudent {
  id: string;
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
  careerName: string | null;
  campusName: string | null;
  status: AttendanceStatus;
  notes?: string | null;
}

interface TeacherWorkshopAttendanceResponse {
  applicationId: string;
  applicationGroupId: string;
  workshopId: string;
  workshopName: string;
  groupName: string;
  sessionDate: string;
  scheduleBlocks: WorkshopScheduleBlock[];
  students: TeacherWorkshopAttendanceStudent[];
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="text-xl font-semibold">Asistencia de taller</div>
          <div class="text-sm text-slate-600">
            {{ workshopLabel }}
          </div>
        </div>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="loadGroups()"
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

    <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <label class="block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Grupo del taller
          </div>
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            [(ngModel)]="selectedGroupId"
            (ngModelChange)="onGroupChange()"
          >
            <option value="">Seleccionar grupo</option>
            <option *ngFor="let group of groups; trackBy: trackGroup" [value]="group.applicationGroupId">
              {{ group.groupName || group.groupCode || 'Grupo' }}
            </option>
          </select>
        </label>

        <label class="mt-4 block">
          <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Fecha
          </div>
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            [(ngModel)]="selectedDate"
            (ngModelChange)="onDateChange()"
          >
            <option value="">Seleccionar fecha</option>
            <option
              *ngFor="let option of availableDateOptions; trackBy: trackDateOption"
              [value]="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Horario valido</div>
          <div class="mt-2 text-sm text-slate-700">
            {{ selectedGroup?.scheduleSummary || 'Selecciona un grupo para ver su horario.' }}
          </div>
        </div>

        <div
          *ngIf="selectedDate && selectedGroup && !selectedDateAllowed"
          class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          La fecha elegida no coincide con el horario configurado del grupo.
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <div class="text-sm font-semibold">Registro por grupo y fecha</div>
            <div class="text-xs text-slate-600">
              Alumnos: {{ students.length }} | Fecha activa: {{ selectedDate || '-' }}
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
              (click)="markAllPresent()"
              [disabled]="!selectedDateAllowed || students.length === 0"
            >
              Asistieron todos
            </button>
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
              (click)="markAllAbsent()"
              [disabled]="!selectedDateAllowed || students.length === 0"
            >
              Faltaron todos
            </button>
            <button
              class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 min-w-[150px]"
              (click)="save()"
              [disabled]="saving || !selectedDateAllowed || students.length === 0"
            >
              {{ saving ? 'Guardando...' : 'Guardar asistencia' }}
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-4 py-3">Alumno</th>
                <th class="px-4 py-3">DNI</th>
                <th class="px-4 py-3">Codigo</th>
                <th class="px-4 py-3">Asistio</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let student of students; trackBy: trackStudent" class="border-t border-slate-100">
                <td class="px-4 py-3 font-medium">{{ student.fullName }}</td>
                <td class="px-4 py-3 text-slate-700">{{ student.dni || '-' }}</td>
                <td class="px-4 py-3 text-slate-700">{{ student.codigoAlumno || 'SIN CODIGO' }}</td>
                <td class="px-4 py-3">
                  <input
                    type="checkbox"
                    class="h-4 w-4 cursor-pointer accent-slate-900"
                    [checked]="student.status === AttendanceStatus.ASISTIO"
                    (change)="toggleStatus(student.id, $event)"
                    [disabled]="!selectedDateAllowed"
                  />
                </td>
              </tr>
              <tr *ngIf="students.length === 0" class="border-t border-slate-100">
                <td class="px-4 py-6 text-slate-600" colspan="4">
                  Selecciona un grupo y una fecha valida para cargar alumnos.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class TeacherWorkshopAttendancePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly routeContext = inject(PrivateRouteContextService);

  readonly AttendanceStatus = AttendanceStatus;

  applicationId = '';
  groups: TeacherWorkshopGroup[] = [];
  students: TeacherWorkshopAttendanceStudent[] = [];
  selectedGroupId = '';
  selectedDate = '';
  error: string | null = null;
  success: string | null = null;
  saving = false;

  get selectedGroup() {
    return this.groups.find((group) => group.applicationGroupId === this.selectedGroupId) ?? null;
  }

  get selectedDateAllowed() {
    const group = this.selectedGroup;
    const date = String(this.selectedDate ?? '').trim();
    return Boolean(group && date && this.availableDateOptions.some((option) => option.value === date));
  }

  get availableDateOptions() {
    return this.buildAvailableDateOptions(this.selectedGroup);
  }

  get workshopLabel() {
    const first = this.groups[0];
    if (!first) return 'Selecciona un taller aplicado';
    return `${first.workshopName}`;
  }

  async ngOnInit() {
    const context = this.routeContext.getTeacherWorkshopAttendanceFocus();
    this.applicationId = String(context?.applicationId ?? '').trim();
    this.selectedGroupId = String(context?.applicationGroupId ?? '').trim();
    this.selectedDate = this.localTodayIso();
    await this.loadGroups();
  }

  trackGroup(_: number, item: TeacherWorkshopGroup) {
    return item.applicationGroupId;
  }

  trackStudent(_: number, item: TeacherWorkshopAttendanceStudent) {
    return item.id;
  }

  trackDateOption(_: number, item: { value: string; label: string }) {
    return item.value;
  }

  async loadGroups() {
    this.error = null;
    this.success = null;
    this.students = [];
    if (!this.applicationId) {
      this.error = 'Selecciona un taller desde Mis talleres.';
      this.cdr.detectChanges();
      return;
    }
    try {
      this.groups = await firstValueFrom(
        this.http.get<TeacherWorkshopGroup[]>(
          `/api/teacher/workshops/${encodeURIComponent(this.applicationId)}/groups`
        )
      );
      if (!this.selectedGroupId && this.groups.length > 0) {
        this.selectedGroupId = this.groups[0].applicationGroupId;
      }
      this.ensureSuggestedDateForSelectedGroup();
      await this.onSelectionChange();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar los grupos del taller.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onGroupChange() {
    this.ensureSuggestedDateForSelectedGroup();
    await this.onSelectionChange();
  }

  async onDateChange() {
    await this.onSelectionChange();
  }

  async onSelectionChange() {
    this.error = null;
    this.success = null;
    this.students = [];
    if (!this.selectedGroup || !this.selectedDate || !this.selectedDateAllowed) {
      this.cdr.detectChanges();
      return;
    }
    try {
      const response = await firstValueFrom(
        this.http.get<TeacherWorkshopAttendanceResponse>(
          `/api/teacher/workshop-attendance?applicationGroupId=${encodeURIComponent(
            this.selectedGroupId
          )}&date=${encodeURIComponent(this.selectedDate)}`
        )
      );
      this.students = response.students ?? [];
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar la asistencia del taller.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  toggleStatus(studentId: string, event: Event) {
    const target = event.target as HTMLInputElement;
    this.students = this.students.map((student) =>
      student.id === studentId
        ? {
            ...student,
            status: target.checked ? AttendanceStatus.ASISTIO : AttendanceStatus.FALTO,
          }
        : student
    );
  }

  markAllPresent() {
    this.students = this.students.map((student) => ({
      ...student,
      status: AttendanceStatus.ASISTIO,
    }));
  }

  markAllAbsent() {
    this.students = this.students.map((student) => ({
      ...student,
      status: AttendanceStatus.FALTO,
    }));
  }

  async save() {
    if (!this.selectedGroupId || !this.selectedDateAllowed || this.students.length === 0) {
      return;
    }
    this.saving = true;
    this.error = null;
    this.success = null;
    try {
      const response = await firstValueFrom(
        this.http.put<TeacherWorkshopAttendanceResponse>('/api/teacher/workshop-attendance', {
          applicationGroupId: this.selectedGroupId,
          sessionDate: this.selectedDate,
          items: this.students.map((student) => ({
            studentId: student.id,
            status: student.status,
          })),
        })
      );
      this.students = response.students ?? [];
      this.success = `Asistencia guardada para ${this.selectedDate}.`;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar la asistencia del taller.';
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private isoDayOfWeek(value: string) {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 0;
    const day = parsed.getDay();
    return day === 0 ? 7 : day;
  }

  private isDateAllowedForGroup(group: TeacherWorkshopGroup | null, date: string) {
    if (!group || !date) return false;
    return this.buildAvailableDateOptions(group).some((option) => option.value === date);
  }

  private ensureSuggestedDateForSelectedGroup() {
    const group = this.selectedGroup;
    if (!group) return;
    if (this.isDateAllowedForGroup(group, this.selectedDate)) return;
    const suggested = this.buildAvailableDateOptions(group)[0]?.value ?? '';
    if (suggested) {
      this.selectedDate = suggested;
    }
  }

  private buildAvailableDateOptions(group: TeacherWorkshopGroup | null) {
    if (!group) return [] as Array<{ value: string; label: string }>;
    const values = new Set<string>();
    for (const block of group.scheduleBlocks) {
      for (const date of this.expandBlockDates(block)) {
        values.add(date);
      }
    }
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({
        value,
        label: this.formatDateLabel(value),
      }));
  }

  private expandBlockDates(block: WorkshopScheduleBlock) {
    const exactStart = String(block.startDate ?? '').trim();
    const exactEnd = String(block.endDate ?? '').trim();
    if (exactStart && exactEnd && exactStart === exactEnd) {
      return [exactStart];
    }
    const start = exactStart || this.localTodayIso();
    const end = exactEnd || exactStart;
    if (!start || !end) return [] as string[];
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return [] as string[];
    }
    const result: string[] = [];
    const current = new Date(startDate);
    let guard = 0;
    while (current <= endDate && guard < 370) {
      const value = this.toIsoDateOnly(current);
      if (this.isoDayOfWeek(value) === Number(block.dayOfWeek ?? 0)) {
        result.push(value);
      }
      current.setDate(current.getDate() + 1);
      guard += 1;
    }
    return result;
  }

  private formatDateLabel(value: string) {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const day = days[parsed.getDay()] ?? '';
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${day} ${dd}/${mm}/${yyyy}`;
  }

  private toIsoDateOnly(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private localTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
