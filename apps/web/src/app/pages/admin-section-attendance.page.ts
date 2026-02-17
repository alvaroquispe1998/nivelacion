import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AttendanceStatus } from '@uai/shared';
import type { AdminAttendanceRecord, AdminAttendanceSession, AdminScheduleBlock } from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import type { Subscription } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Asistencia de seccion</div>
        <div class="text-sm text-slate-600">Crear sesiones y marcar asistencia</div>
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

    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Nueva sesion</div>
        <form class="mt-3 space-y-2" [formGroup]="createForm" (ngSubmit)="createSession()">
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="scheduleBlockId"
          >
            <option value="">Seleccionar bloque</option>
            <option *ngFor="let b of blocks" [value]="b.id">
              {{ b.courseName }} ({{ b.dayOfWeek }} {{ b.startTime }}-{{ b.endTime }})
            </option>
          </select>
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="sessionDate"
            placeholder="YYYY-MM-DD"
          />
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="createForm.invalid || creating"
          >
            {{ creating ? 'Creando...' : 'Crear sesion' }}
          </button>
        </form>
      </div>

      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Curso</th>
              <th class="px-4 py-3">Fecha</th>
              <th class="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of sessions" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ s.courseName }}</td>
              <td class="px-4 py-3 text-slate-700">{{ s.sessionDate }}</td>
              <td class="px-4 py-3">
                <button
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                  (click)="selectSession(s)"
                >
                  Marcar
                </button>
              </td>
            </tr>
            <tr *ngIf="sessions.length===0" class="border-t border-slate-100">
              <td class="px-4 py-6 text-slate-600" colspan="3">Sin sesiones</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="selectedSession" class="mt-6 rounded-2xl border border-slate-200 bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div class="text-sm font-semibold">
            {{ selectedSession.courseName }} | {{ selectedSession.sessionDate }}
          </div>
          <div class="text-xs text-slate-600">Registros: {{ records.length }}</div>
        </div>
        <button
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          (click)="save()"
          [disabled]="saving"
        >
          {{ saving ? 'Guardando...' : 'Guardar' }}
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Alumno</th>
              <th class="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of records; let i = index" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ r.fullName }}</td>
              <td class="px-4 py-3">
                <select
                  class="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                  [(ngModel)]="records[i].status"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option [ngValue]="AttendanceStatus.ASISTIO">ASISTIO</option>
                  <option [ngValue]="AttendanceStatus.FALTO">FALTO</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdminSectionAttendancePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly AttendanceStatus = AttendanceStatus;
  sectionId = '';
  private routeSub?: Subscription;

  blocks: AdminScheduleBlock[] = [];
  sessions: AdminAttendanceSession[] = [];

  selectedSession: AdminAttendanceSession | null = null;
  records: AdminAttendanceRecord[] = [];

  error: string | null = null;
  creating = false;
  saving = false;

  createForm = this.fb.group({
    scheduleBlockId: ['', [Validators.required]],
    sessionDate: ['', [Validators.required]],
  });

  async ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      this.sectionId = String(params.get('id') ?? '');
      void this.loadAll();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  async loadAll() {
    this.error = null;
    try {
      this.blocks = await firstValueFrom(
        this.http.get<AdminScheduleBlock[]>(
          `/api/admin/schedule-blocks?sectionId=${encodeURIComponent(this.sectionId)}`
        )
      );
      this.sessions = await firstValueFrom(
        this.http.get<AdminAttendanceSession[]>(
          `/api/admin/attendance-sessions?sectionId=${encodeURIComponent(this.sectionId)}`
        )
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar asistencia';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async createSession() {
    this.creating = true;
    this.error = null;
    try {
      const v = this.createForm.value;
      await firstValueFrom(
        this.http.post('/api/admin/attendance-sessions', {
          scheduleBlockId: String(v.scheduleBlockId ?? ''),
          sessionDate: String(v.sessionDate ?? ''),
        })
      );
      await this.loadAll();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear sesion';
    } finally {
      this.creating = false;
      this.cdr.detectChanges();
    }
  }

  async selectSession(s: AdminAttendanceSession) {
    this.selectedSession = s;
    this.error = null;
    try {
      this.records = await firstValueFrom(
        this.http.get<AdminAttendanceRecord[]>(
          `/api/admin/attendance-sessions/${s.id}/records`
        )
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar registros';
      this.records = [];
    } finally {
      this.cdr.detectChanges();
    }
  }

  async save() {
    if (!this.selectedSession) return;
    this.saving = true;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.put(
          `/api/admin/attendance-sessions/${this.selectedSession.id}/records`,
          this.records.map((r) => ({
            studentId: r.studentId,
            status: r.status,
          }))
        )
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar';
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }
}
