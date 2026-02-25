import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import type { AdminClassroom, AdminPavilion } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

interface CampusOption {
  id: string;
  name: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Pabellon y Aulas</div>
        <div class="text-sm text-slate-600">Gestion de pabellones y aulas por sede (capacidad fisica real)</div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
      >
        Refrescar
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Nuevo pabellon</div>
        <form class="mt-3 space-y-2" [formGroup]="createPavilionForm" (ngSubmit)="createPavilion()">
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="campusId"
          >
            <option value="">Selecciona sede</option>
            <option *ngFor="let c of campuses; trackBy: trackCampus" [value]="c.id">
              {{ c.name }}
            </option>
          </select>
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="code"
            placeholder="Codigo (ej: C)"
          />
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="name"
            placeholder="Nombre (ej: PABELLON C)"
          />
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="createPavilionForm.invalid || loadingCreatePavilion"
          >
            {{ loadingCreatePavilion ? 'Guardando...' : 'Crear pabellon' }}
          </button>
        </form>
      </div>

      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex items-center gap-2">
          <div class="text-sm font-semibold">Pabellones por sede</div>
          <select
            class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="pavilionCampusFilterId"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="onPavilionCampusFilterChange()"
          >
            <option value="">Todas las sedes</option>
            <option *ngFor="let c of campuses; trackBy: trackCampus" [value]="c.id">{{ c.name }}</option>
          </select>
        </div>

