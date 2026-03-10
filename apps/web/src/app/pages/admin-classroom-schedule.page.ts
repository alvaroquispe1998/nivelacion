import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Role } from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import { DAYS, minutesFromHHmm } from '../shared/days';
import { AuthService } from '../core/auth/auth.service';

interface CampusOption {
  id: string;
  name: string;
}

interface ClassroomOption {
  id: string;
  code: string | null;
  name: string | null;
}

interface ClassroomScheduleItem {
  id: string;
  classroomId: string;
  classroomCode: string | null;
  classroomName: string | null;
  sectionCourseId: string;
  sectionCode: string | null;
  sectionName: string;
  courseName: string;
  teacherName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface ClassroomScheduleResponse {
  classroomId: string;
  classroomCode: string | null;
  classroomName: string | null;
  items: ClassroomScheduleItem[];
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xl font-semibold">Horario por aula</div>
        <div class="text-sm text-slate-600">
          Consulta la ocupacion semanal de un aula segun la sede seleccionada.
        </div>
      </div>
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-sm text-slate-700">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sede</span>
          <select
            class="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            [value]="selectedCampusName"
            (change)="onCampusChange(($any($event.target)).value)"
          >
            <option value="">Selecciona una sede</option>
            <option *ngFor="let campus of campuses" [value]="campus.name">{{ campus.name }}</option>
          </select>
        </label>

        <label class="text-sm text-slate-700">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Aula</span>
          <select
            class="min-w-[260px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            [disabled]="!selectedCampusName || classrooms.length === 0"
            [value]="selectedClassroomId"
            (change)="onClassroomChange(($any($event.target)).value)"
          >
            <option value="">{{ classroomPlaceholder }}</option>
            <option *ngFor="let classroom of classrooms" [value]="classroom.id">
              {{ classroomLabel(classroom) }}
            </option>
          </select>
        </label>

        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="load()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div *ngIf="selectedCampusName && !selectedClassroomId && classrooms.length === 0" class="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600">
      No hay aulas con horario asignado en la sede seleccionada.
    </div>

    <div *ngIf="!selectedCampusName" class="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600">
      Selecciona una sede para cargar las aulas con horario.
    </div>

    <div *ngIf="selectedCampusName && selectedClassroomId" class="mt-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-lg font-semibold">
            {{ selectedClassroomTitle || 'Horario semanal' }}
          </div>
          <div class="text-sm text-slate-600">
            {{ scheduleItems.length }} bloque(s) programado(s)
          </div>
        </div>
      </div>

      <div class="mt-5 overflow-x-auto">
        <div class="min-w-[980px] rounded-2xl border border-slate-200 bg-white">
          <div class="grid grid-cols-[84px_repeat(7,minmax(0,1fr))] border-b border-slate-200">
            <div class="p-3 text-xs font-semibold text-slate-600">Hora</div>
            <div
              *ngFor="let d of days"
              class="border-l border-slate-200 p-3 text-xs font-semibold text-slate-700"
            >
              {{ d.label }}
            </div>
          </div>

          <div class="grid grid-cols-[84px_repeat(7,minmax(0,1fr))]">
            <div class="border-r border-slate-200">
              <div
                *ngFor="let t of timeRows; let i = index"
                class="flex h-6 items-start px-3 text-[11px] text-slate-500"
                [class.border-t]="i > 0"
                [class.border-slate-100]="i > 0"
              >
                <span *ngIf="t">{{ t }}</span>
              </div>
            </div>

            <div
              class="relative col-span-7 grid"
              [style.gridTemplateColumns]="'repeat(7, minmax(0, 1fr))'"
              [style.gridTemplateRows]="'repeat(' + slotCount + ', 24px)'"
            >
              <div class="pointer-events-none absolute inset-0" [style.background]="gridBg"></div>

              <div
                *ngFor="let item of scheduleItems; trackBy: trackItem"
                class="m-0.5 rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm"
                [style.gridColumn]="gridCol(item)"
                [style.gridRow]="gridRow(item)"
              >
                <div class="truncate">{{ item.courseName }}</div>
                <div class="truncate font-normal opacity-90">
                  {{ item.startTime }}-{{ item.endTime }} | {{ item.sectionCode || item.sectionName }}
                </div>
                <div class="truncate text-[10px] font-normal opacity-80">
                  {{ item.teacherName || 'Sin docente' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="scheduleItems.length === 0" class="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600">
        El aula seleccionada no tiene bloques de horario en el periodo activo.
      </div>
    </div>
  `,
})
export class AdminClassroomSchedulePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);

  campuses: CampusOption[] = [];
  classrooms: ClassroomOption[] = [];
  scheduleItems: ClassroomScheduleItem[] = [];
  selectedCampusName = '';
  selectedClassroomId = '';
  selectedClassroomTitle = '';
  error: string | null = null;

  readonly days = DAYS;
  readonly startMinutes = 6 * 60;
  readonly endMinutes = 22 * 60;
  readonly slotMinutes = 30;
  readonly slotCount = (this.endMinutes - this.startMinutes) / this.slotMinutes;
  readonly timeRows = Array.from({ length: this.slotCount }).map((_, idx) => {
    const minutes = this.startMinutes + idx * this.slotMinutes;
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return mm === 0
      ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      : '';
  });
  readonly gridBg =
    'repeating-linear-gradient(to bottom, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 1px, transparent 1px, transparent 24px), ' +
    'repeating-linear-gradient(to right, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 1px, transparent 1px, transparent calc(100%/7))';

  private get isSupportRole() {
    return this.auth.user?.role === Role.SOPORTE_TECNICO;
  }

  private get campusesEndpoint() {
    return this.isSupportRole
      ? '/api/support/classroom-schedule/campuses'
      : '/api/admin/classroom-schedule/campuses';
  }

  private get classroomScheduleBaseEndpoint() {
    return this.isSupportRole
      ? '/api/support/classroom-schedule'
      : '/api/admin/classroom-schedule';
  }

  get classroomPlaceholder() {
    if (!this.selectedCampusName) return 'Selecciona una sede primero';
    if (this.classrooms.length === 0) return 'No hay aulas con horario';
    return 'Selecciona un aula';
  }

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.error = null;
    try {
      await this.loadCampuses();
      if (this.selectedCampusName) {
        await this.loadClassrooms();
        if (this.selectedClassroomId) {
          await this.loadSchedule();
        }
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar el horario por aula.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onCampusChange(value: string) {
    this.selectedCampusName = String(value ?? '').trim();
    this.selectedClassroomId = '';
    this.selectedClassroomTitle = '';
    this.classrooms = [];
    this.scheduleItems = [];
    this.error = null;
    if (!this.selectedCampusName) {
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadClassrooms();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar las aulas.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onClassroomChange(value: string) {
    this.selectedClassroomId = String(value ?? '').trim();
    this.scheduleItems = [];
    this.error = null;
    if (!this.selectedClassroomId) {
      this.selectedClassroomTitle = '';
      this.cdr.detectChanges();
      return;
    }
    try {
      await this.loadSchedule();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar el horario del aula.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  classroomLabel(classroom: ClassroomOption) {
    const code = String(classroom.code ?? '').trim();
    const name = String(classroom.name ?? '').trim();
    return [code, name].filter((part) => Boolean(part)).join(' - ') || 'Aula';
  }

  trackItem(_: number, item: ClassroomScheduleItem) {
    return item.id;
  }

  gridCol(item: ClassroomScheduleItem) {
    return `${item.dayOfWeek} / span 1`;
  }

  gridRow(item: ClassroomScheduleItem) {
    const start = this.safeMinutes(item.startTime, this.startMinutes);
    const end = this.safeMinutes(item.endTime, start + this.slotMinutes);
    const rowStart = Math.max(
      1,
      Math.min(
        this.slotCount,
        Math.floor((Math.max(start, this.startMinutes) - this.startMinutes) / this.slotMinutes) + 1
      )
    );
    const rowSpan = Math.max(1, Math.ceil((Math.max(end, start) - start) / this.slotMinutes));
    return `${rowStart} / span ${rowSpan}`;
  }

  private async loadCampuses() {
    this.campuses = await firstValueFrom(
      this.http.get<CampusOption[]>(this.campusesEndpoint)
    );
  }

  private async loadClassrooms() {
    this.classrooms = await firstValueFrom(
      this.http.get<ClassroomOption[]>(
        `${this.classroomScheduleBaseEndpoint}/classrooms`,
        {
        params: { campusName: this.selectedCampusName },
        }
      )
    );
  }

  private async loadSchedule() {
    const response = await firstValueFrom(
      this.http.get<ClassroomScheduleResponse>(this.classroomScheduleBaseEndpoint, {
        params: {
          campusName: this.selectedCampusName,
          classroomId: this.selectedClassroomId,
        },
      })
    );
    this.scheduleItems = Array.isArray(response?.items) ? response.items : [];
    const selected = this.classrooms.find((item) => item.id === this.selectedClassroomId);
    this.selectedClassroomTitle =
      this.classroomLabel({
        id: response?.classroomId || selected?.id || this.selectedClassroomId,
        code: response?.classroomCode ?? selected?.code ?? null,
        name: response?.classroomName ?? selected?.name ?? null,
      });
  }

  private safeMinutes(value: string, fallback: number) {
    const minutes = minutesFromHHmm(value);
    return Number.isFinite(minutes) ? minutes : fallback;
  }
}
