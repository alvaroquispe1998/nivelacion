import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { ZoomHostGroup, ZoomMeetingView, ZoomRecordingView } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

type MeetingMode = 'ONE_TIME' | 'RECURRING';
type RecurrenceEndMode = 'UNTIL_DATE' | 'BY_COUNT';

interface ZoomMeetingPrefillDraft {
  mode: MeetingMode;
  topic: string;
  agenda: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  sourceType?: 'SECTION_BLOCK' | 'WORKSHOP_BLOCK';
  sourceBlockId?: string;
  sourceSectionId?: string;
  sourceCourseName?: string;
  sourceWorkshopId?: string;
  sourceGroupId?: string;
  sourceWorkshopScheduleBlockId?: string;
  weeklyDays?: number[];
  repeatInterval?: number;
  recurrenceEndMode?: 'UNTIL_DATE';
  recurrenceEndDate?: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Reuniones Zoom</div>
        <div class="mt-1 text-sm text-slate-600">
          Cree y gestione reuniones unicas o recurrentes con seleccion automatica de host
        </div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="loadAll()"
      >
        Refrescar
      </button>
    </div>

    <div
      *ngIf="error"
      class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </div>
    <div
      *ngIf="success"
      class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ success }}
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Nueva reunion automatica</div>
        <div class="mt-1 text-xs text-slate-500">
          El sistema asignara el host disponible segun disponibilidad y concurrencia
        </div>

        <form class="mt-3 space-y-3" [formGroup]="createForm" (ngSubmit)="createMeeting()">
          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">Tipo *</label>
            <select
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="meeting_mode"
              (change)="onMeetingModeChange()"
              [disabled]="isWorkshopPrefill()"
            >
              <option value="ONE_TIME">Unica</option>
              <option value="RECURRING">Recurrente semanal</option>
            </select>
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">Tema *</label>
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="topic"
              placeholder="Ej: Examen parcial de Calculo I"
            />
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">Agenda</label>
            <textarea
              rows="2"
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="agenda"
              placeholder="Descripcion opcional"
            ></textarea>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">
                {{ isRecurring() ? 'Fecha inicio *' : 'Fecha *' }}
              </label>
              <input
                type="date"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="meeting_date"
                (change)="onMeetingDateChange()"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">Hora inicio *</label>
              <input
                type="time"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="start_time"
                (change)="onStartTimeChange()"
              />
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-600">Hora fin *</label>
              <input
                type="time"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="end_time"
              />
            </div>
          </div>

          <div *ngIf="isRecurring()" class="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div class="text-xs font-semibold text-slate-700">
              Regla de recurrencia
            </div>
            <div class="mt-1 text-[11px] text-slate-500">
              La fecha de inicio define la primera ocurrencia de la serie.
            </div>

            <div class="mt-3">
              <div class="mb-1 text-xs font-semibold text-slate-600">Dias *</div>
              <div class="grid grid-cols-7 gap-1">
                <button
                  *ngFor="let day of weekDays"
                  type="button"
                  class="rounded-lg border px-2 py-2 text-[11px] font-semibold transition"
                  [ngClass]="
                    isWeeklyDaySelected(day.value)
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  "
                  (click)="toggleWeeklyDay(day.value)"
                >
                  {{ day.label }}
                </button>
              </div>
              <div *ngIf="selectedWeeklyDays().length === 0" class="mt-2 text-[11px] text-red-600">
                Seleccione al menos un dia.
              </div>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label class="mb-1 block text-xs font-semibold text-slate-600">Cada cuantas semanas *</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  formControlName="repeat_interval"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-semibold text-slate-600">Termina por *</label>
                <select
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  formControlName="recurrence_end_mode"
                  (change)="onEndModeChange()"
                >
                  <option value="UNTIL_DATE">Fecha</option>
                  <option value="BY_COUNT">Numero de repeticiones</option>
                </select>
              </div>
            </div>

            <div class="mt-2">
              <div *ngIf="selectedEndMode() === 'UNTIL_DATE'; else endTimesField">
                <label class="mb-1 block text-xs font-semibold text-slate-600">Fecha fin *</label>
                <input
                  type="date"
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  formControlName="recurrence_end_date"
                />
              </div>
              <ng-template #endTimesField>
                <label class="mb-1 block text-xs font-semibold text-slate-600">Numero de repeticiones *</label>
                <input
                  type="number"
                  min="1"
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  formControlName="recurrence_end_times"
                />
              </ng-template>
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-semibold text-slate-600">Grupo de hosts</label>
            <select
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="groupId"
            >
              <option value="">Todos los grupos</option>
              <option *ngFor="let g of groups" [value]="g.id">{{ g.name }}</option>
            </select>
          </div>

          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="isCreateDisabled()"
          >
            {{ createButtonLabel() }}
          </button>
        </form>

        <div
          *ngIf="lastCreated"
          class="mt-3 space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs"
        >
          <div class="font-semibold text-emerald-800">Reunion creada</div>
          <div><span class="text-slate-600">Host:</span> {{ lastCreated.host }}</div>
          <div><span class="text-slate-600">Zoom ID:</span> {{ lastCreated.zoomMeetingId }}</div>
          <div><span class="text-slate-600">Tipo:</span> {{ meetingModeLabel(lastCreated.meetingMode) }}</div>
          <div><span class="text-slate-600">Resumen:</span> {{ lastCreated.recurrenceSummary }}</div>
          <div class="mt-2 flex gap-2">
            <button
              class="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white"
              (click)="copyToClipboard(lastCreated.join_url)"
            >
              Copiar Join URL
            </button>
            <button
              class="rounded-lg border border-emerald-300 px-3 py-1 text-[11px] font-semibold text-emerald-700"
              (click)="copyToClipboard(lastCreated.start_url)"
            >
              Copiar Start URL
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-sm font-semibold">Reuniones programadas</div>
          <div class="flex flex-wrap items-end gap-2">
            <input
              type="date"
              class="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              [(ngModel)]="filterFrom"
            />
            <input
              type="date"
              class="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              [(ngModel)]="filterTo"
            />
            <input
              class="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              [(ngModel)]="filterTopic"
              placeholder="Buscar tema..."
            />
            <button
              class="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50"
              (click)="loadMeetings()"
            >
              Filtrar
            </button>
          </div>
        </div>

        <div class="mt-3 max-h-[480px] overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-2">Tema</th>
                <th class="px-3 py-2">Tipo</th>
                <th class="px-3 py-2">Host</th>
                <th class="px-3 py-2">Inicio</th>
                <th class="px-3 py-2">Duracion</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let m of meetings; trackBy: trackMeeting"
                class="border-t border-slate-100"
              >
                <td class="max-w-[220px] px-3 py-2" [title]="m.topic">
                  <div class="truncate font-semibold text-slate-800">{{ m.topic }}</div>
                  <div *ngIf="m.agenda" class="truncate text-[11px] text-slate-500">{{ m.agenda }}</div>
                </td>
                <td class="px-3 py-2">
                  <div
                    class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    [ngClass]="meetingModeClass(m.meetingMode)"
                  >
                    {{ meetingModeLabel(m.meetingMode) }}
                  </div>
                  <div class="mt-1 max-w-[220px] text-[11px] text-slate-500">
                    {{ m.recurrenceSummary }}
                  </div>
                </td>
                <td class="px-3 py-2 text-slate-600">{{ m.hostEmail }}</td>
                <td class="px-3 py-2 text-slate-600">{{ formatDate(m.startTime) }}</td>
                <td class="px-3 py-2 text-slate-600">{{ m.duration }} min</td>
                <td class="px-3 py-2">
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    [ngClass]="statusClass(m.status)"
                  >
                    {{ m.status }}
                  </span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap gap-1">
                    <div class="flex gap-2">
                      <a
                        *ngIf="m.joinUrl"
                        [href]="m.joinUrl"
                        target="_blank"
                        class="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
                        title="Abrir Join URL"
                      >
                        Join
                      </a>
                      <button
                        class="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        (click)="copyToClipboard(m.joinUrl)"
                        title="Copiar Join URL"
                      >
                        Copiar join
                      </button>
                    </div>
                    <div class="flex gap-2">
                      <a
                        *ngIf="m.startUrl"
                        [href]="m.startUrl"
                        target="_blank"
                        class="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                        title="Abrir Start URL"
                      >
                        Start
                      </a>
                      <button
                        *ngIf="m.startUrl"
                        class="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                        (click)="copyToClipboard(m.startUrl)"
                        title="Copiar Start URL"
                      >
                        Copiar start
                      </button>
                    </div>
                    <button
                      class="inline-flex items-center rounded-lg border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      (click)="openDeleteMeetingDialog(m)"
                      [disabled]="deletingId === m.id"
                      title="Eliminar reunion"
                    >
                      <span *ngIf="deletingId === m.id">...</span>
                      <span *ngIf="deletingId !== m.id">Eliminar</span>
                    </button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="meetings.length === 0 && !loadingMeetings" class="border-t border-slate-100">
                <td class="px-3 py-4 text-center text-slate-500" colspan="7">Sin reuniones</td>
              </tr>
              <tr *ngIf="loadingMeetings" class="border-t border-slate-100">
                <td class="px-3 py-4 text-center text-slate-400" colspan="7">Cargando...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-sm font-semibold">Grabaciones</div>
          <div class="text-xs text-slate-500">
            Consulte grabaciones de Zoom, maximo 30 dias por consulta
          </div>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <input
            type="date"
            class="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            [(ngModel)]="recFrom"
          />
          <input
            type="date"
            class="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            [(ngModel)]="recTo"
          />
          <button
            class="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            (click)="loadRecordings()"
            [disabled]="loadingRecordings"
          >
            {{ loadingRecordings ? 'Buscando...' : 'Buscar grabaciones' }}
          </button>
        </div>
      </div>

      <div
        *ngIf="recordings.length > 0"
        class="mt-3 max-h-[360px] overflow-auto rounded-xl border border-slate-200"
      >
        <table class="min-w-full text-xs">
          <thead class="sticky top-0 bg-slate-50 text-left uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-3 py-2">Tema</th>
              <th class="px-3 py-2">Host</th>
              <th class="px-3 py-2">Fecha</th>
              <th class="px-3 py-2">Duracion</th>
              <th class="px-3 py-2">Archivos</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of recordings" class="border-t border-slate-100">
              <td class="max-w-[200px] truncate px-3 py-2 font-semibold text-slate-800" [title]="r.topic">
                {{ r.topic }}
              </td>
              <td class="px-3 py-2 text-slate-600">{{ r.host_email }}</td>
              <td class="px-3 py-2 text-slate-600">{{ formatDate(r.start_time) }}</td>
              <td class="px-3 py-2 text-slate-600">{{ r.duration }} min</td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap gap-1">
                  <a
                    *ngFor="let f of r.recording_files || []"
                    [href]="f.play_url || f.download_url"
                    target="_blank"
                    class="rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    {{ f.file_type }}
                  </a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div *ngIf="recordings.length === 0 && !loadingRecordings" class="mt-3 text-xs text-slate-400">
        Seleccione rango de fechas y haga clic en "Buscar grabaciones"
      </div>
    </div>

    <div
      *ngIf="pendingDeleteMeeting"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
      (click)="closeDeleteMeetingDialog()"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="text-lg font-semibold text-slate-900">Eliminar reunion</div>
        <div class="mt-2 text-sm text-slate-600">
          Esta accion eliminara la reunion en Zoom y la ocultara del listado local.
        </div>

        <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div class="font-semibold text-slate-800">
            {{ pendingDeleteMeeting.topic || 'Reunion sin tema' }}
          </div>
          <div class="mt-2 text-slate-600">
            Host: {{ pendingDeleteMeeting.hostEmail || '-' }}
          </div>
          <div class="text-slate-600">
            Inicio: {{ formatDate(pendingDeleteMeeting.startTime) }}
          </div>
          <div class="text-slate-600">
            Tipo: {{ meetingModeLabel(pendingDeleteMeeting.meetingMode) }}
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            (click)="closeDeleteMeetingDialog()"
            [disabled]="deletingId === pendingDeleteMeeting.id"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            (click)="confirmDeleteMeeting()"
            [disabled]="deletingId === pendingDeleteMeeting.id"
          >
            {{ deletingId === pendingDeleteMeeting.id ? 'Eliminando...' : 'Eliminar reunion' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminZoomMeetingsPage {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private sourceBlockId: string | null = null;
  private sourceSectionId: string | null = null;
  private sourceCourseName: string | null = null;
  private sourceType: 'SECTION_BLOCK' | 'WORKSHOP_BLOCK' | null = null;
  private sourceWorkshopId: string | null = null;
  private sourceGroupId: string | null = null;
  private sourceWorkshopScheduleBlockId: string | null = null;

  readonly weekDays = [
    { value: 1, label: 'Dom' },
    { value: 2, label: 'Lun' },
    { value: 3, label: 'Mar' },
    { value: 4, label: 'Mie' },
    { value: 5, label: 'Jue' },
    { value: 6, label: 'Vie' },
    { value: 7, label: 'Sab' },
  ];

  createForm = this.fb.group({
    topic: ['', Validators.required],
    agenda: [''],
    meeting_date: ['', Validators.required],
    start_time: ['', Validators.required],
    end_time: ['', Validators.required],
    groupId: [''],
    meeting_mode: ['ONE_TIME' as MeetingMode, Validators.required],
    repeat_interval: [1],
    weekly_days: [[] as number[]],
    recurrence_end_mode: ['UNTIL_DATE' as RecurrenceEndMode],
    recurrence_end_date: [''],
    recurrence_end_times: [8],
  });

  error = '';
  success = '';
  groups: ZoomHostGroup[] = [];
  meetings: ZoomMeetingView[] = [];
  recordings: ZoomRecordingView[] = [];
  lastCreated: {
    host: string;
    zoomMeetingId: number;
    join_url: string;
    start_url: string;
    meetingMode: MeetingMode;
    recurrenceSummary: string;
  } | null = null;

  creatingMeeting = false;
  loadingMeetings = false;
  loadingRecordings = false;
  deletingId: string | null = null;
  pendingDeleteMeeting: ZoomMeetingView | null = null;

  filterFrom = '';
  filterTo = '';
  filterTopic = '';
  recFrom = '';
  recTo = '';

  ngOnInit() {
    this.applyPrefillFromNavigationState();
    this.loadAll();
  }

  async loadAll() {
    this.error = '';
    await Promise.all([this.loadGroups(), this.loadMeetings()]);
  }

  private async loadGroups() {
    try {
      this.groups = await firstValueFrom(
        this.http.get<ZoomHostGroup[]>('/api/admin/zoom/config/host-groups'),
      );
    } catch {
      // ignore
    }
    this.cdr.markForCheck();
  }

  async loadMeetings() {
    this.loadingMeetings = true;
    this.error = '';
    try {
      let params = new HttpParams();
      if (this.filterFrom) params = params.set('from', this.filterFrom);
      if (this.filterTo) params = params.set('to', this.filterTo);

      if (this.filterTopic?.trim()) {
        params = new HttpParams().set('topic', this.filterTopic.trim());
        this.meetings = await firstValueFrom(
          this.http.get<ZoomMeetingView[]>('/api/admin/zoom/meetings/by-topic', {
            params,
          }),
        );
      } else {
        this.meetings = await firstValueFrom(
          this.http.get<ZoomMeetingView[]>('/api/admin/zoom/meetings', {
            params,
          }),
        );
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al cargar reuniones';
    } finally {
      this.loadingMeetings = false;
      this.cdr.markForCheck();
    }
  }

  isRecurring() {
    return this.createForm.value.meeting_mode === 'RECURRING';
  }

  isWorkshopPrefill() {
    return this.sourceType === 'WORKSHOP_BLOCK';
  }

  selectedEndMode(): RecurrenceEndMode {
    return (this.createForm.value.recurrence_end_mode ?? 'UNTIL_DATE') as RecurrenceEndMode;
  }

  selectedWeeklyDays(): number[] {
    return [...(this.createForm.value.weekly_days ?? [])]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
      .sort((a, b) => a - b);
  }

  isWeeklyDaySelected(day: number) {
    return this.selectedWeeklyDays().includes(day);
  }

  toggleWeeklyDay(day: number) {
    const next = this.isWeeklyDaySelected(day)
      ? this.selectedWeeklyDays().filter((value) => value !== day)
      : [...this.selectedWeeklyDays(), day].sort((a, b) => a - b);
    this.createForm.patchValue({ weekly_days: next });
    this.cdr.markForCheck();
  }

  onMeetingModeChange() {
    if (this.isWorkshopPrefill()) {
      this.createForm.patchValue({
        meeting_mode: 'ONE_TIME',
        weekly_days: [],
        repeat_interval: 1,
        recurrence_end_mode: 'UNTIL_DATE',
        recurrence_end_date: '',
        recurrence_end_times: 8,
      });
      return;
    }
    if (!this.isRecurring()) {
      this.createForm.patchValue({
        weekly_days: [],
        repeat_interval: 1,
        recurrence_end_mode: 'UNTIL_DATE',
        recurrence_end_date: '',
        recurrence_end_times: 8,
      });
      return;
    }

    if (this.selectedWeeklyDays().length === 0) {
      const startDate = this.selectedMeetingDate();
      if (startDate) {
        this.createForm.patchValue({
          weekly_days: [this.zoomWeekdayFromDate(startDate)],
        });
      }
    }

    if (!this.createForm.value.recurrence_end_date) {
      const startDate = this.selectedMeetingDate();
      if (startDate) {
        this.createForm.patchValue({ recurrence_end_date: startDate });
      }
    }
  }

  onMeetingDateChange() {
    if (!this.isRecurring()) return;
    this.onMeetingModeChange();
  }

  onStartTimeChange() {
    if (!this.isRecurring()) return;
    this.onMeetingModeChange();
  }

  onEndModeChange() {
    if (this.selectedEndMode() === 'UNTIL_DATE') {
      const startDate = this.selectedMeetingDate();
      if (!this.createForm.value.recurrence_end_date && startDate) {
        this.createForm.patchValue({ recurrence_end_date: startDate });
      }
      return;
    }

    if (!this.createForm.value.recurrence_end_times) {
      this.createForm.patchValue({ recurrence_end_times: 8 });
    }
  }

  private selectedMeetingDate() {
    return String(this.createForm.value.meeting_date ?? '').trim();
  }

  private buildMeetingDateTime(datePart?: string | null, timePart?: string | null) {
    const date = String(datePart ?? '').trim();
    const time = String(timePart ?? '').trim();
    if (!date || !time) return '';
    return `${date}T${time}`;
  }

  private zoomWeekdayFromDate(datePart: string) {
    const date = new Date(`${datePart}T00:00:00Z`);
    const day = date.getUTCDay();
    return day === 0 ? 1 : day + 1;
  }

  private recurrenceValidationMessage() {
    if (!this.isRecurring()) return '';

    const interval = Number(this.createForm.value.repeat_interval ?? 0);
    if (!Number.isInteger(interval) || interval < 1 || interval > 12) {
      return 'La recurrencia semanal debe usar un intervalo entre 1 y 12.';
    }

    const weeklyDays = this.selectedWeeklyDays();
    if (weeklyDays.length === 0) {
      return 'Seleccione al menos un dia para la recurrencia.';
    }

    const startDate = this.selectedMeetingDate();
    if (startDate) {
      const startWeekday = this.zoomWeekdayFromDate(startDate);
      if (!weeklyDays.includes(startWeekday)) {
        return 'La fecha de inicio debe coincidir con uno de los dias seleccionados.';
      }
    }

    if (this.selectedEndMode() === 'UNTIL_DATE') {
      const endDate = String(this.createForm.value.recurrence_end_date ?? '').trim();
      if (!endDate) return 'Ingrese una fecha fin para la recurrencia.';
      if (startDate && endDate < startDate) {
        return 'La fecha fin de la recurrencia no puede ser anterior al inicio.';
      }
      return '';
    }

    const endTimes = Number(this.createForm.value.recurrence_end_times ?? 0);
    if (!Number.isInteger(endTimes) || endTimes < 1) {
      return 'Ingrese un numero de repeticiones valido.';
    }

    return '';
  }

  isCreateDisabled() {
    return (
      this.creatingMeeting ||
      this.createForm.invalid ||
      Boolean(this.recurrenceValidationMessage())
    );
  }

  createButtonLabel() {
    if (this.creatingMeeting) {
      return this.isRecurring() ? 'Creando reunion recurrente...' : 'Creando reunion...';
    }
    return this.isRecurring() ? 'Crear reunion recurrente' : 'Crear reunion';
  }

  private resetCreateForm() {
    this.createForm.reset({
      topic: '',
      agenda: '',
      meeting_date: '',
      start_time: '',
      end_time: '',
      groupId: '',
      meeting_mode: 'ONE_TIME',
      repeat_interval: 1,
      weekly_days: [],
      recurrence_end_mode: 'UNTIL_DATE',
      recurrence_end_date: '',
      recurrence_end_times: 8,
    });
  }

  private applyPrefillFromNavigationState() {
    if (typeof window === 'undefined') return;
    const state = (window.history.state ?? {}) as {
      zoomMeetingPrefill?: ZoomMeetingPrefillDraft;
      [key: string]: unknown;
    };
    const draft = state.zoomMeetingPrefill;
    if (!this.isValidPrefillDraft(draft)) return;

    this.createForm.patchValue({
      topic: draft.topic,
      agenda: draft.agenda,
      meeting_date: draft.meetingDate,
      start_time: draft.startTime,
      end_time: draft.endTime,
      meeting_mode: draft.mode,
      repeat_interval: draft.repeatInterval ?? 1,
      weekly_days: draft.mode === 'RECURRING' ? draft.weeklyDays ?? [] : [],
      recurrence_end_mode:
        draft.mode === 'RECURRING'
          ? draft.recurrenceEndMode ?? 'UNTIL_DATE'
          : 'UNTIL_DATE',
      recurrence_end_date:
        draft.mode === 'RECURRING' ? draft.recurrenceEndDate ?? '' : '',
      recurrence_end_times: 8,
    });
    this.sourceBlockId = String(draft.sourceBlockId ?? '').trim() || null;
    this.sourceSectionId = String(draft.sourceSectionId ?? '').trim() || null;
    this.sourceCourseName = String(draft.sourceCourseName ?? '').trim() || null;
    this.sourceType =
      draft.sourceType === 'WORKSHOP_BLOCK' ? 'WORKSHOP_BLOCK' : 'SECTION_BLOCK';
    this.sourceWorkshopId = String(draft.sourceWorkshopId ?? '').trim() || null;
    this.sourceGroupId = String(draft.sourceGroupId ?? '').trim() || null;
    this.sourceWorkshopScheduleBlockId =
      String(draft.sourceWorkshopScheduleBlockId ?? '').trim() || null;
    this.onMeetingModeChange();
    this.success = this.isWorkshopPrefill()
      ? this.sourceWorkshopScheduleBlockId
        ? 'Formulario precargado desde horario de taller.'
        : 'Formulario precargado desde horario de taller. Si el bloque aun no fue guardado, los enlaces no se vincularan automaticamente.'
      : 'Formulario precargado desde horario de seccion.';
    this.clearConsumedPrefillState(state);
    this.cdr.markForCheck();
  }

  private clearConsumedPrefillState(state: {
    zoomMeetingPrefill?: ZoomMeetingPrefillDraft;
    [key: string]: unknown;
  }) {
    if (typeof window === 'undefined') return;
    const nextState = { ...state };
    delete nextState.zoomMeetingPrefill;
    window.history.replaceState(nextState, document.title, window.location.href);
  }

  private isValidPrefillDraft(value: unknown): value is ZoomMeetingPrefillDraft {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Partial<ZoomMeetingPrefillDraft>;
    const mode = draft.mode;
    if (mode !== 'ONE_TIME' && mode !== 'RECURRING') return false;
    const topic = String(draft.topic ?? '').trim();
    const meetingDate = String(draft.meetingDate ?? '').trim();
    const startTime = String(draft.startTime ?? '').trim();
    const endTime = String(draft.endTime ?? '').trim();
    if (!topic || !meetingDate || !startTime || !endTime) return false;
    if (
      draft.sourceType &&
      draft.sourceType !== 'SECTION_BLOCK' &&
      draft.sourceType !== 'WORKSHOP_BLOCK'
    ) {
      return false;
    }
    if (draft.sourceType === 'WORKSHOP_BLOCK') {
      const sourceWorkshopId = String(draft.sourceWorkshopId ?? '').trim();
      const sourceGroupId = String(draft.sourceGroupId ?? '').trim();
      if (!sourceWorkshopId || !sourceGroupId) return false;
    }
    if (mode === 'RECURRING') {
      const weeklyDays = Array.isArray(draft.weeklyDays) ? draft.weeklyDays : [];
      const recurrenceEndDate = String(draft.recurrenceEndDate ?? '').trim();
      if (weeklyDays.length === 0 || !recurrenceEndDate) return false;
    }
    return true;
  }

  async createMeeting() {
    const recurrenceError = this.recurrenceValidationMessage();
    if (recurrenceError) {
      this.error = recurrenceError;
      return;
    }

    this.creatingMeeting = true;
    this.error = '';
    this.success = '';
    this.lastCreated = null;

    try {
      const val = this.createForm.getRawValue();
      const startTime = this.buildMeetingDateTime(val.meeting_date, val.start_time);
      const endTime = this.buildMeetingDateTime(val.meeting_date, val.end_time);
      const body: Record<string, unknown> = {
        topic: val.topic,
        agenda: val.agenda || undefined,
        start_time: startTime,
        end_time: endTime,
        timezone: 'America/Lima',
        meeting_mode: val.meeting_mode,
      };

      if (val.groupId) body['groupId'] = val.groupId;

      if (val.meeting_mode === 'RECURRING') {
        body['recurrence'] = {
          type: 'WEEKLY',
          repeat_interval: Number(val.repeat_interval ?? 1),
          weekly_days: this.selectedWeeklyDays(),
          end_mode: val.recurrence_end_mode,
          ...(val.recurrence_end_mode === 'UNTIL_DATE'
            ? {
                end_date: String(val.recurrence_end_date ?? '').trim(),
              }
            : {
                end_times: Number(val.recurrence_end_times ?? 0),
              }),
        };
      }

      const res = await firstValueFrom(
        this.http.post<any>('/api/admin/zoom/meetings/auto', body),
      );
      this.lastCreated = {
        host: res.host,
        zoomMeetingId: res.zoomMeetingId,
        join_url: res.join_url,
        start_url: res.start_url,
        meetingMode: (res.meetingMode ?? 'ONE_TIME') as MeetingMode,
        recurrenceSummary: String(res.recurrenceSummary ?? 'Unica'),
      };
      const createdMessage = `Reunion creada con host ${res.host}`;
      let linksPersistError = '';
      if (this.sourceType === 'WORKSHOP_BLOCK' && this.sourceWorkshopId && this.sourceGroupId && this.sourceWorkshopScheduleBlockId) {
        try {
          await this.persistLinksToSourceWorkshopBlock(
            this.sourceWorkshopId,
            this.sourceGroupId,
            this.sourceWorkshopScheduleBlockId,
            {
              zoomMeetingRecordId: String(res.id ?? '').trim(),
              joinUrl: String(res.join_url ?? '').trim(),
              startUrl: String(res.start_url ?? '').trim(),
            }
          );
          this.success = `${createdMessage}. Enlaces guardados en el horario del taller.`;
        } catch (persistError: any) {
          this.success = createdMessage;
          linksPersistError =
            persistError?.error?.message ??
            'La reunion se creo, pero no se pudieron guardar los enlaces en el bloque del taller.';
        } finally {
          this.clearPrefillSourceContext();
        }
      } else if (this.sourceBlockId) {
        try {
          await this.persistLinksToSourceBlock(this.sourceBlockId, {
            zoomMeetingRecordId: String(res.id ?? '').trim(),
            joinUrl: String(res.join_url ?? '').trim(),
            startUrl: String(res.start_url ?? '').trim(),
          });
          this.success = `${createdMessage}. Enlaces guardados en el horario de seccion.`;
        } catch (persistError: any) {
          this.success = createdMessage;
          const sectionLabelParts = [
            this.sourceCourseName ? `curso ${this.sourceCourseName}` : '',
            this.sourceSectionId ? `seccion ${this.sourceSectionId}` : '',
          ].filter(Boolean);
          const sectionLabel = sectionLabelParts.length
            ? ` del bloque de ${sectionLabelParts.join(' / ')}`
            : '';
          linksPersistError =
            persistError?.error?.message ??
            `La reunion se creo, pero no se pudieron guardar los enlaces${sectionLabel}.`;
        } finally {
          this.clearPrefillSourceContext();
        }
      } else {
        this.success = createdMessage;
      }
      this.resetCreateForm();
      await this.loadMeetings();
      if (linksPersistError) {
        this.error = linksPersistError;
      }
    } catch (e: any) {
      const errBody = e?.error;
      if (errBody?.hosts_checked) {
        this.error = `${errBody.error || 'Sin hosts disponibles'}. Hosts verificados: ${errBody.hosts_checked.join(', ')}`;
      } else {
        this.error = errBody?.message ?? 'Error al crear reunion';
      }
    } finally {
      this.creatingMeeting = false;
      this.cdr.markForCheck();
    }
  }

  private async persistLinksToSourceBlock(
    blockId: string,
    payload: { zoomMeetingRecordId?: string; joinUrl: string; startUrl: string }
  ) {
    const normalizedBlockId = String(blockId ?? '').trim();
    if (!normalizedBlockId) return;
    await firstValueFrom(
      this.http.put(`/api/admin/schedule-blocks/${encodeURIComponent(normalizedBlockId)}`, {
        zoomMeetingRecordId: payload.zoomMeetingRecordId || undefined,
        joinUrl: payload.joinUrl,
        startUrl: payload.startUrl,
      }),
    );
  }

  private clearPrefillSourceContext() {
    this.sourceType = null;
    this.sourceBlockId = null;
    this.sourceSectionId = null;
    this.sourceCourseName = null;
    this.sourceWorkshopId = null;
    this.sourceGroupId = null;
    this.sourceWorkshopScheduleBlockId = null;
  }

  private async persistLinksToSourceWorkshopBlock(
    workshopId: string,
    groupId: string,
    blockId: string,
    payload: { zoomMeetingRecordId?: string; joinUrl: string; startUrl: string }
  ) {
    await firstValueFrom(
      this.http.put(
        `/api/admin/workshops/${encodeURIComponent(workshopId)}/groups/${encodeURIComponent(groupId)}/schedule/${encodeURIComponent(blockId)}/meeting-links`,
        {
          zoomMeetingRecordId: payload.zoomMeetingRecordId || undefined,
          joinUrl: payload.joinUrl,
          startUrl: payload.startUrl,
        }
      )
    );
  }

  openDeleteMeetingDialog(meeting: ZoomMeetingView) {
    this.pendingDeleteMeeting = meeting;
    this.cdr.markForCheck();
  }

  closeDeleteMeetingDialog() {
    if (this.pendingDeleteMeeting && this.deletingId === this.pendingDeleteMeeting.id) {
      return;
    }
    this.pendingDeleteMeeting = null;
    this.cdr.markForCheck();
  }

  async confirmDeleteMeeting() {
    const meeting = this.pendingDeleteMeeting;
    if (!meeting?.id) return;

    const id = meeting.id;
    this.deletingId = id;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/zoom/meetings/${id}`));
      this.success = 'Reunion eliminada correctamente.';
      this.pendingDeleteMeeting = null;
      await this.loadMeetings();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al eliminar reunion';
    } finally {
      this.deletingId = null;
      this.cdr.markForCheck();
    }
  }

  async loadRecordings() {
    if (!this.recFrom || !this.recTo) {
      this.error = 'Seleccione rango de fechas para buscar grabaciones';
      return;
    }
    this.loadingRecordings = true;
    this.error = '';
    try {
      const params = new HttpParams()
        .set('from', this.recFrom)
        .set('to', this.recTo);
      this.recordings = await firstValueFrom(
        this.http.get<ZoomRecordingView[]>('/api/admin/zoom/meetings/recordings', {
          params,
        }),
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al cargar grabaciones';
    } finally {
      this.loadingRecordings = false;
      this.cdr.markForCheck();
    }
  }

  formatDate(d: string) {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  statusClass(status: string) {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-sky-100 text-sky-700';
      case 'LIVE':
        return 'bg-emerald-100 text-emerald-700';
      case 'ENDED':
        return 'bg-slate-100 text-slate-600';
      case 'DELETED':
        return 'bg-red-100 text-red-600';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  }

  meetingModeLabel(mode: string) {
    return mode === 'RECURRING' ? 'Recurrente' : 'Unica';
  }

  meetingModeClass(mode: string) {
    return mode === 'RECURRING'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-700';
  }

  copyToClipboard(text: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => {
        this.success = 'URL copiada al portapapeles';
        this.cdr.markForCheck();
      },
      () => {
        this.error = 'No se pudo copiar al portapapeles';
        this.cdr.markForCheck();
      },
    );
  }

  trackMeeting(_: number, meeting: ZoomMeetingView) {
    return meeting.id;
  }
}