        <div class="mt-3 max-h-[320px] overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-2">Sede</th>
                <th class="px-3 py-2">Codigo</th>
                <th class="px-3 py-2">Nombre</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let p of filteredPavilions; trackBy: trackPavilion"
                class="border-t border-slate-100"
                [ngClass]="isPavilionSelected(p) ? 'bg-emerald-50/60' : ''"
              >
                <td class="px-3 py-2 text-[11px]">{{ p.campusName || campusNameById(p.campusId) }}</td>
                <td class="px-3 py-2">
                  <input
                    class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    [(ngModel)]="pavilionDraftFor(p.id).code"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </td>
                <td class="px-3 py-2">
                  <input
                    class="w-48 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    [(ngModel)]="pavilionDraftFor(p.id).name"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </td>
                <td class="px-3 py-2">
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    [ngClass]="p.status === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                  >
                    {{ p.status }}
                  </span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap gap-1">
                    <button
                      class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-slate-50"
                      (click)="selectPavilion(p)"
                    >
                      Ver aulas
                    </button>
                    <button
                      class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-60"
                      (click)="updatePavilion(p.id)"
                      [disabled]="loadingUpdatePavilionId === p.id"
                    >
                      {{ loadingUpdatePavilionId === p.id ? 'Guardando...' : 'Guardar' }}
                    </button>
                    <button
                      class="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                      (click)="togglePavilionStatus(p)"
                      [disabled]="loadingStatusPavilionId === p.id"
                    >
                      {{ loadingStatusPavilionId === p.id ? 'Actualizando...' : (p.status === 'ACTIVO' ? 'Inactivar' : 'Activar') }}
                    </button>
                    <button
                      class="rounded-lg border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      (click)="removePavilion(p.id)"
                      [disabled]="loadingDeletePavilionId === p.id"
                    >
                      {{ loadingDeletePavilionId === p.id ? 'Eliminando...' : 'Eliminar' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="filteredPavilions.length === 0" class="border-t border-slate-100">
                <td class="px-3 py-3 text-slate-500" colspan="5">Sin pabellones registrados</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      class="mt-5 rounded-2xl border border-slate-200 bg-white p-4"
      *ngIf="selectedPavilion; else selectPavilionEmpty"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-sm font-semibold">Aulas de {{ selectedPavilionLabel }} - {{ selectedCampusName }}</div>
          <div class="text-xs text-slate-500">Solo se listan y registran aulas de este pabellon.</div>
        </div>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
          (click)="clearPavilionSelection()"
        >
          Cambiar pabellon
        </button>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div class="text-sm font-semibold">Nueva aula</div>
          <div class="mt-1 text-xs text-slate-500">
            Sede: {{ selectedCampusName }} | Pabellon: {{ selectedPavilionLabel }}
          </div>
          <form class="mt-3 space-y-2" [formGroup]="createForm" (ngSubmit)="createClassroom()">
            <input
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              formControlName="levelName"
              placeholder="Nivel/Piso (ej: 1 PISO)"
            />

            <input
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              formControlName="code"
              placeholder="Codigo (ej: 101C)"
            />

            <input
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              formControlName="name"
              placeholder="Nombre (ej: AULA 101 C)"
            />

            <div class="grid grid-cols-2 gap-2">
              <input
                type="number"
                min="1"
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                formControlName="capacity"
                placeholder="Aforo"
              />
              <select
                class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                formControlName="type"
              >
                <option value="AULA">AULA</option>
                <option value="LABORATORIO">LABORATORIO</option>
                <option value="AUDITORIO">AUDITORIO</option>
              </select>
            </div>

            <textarea
              rows="2"
              class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              formControlName="notes"
              placeholder="Observacion (opcional)"
            ></textarea>

            <button
              class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="!selectedPavilionId || createForm.invalid || loadingCreate"
            >
              {{ loadingCreate ? 'Guardando...' : 'Crear aula' }}
            </button>
          </form>
        </div>

        <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-4 py-3">Nivel</th>
                <th class="px-4 py-3">Codigo</th>
                <th class="px-4 py-3">Nombre</th>
                <th class="px-4 py-3">Aforo</th>
                <th class="px-4 py-3">Tipo</th>
                <th class="px-4 py-3">Estado</th>
                <th class="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of classroomsBySelectedPavilion; trackBy: trackClassroom" class="border-t border-slate-100">
                <td class="px-4 py-3">
                  <input
                    class="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    [(ngModel)]="draftFor(r.id).levelName"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </td>
                <td class="px-4 py-3">
                  <input
                    class="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    [(ngModel)]="draftFor(r.id).code"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </td>
                <td class="px-4 py-3">
                  <input
                    class="w-48 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    [(ngModel)]="draftFor(r.id).name"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </td>
                <td class="px-4 py-3">
                  <input
                    type="number"
                    min="1"
                    class="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    [(ngModel)]="draftFor(r.id).capacity"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </td>
                <td class="px-4 py-3">
                  <select
                    class="w-36 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    [(ngModel)]="draftFor(r.id).type"
                    [ngModelOptions]="{ standalone: true }"
                  >
                    <option value="AULA">AULA</option>
                    <option value="LABORATORIO">LABORATORIO</option>
                    <option value="AUDITORIO">AUDITORIO</option>
                  </select>
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    [ngClass]="r.status === 'ACTIVA' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                  >
                    {{ r.status }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-2">
                    <button
                      class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                      (click)="updateClassroom(r.id)"
                      [disabled]="loadingUpdateId === r.id"
                    >
                      {{ loadingUpdateId === r.id ? 'Guardando...' : 'Guardar' }}
                    </button>
                    <button
                      class="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                      (click)="toggleStatus(r)"
                      [disabled]="loadingStatusId === r.id"
                    >
                      {{ loadingStatusId === r.id ? 'Actualizando...' : (r.status === 'ACTIVA' ? 'Inactivar' : 'Activar') }}
                    </button>
                    <button
                      class="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      (click)="removeClassroom(r.id)"
                      [disabled]="loadingDeleteId === r.id"
                    >
                      {{ loadingDeleteId === r.id ? 'Eliminando...' : 'Eliminar' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="classroomsBySelectedPavilion.length === 0" class="border-t border-slate-100">
                <td class="px-4 py-5 text-slate-500" colspan="7">Sin aulas registradas en este pabellon</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <ng-template #selectPavilionEmpty>
      <div class="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        Selecciona un pabellon para gestionar sus aulas.
      </div>
    </ng-template>
  `,
})
export class AdminClassroomsPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  classroomsBySelectedPavilion: AdminClassroom[] = [];
  campuses: CampusOption[] = [];
  pavilions: AdminPavilion[] = [];

  selectedPavilionId = '';
  selectedCampusId = '';
  selectedPavilionLabel = '';

  pavilionCampusFilterId = '';

  drafts: Record<
    string,
    {
      campusId: string;
      pavilionId: string;
      code: string;
      name: string;
      capacity: number;
      levelName: string;
      type: 'AULA' | 'LABORATORIO' | 'AUDITORIO';
      notes: string;
    }
  > = {};

  pavilionDrafts: Record<
    string,
    {
      campusId: string;
      code: string;
      name: string;
    }
  > = {};

  error: string | null = null;

  loadingCreate = false;
  loadingUpdateId: string | null = null;
  loadingStatusId: string | null = null;
  loadingDeleteId: string | null = null;
  loadingPavilionClassrooms = false;

  loadingCreatePavilion = false;
  loadingUpdatePavilionId: string | null = null;
  loadingStatusPavilionId: string | null = null;
  loadingDeletePavilionId: string | null = null;

  createPavilionForm = this.fb.group({
    campusId: ['', [Validators.required]],
    code: ['', [Validators.required, Validators.maxLength(60)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
  });

  createForm = this.fb.group({
    campusId: ['', [Validators.required]],
    pavilionId: ['', [Validators.required]],
    levelName: ['', [Validators.required, Validators.maxLength(80)]],
    code: ['', [Validators.required, Validators.maxLength(60)]],
    name: ['', [Validators.required, Validators.maxLength(160)]],
    capacity: [45, [Validators.required, Validators.min(1)]],
    type: ['AULA' as 'AULA' | 'LABORATORIO' | 'AUDITORIO', [Validators.required]],
    notes: [''],
  });

  get filteredPavilions() {
    const campusId = String(this.pavilionCampusFilterId ?? '').trim();
    if (!campusId) return this.pavilions;
    return this.pavilions.filter((p) => String(p.campusId ?? '').trim() === campusId);
  }

  get selectedPavilion(): AdminPavilion | null {
    if (!this.selectedPavilionId) return null;
    return this.pavilions.find((p) => p.id === this.selectedPavilionId) ?? null;
  }

  get selectedCampusName() {
    return this.selectedCampusId ? this.campusNameById(this.selectedCampusId) : '-';
  }

  async ngOnInit() {
    await this.load();
  }

  trackClassroom(_: number, item: AdminClassroom) {
    return item.id;
  }

  trackCampus(_: number, item: CampusOption) {
    return item.id;
  }

  trackPavilion(_: number, item: AdminPavilion) {
    return item.id;
  }

  campusNameById(campusId: string) {
    const match = this.campuses.find((c) => c.id === campusId);
    return match?.name ?? '-';
  }

  pavilionDraftFor(id: string) {
    if (!this.pavilionDrafts[id]) {
      this.pavilionDrafts[id] = {
        campusId: '',
        code: '',
        name: '',
      };
    }
    return this.pavilionDrafts[id];
  }

  draftFor(id: string) {
    if (!this.drafts[id]) {
      this.drafts[id] = {
        campusId: this.selectedCampusId,
        pavilionId: this.selectedPavilionId,
        code: '',
        name: '',
        capacity: 45,
        levelName: '',
        type: 'AULA',
        notes: '',
      };
    }
    return this.drafts[id];
  }

  isPavilionSelected(pavilion: AdminPavilion) {
    return String(this.selectedPavilionId ?? '') === String(pavilion.id ?? '');
  }

  onPavilionCampusFilterChange() {
    if (!this.selectedPavilion) return;
    const currentFilter = String(this.pavilionCampusFilterId ?? '').trim();
    if (!currentFilter) return;
    if (String(this.selectedPavilion.campusId ?? '').trim() !== currentFilter) {
      this.clearPavilionSelection();
    }
  }

  private syncCreateFormWithSelection() {
    this.createForm.patchValue({
      campusId: this.selectedCampusId,
      pavilionId: this.selectedPavilionId,
    });
  }

  async selectPavilion(pavilion: AdminPavilion) {
    this.selectedPavilionId = String(pavilion.id ?? '').trim();
    this.selectedCampusId = String(pavilion.campusId ?? '').trim();
    this.selectedPavilionLabel = `${pavilion.code} - ${pavilion.name}`;
    this.syncCreateFormWithSelection();
    await this.loadClassroomsForSelectedPavilion();
  }

  clearPavilionSelection() {
    this.selectedPavilionId = '';
    this.selectedCampusId = '';
    this.selectedPavilionLabel = '';
    this.classroomsBySelectedPavilion = [];
    this.drafts = {};
    this.createForm.reset({
      campusId: '',
      pavilionId: '',
      levelName: '',
      code: '',
      name: '',
      capacity: 45,
      type: 'AULA',
      notes: '',
    });
  }

  private async loadClassroomsForSelectedPavilion() {
    if (!this.selectedPavilionId) {
      this.classroomsBySelectedPavilion = [];
      this.drafts = {};
      return;
    }

    this.loadingPavilionClassrooms = true;
    try {
      const params = new HttpParams().set('pavilionId', this.selectedPavilionId);
      const classrooms = await firstValueFrom(
        this.http.get<AdminClassroom[]>('/api/admin/classrooms', { params })
      );
      this.classroomsBySelectedPavilion = classrooms;

      this.drafts = {};
      for (const room of classrooms) {
        this.drafts[room.id] = {
          campusId: String(room.campusId ?? this.selectedCampusId).trim(),
          pavilionId: String(room.pavilionId ?? this.selectedPavilionId).trim(),
          code: room.code,
          name: room.name,
          capacity: Number(room.capacity ?? 45),
          levelName: String(room.levelName ?? '').trim(),
          type: room.type ?? 'AULA',
          notes: room.notes ?? '',
        };
      }
    } finally {
      this.loadingPavilionClassrooms = false;
      this.cdr.detectChanges();
    }
  }

  async load() {
    this.error = null;
    try {
      const [campuses, pavilions] = await Promise.all([
        firstValueFrom(this.http.get<CampusOption[]>('/api/admin/classrooms/campuses')),
        firstValueFrom(this.http.get<AdminPavilion[]>('/api/admin/classrooms/pavilions')),
      ]);
      this.campuses = campuses;
      this.pavilions = pavilions;

      this.pavilionDrafts = {};
      for (const pavilion of this.pavilions) {
        this.pavilionDrafts[pavilion.id] = {
          campusId: String(pavilion.campusId ?? '').trim(),
          code: pavilion.code,
          name: pavilion.name,
        };
      }

      if (
        this.pavilionCampusFilterId &&
        !this.campuses.some((c) => c.id === this.pavilionCampusFilterId)
      ) {
        this.pavilionCampusFilterId = '';
      }

      if (this.selectedPavilionId) {
        const selected = this.pavilions.find((p) => p.id === this.selectedPavilionId);
        if (!selected) {
          this.clearPavilionSelection();
        } else {
          this.selectedCampusId = String(selected.campusId ?? '').trim();
          this.selectedPavilionLabel = `${selected.code} - ${selected.name}`;
          this.syncCreateFormWithSelection();
          await this.loadClassroomsForSelectedPavilion();
        }
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar aulas y pabellones';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async createPavilion() {
    if (this.createPavilionForm.invalid) return;
    this.loadingCreatePavilion = true;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.post('/api/admin/classrooms/pavilions', {
          campusId: String(this.createPavilionForm.value.campusId ?? '').trim(),
          code: String(this.createPavilionForm.value.code ?? '').trim().toUpperCase(),
          name: String(this.createPavilionForm.value.name ?? '').trim(),
        })
      );
      this.createPavilionForm.reset({
        campusId: '',
        code: '',
        name: '',
      });
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear pabellon';
    } finally {
      this.loadingCreatePavilion = false;
      this.cdr.detectChanges();
    }
  }

  async updatePavilion(id: string) {
    this.loadingUpdatePavilionId = id;
    this.error = null;
    try {
      const d = this.pavilionDraftFor(id);
      await firstValueFrom(
        this.http.patch(`/api/admin/classrooms/pavilions/${id}`, {
          campusId: String(d.campusId ?? '').trim(),
          code: String(d.code ?? '').trim().toUpperCase(),
          name: String(d.name ?? '').trim(),
        })
      );
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar pabellon';
    } finally {
      this.loadingUpdatePavilionId = null;
      this.cdr.detectChanges();
    }
  }

  async togglePavilionStatus(pavilion: AdminPavilion) {
    this.loadingStatusPavilionId = pavilion.id;
    this.error = null;
    try {
      const nextStatus = pavilion.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
      await firstValueFrom(
        this.http.patch(`/api/admin/classrooms/pavilions/${pavilion.id}/status`, {
          status: nextStatus,
        })
      );
      await this.load();
      if (nextStatus === 'INACTIVO' && this.selectedPavilionId === pavilion.id) {
        this.clearPavilionSelection();
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar estado del pabellon';
    } finally {
      this.loadingStatusPavilionId = null;
      this.cdr.detectChanges();
    }
  }

  async removePavilion(id: string) {
    this.loadingDeletePavilionId = id;
    this.error = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/classrooms/pavilions/${id}`));
      if (this.selectedPavilionId === id) {
        this.clearPavilionSelection();
      }
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar pabellon';
    } finally {
      this.loadingDeletePavilionId = null;
      this.cdr.detectChanges();
    }
  }

  async createClassroom() {
    if (!this.selectedPavilionId || !this.selectedCampusId || this.createForm.invalid) return;
    this.loadingCreate = true;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.post('/api/admin/classrooms', {
          campusId: this.selectedCampusId,
          pavilionId: this.selectedPavilionId,
          levelName: String(this.createForm.value.levelName ?? '').trim(),
          code: String(this.createForm.value.code ?? '').trim().toUpperCase(),
          name: String(this.createForm.value.name ?? '').trim(),
          capacity: Number(this.createForm.value.capacity ?? 45),
          type: this.createForm.value.type,
          notes: String(this.createForm.value.notes ?? '').trim() || null,
        })
      );
      this.createForm.patchValue({
        campusId: this.selectedCampusId,
        pavilionId: this.selectedPavilionId,
        levelName: '',
        code: '',
        name: '',
        capacity: 45,
        type: 'AULA',
        notes: '',
      });
      await this.loadClassroomsForSelectedPavilion();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear aula';
    } finally {
      this.loadingCreate = false;
      this.cdr.detectChanges();
    }
  }

  async updateClassroom(id: string) {
    this.loadingUpdateId = id;
    this.error = null;
    try {
      const d = this.draftFor(id);
      await firstValueFrom(
        this.http.patch(`/api/admin/classrooms/${id}`, {
          campusId: this.selectedCampusId,
          pavilionId: this.selectedPavilionId,
          levelName: String(d.levelName ?? '').trim(),
          code: String(d.code ?? '').trim().toUpperCase(),
          name: String(d.name ?? '').trim(),
          capacity: Math.max(1, Number(d.capacity ?? 1)),
          type: d.type,
          notes: String(d.notes ?? '').trim() || null,
        })
      );
      await this.loadClassroomsForSelectedPavilion();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar aula';
    } finally {
      this.loadingUpdateId = null;
      this.cdr.detectChanges();
    }
  }

  async toggleStatus(room: AdminClassroom) {
    this.loadingStatusId = room.id;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/classrooms/${room.id}/status`, {
          status: room.status === 'ACTIVA' ? 'INACTIVA' : 'ACTIVA',
        })
      );
      await this.loadClassroomsForSelectedPavilion();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar estado del aula';
    } finally {
      this.loadingStatusId = null;
      this.cdr.detectChanges();
    }
  }

  async removeClassroom(id: string) {
    this.loadingDeleteId = id;
    this.error = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/classrooms/${id}`));
      await this.loadClassroomsForSelectedPavilion();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar aula';
    } finally {
      this.loadingDeleteId = null;
      this.cdr.detectChanges();
    }
  }
}
