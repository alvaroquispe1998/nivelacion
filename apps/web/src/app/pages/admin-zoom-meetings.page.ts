import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ZoomHostGroup, ZoomMeetingView, ZoomRecordingView } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Reuniones Zoom</div>
        <div class="text-sm text-slate-600">Cree y gestione reuniones con selección automática de host</div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="loadAll()"
      >
        Refrescar
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {{ success }}
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-3">

      <!-- ── Create Meeting ────────────────────────────────────────────── -->
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Nueva reunión automática</div>
        <div class="text-xs text-slate-500 mt-1">Se asignará el host disponible automáticamente</div>

        <form class="mt-3 space-y-2" [formGroup]="createForm" (ngSubmit)="createMeeting()">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Tema *</label>
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="topic"
              placeholder="Ej: Examen parcial de Cálculo I"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Agenda</label>
            <textarea
              rows="2"
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="agenda"
              placeholder="Descripción (opcional)"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Inicio *</label>
              <input
                type="datetime-local"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="start_time"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Fin *</label>
              <input
                type="datetime-local"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="end_time"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Grupo de hosts</label>
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
            [disabled]="createForm.invalid || creatingMeeting"
          >
            {{ creatingMeeting ? 'Creando...' : 'Crear reunión' }}
          </button>
        </form>

        <!-- Last created meeting info -->
        <div
          *ngIf="lastCreated"
          class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs space-y-1"
        >
          <div class="font-semibold text-emerald-800">Reunión creada</div>
          <div><span class="text-slate-600">Host:</span> {{ lastCreated.host }}</div>
          <div><span class="text-slate-600">Zoom ID:</span> {{ lastCreated.zoomMeetingId }}</div>
          <div class="flex gap-2 mt-2">
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

      <!-- ── Meetings List ─────────────────────────────────────────────── -->
      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-center gap-2 justify-between">
          <div class="text-sm font-semibold">Reuniones programadas</div>
          <div class="flex flex-wrap gap-2 items-end">
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
            <thead class="bg-slate-50 text-left uppercase tracking-wide text-slate-600 sticky top-0">
              <tr>
                <th class="px-3 py-2">Tema</th>
                <th class="px-3 py-2">Host</th>
                <th class="px-3 py-2">Inicio</th>
                <th class="px-3 py-2">Duración</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let m of meetings; trackBy: trackMeeting"
                class="border-t border-slate-100"
              >
                <td class="px-3 py-2 font-semibold text-slate-800 max-w-[200px] truncate" [title]="m.topic">
                  {{ m.topic }}
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
                  <div class="flex gap-1">
                    <button
                      class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-slate-50"
                      (click)="copyToClipboard(m.joinUrl)"
                      title="Copiar Join URL"
                    >
                      📋 Join
                    </button>
                    <button
                      class="rounded-lg border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      (click)="deleteMeeting(m.id)"
                      [disabled]="deletingId === m.id"
                    >
                      {{ deletingId === m.id ? '...' : 'Eliminar' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="meetings.length === 0 && !loadingMeetings" class="border-t border-slate-100">
                <td class="px-3 py-4 text-slate-500 text-center" colspan="6">Sin reuniones</td>
              </tr>
              <tr *ngIf="loadingMeetings" class="border-t border-slate-100">
                <td class="px-3 py-4 text-slate-400 text-center" colspan="6">Cargando...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ── Recordings ────────────────────────────────────────────────── -->
    <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <div class="text-sm font-semibold">Grabaciones</div>
          <div class="text-xs text-slate-500">Consulte grabaciones de Zoom (máximo 30 días por consulta)</div>
        </div>
        <div class="flex flex-wrap gap-2 items-end">
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

      <div *ngIf="recordings.length > 0" class="mt-3 max-h-[360px] overflow-auto rounded-xl border border-slate-200">
        <table class="min-w-full text-xs">
          <thead class="bg-slate-50 text-left uppercase tracking-wide text-slate-600 sticky top-0">
            <tr>
              <th class="px-3 py-2">Tema</th>
              <th class="px-3 py-2">Host</th>
              <th class="px-3 py-2">Fecha</th>
              <th class="px-3 py-2">Duración</th>
              <th class="px-3 py-2">Archivos</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of recordings" class="border-t border-slate-100">
              <td class="px-3 py-2 font-semibold text-slate-800 max-w-[200px] truncate" [title]="r.topic">
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
  `,
})
export class AdminZoomMeetingsPage {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  createForm = this.fb.group({
    topic: ['', Validators.required],
    agenda: [''],
    start_time: ['', Validators.required],
    end_time: ['', Validators.required],
    groupId: [''],
  });

  // State
  error = '';
  success = '';
  groups: ZoomHostGroup[] = [];
  meetings: ZoomMeetingView[] = [];
  recordings: ZoomRecordingView[] = [];
  lastCreated: { host: string; zoomMeetingId: number; join_url: string; start_url: string } | null = null;

  // Loading
  creatingMeeting = false;
  loadingMeetings = false;
  loadingRecordings = false;
  deletingId: string | null = null;

  // Filters
  filterFrom = '';
  filterTo = '';
  filterTopic = '';
  recFrom = '';
  recTo = '';

  ngOnInit() {
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
    } catch { /* ignore */ }
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
        // Search by topic
        params = new HttpParams().set('topic', this.filterTopic.trim());
        this.meetings = await firstValueFrom(
          this.http.get<ZoomMeetingView[]>('/api/admin/zoom/meetings/by-topic', { params }),
        );
      } else {
        this.meetings = await firstValueFrom(
          this.http.get<ZoomMeetingView[]>('/api/admin/zoom/meetings', { params }),
        );
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al cargar reuniones';
    } finally {
      this.loadingMeetings = false;
      this.cdr.markForCheck();
    }
  }

  async createMeeting() {
    this.creatingMeeting = true;
    this.error = '';
    this.success = '';
    this.lastCreated = null;
    try {
      const val = this.createForm.value;
      const body: Record<string, unknown> = {
        topic: val.topic,
        agenda: val.agenda || undefined,
        start_time: val.start_time,
        end_time: val.end_time,
        timezone: 'America/Lima',
      };
      if (val.groupId) body['groupId'] = val.groupId;

      const res = await firstValueFrom(
        this.http.post<any>('/api/admin/zoom/meetings/auto', body),
      );
      this.lastCreated = res;
      this.success = `Reunión creada con host ${res.host}`;
      this.createForm.reset();
      await this.loadMeetings();
    } catch (e: any) {
      const errBody = e?.error;
      if (errBody?.hosts_checked) {
        this.error = `${errBody.error || 'Sin hosts disponibles'}. Hosts verificados: ${errBody.hosts_checked.join(', ')}`;
      } else {
        this.error = errBody?.message ?? 'Error al crear reunión';
      }
    } finally {
      this.creatingMeeting = false;
      this.cdr.markForCheck();
    }
  }

  async deleteMeeting(id: string) {
    if (!confirm('¿Eliminar esta reunión?')) return;
    this.deletingId = id;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/zoom/meetings/${id}`));
      await this.loadMeetings();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al eliminar reunión';
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
        this.http.get<ZoomRecordingView[]>('/api/admin/zoom/meetings/recordings', { params }),
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'Error al cargar grabaciones';
    } finally {
      this.loadingRecordings = false;
      this.cdr.markForCheck();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

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

  copyToClipboard(text: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => { this.success = 'URL copiada al portapapeles'; this.cdr.markForCheck(); },
      () => { this.error = 'No se pudo copiar al portapapeles'; this.cdr.markForCheck(); },
    );
  }

  trackMeeting(_: number, m: ZoomMeetingView) { return m.id; }
}
