import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

interface AdminPeriod {
  id: string;
  code: string;
  name: string;
  kind: 'NIVELACION' | 'REGULAR';
  status: 'ACTIVE' | 'PLANNED' | 'CLOSED' | string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Periodos</div>
        <div class="text-sm text-slate-600">
          Gestiona periodos academicos y define cual queda activo.
        </div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="load()"
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

    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">{{ editingId ? 'Editar periodo' : 'Nuevo periodo' }}</div>
        <p *ngIf="editingId" class="mt-2 text-xs text-slate-600">
          Edita solo nombre y vigencia. Para volver a crear, pulsa "Cancelar edicion".
        </p>
        <form class="mt-3 space-y-2" [formGroup]="form" (ngSubmit)="onSubmitPeriod()">
          <ng-container *ngIf="!editingId; else readonlyStructureFields">
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="code"
              placeholder="Codigo (ej: 2026-1)"
            />
            <select
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="kind"
            >
              <option value="NIVELACION">NIVELACION</option>
              <option value="REGULAR">REGULAR</option>
            </select>
          </ng-container>
          <ng-template #readonlyStructureFields>
            <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span class="font-semibold">Codigo:</span> {{ form.controls.code.value || '-' }}
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span class="font-semibold">Tipo:</span> {{ form.controls.kind.value || '-' }}
            </div>
          </ng-template>
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="name"
            placeholder="Nombre (ej: Nivelacion 2026-I)"
          />
          <div class="grid grid-cols-2 gap-2">
            <label class="text-xs text-slate-600">
              Inicio
              <input
                type="date"
                class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-400"
                formControlName="startsAt"
              />
            </label>
            <label class="text-xs text-slate-600">
              Fin
              <input
                type="date"
                class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-400"
                formControlName="endsAt"
              />
            </label>
          </div>
          <button
            class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="form.invalid || loadingCreate || loadingEdit"
          >
            {{
              loadingCreate || loadingEdit
                ? 'Guardando...'
                : editingId
                  ? 'Guardar cambios'
                  : 'Crear periodo'
            }}
          </button>
          <button
            *ngIf="editingId"
            type="button"
            class="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            (click)="cancelEdit()"
            [disabled]="loadingEdit"
          >
            Cancelar edicion
          </button>
        </form>
      </div>

      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Codigo</th>
              <th class="px-4 py-3">Nombre</th>
              <th class="px-4 py-3">Tipo</th>
              <th class="px-4 py-3">Estado</th>
              <th class="px-4 py-3">Vigencia</th>
              <th class="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of periods; trackBy: trackPeriod" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ p.code }}</td>
              <td class="px-4 py-3">{{ p.name }}</td>
              <td class="px-4 py-3">{{ p.kind }}</td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full px-2 py-1 text-[11px] font-semibold"
                  [class.bg-emerald-100]="p.status === 'ACTIVE'"
                  [class.text-emerald-700]="p.status === 'ACTIVE'"
                  [class.bg-slate-100]="p.status !== 'ACTIVE'"
                  [class.text-slate-700]="p.status !== 'ACTIVE'"
                >
                  {{ p.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-700">{{ formatRange(p.startsAt, p.endsAt) }}</td>
              <td class="px-4 py-3">
                <button
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                  [disabled]="loadingEdit"
                  (click)="startEdit(p)"
                >
                  {{ editingId === p.id ? '...' : 'Editar' }}
                </button>
                <button
                  class="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                  [disabled]="p.status === 'ACTIVE' || activatingId === p.id"
                  (click)="activatePeriod(p.id)"
                >
                  {{
                    activatingId === p.id
                      ? 'Activando...'
                      : p.status === 'ACTIVE'
                        ? 'Activo'
                        : 'Activar'
                  }}
                </button>
                <button
                  class="ml-2 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 disabled:opacity-60"
                  [disabled]="clearingId === p.id"
                  (click)="clearData(p.id)"
                >
                  {{ clearingId === p.id ? '...' : 'Borrar datos' }}
                </button>
                <button
                  class="ml-2 rounded-lg border border-red-300 bg-white text-red-700 px-3 py-1.5 text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
                  [disabled]="deletingId === p.id"
                  (click)="deleteAll(p.id)"
                >
                  {{ deletingId === p.id ? '...' : 'Borrar todo' }}
                </button>
              </td>
            </tr>
            <tr *ngIf="periods.length === 0" class="border-t border-slate-100">
              <td class="px-4 py-5 text-slate-500" colspan="6">Sin periodos</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div *ngIf="confirmState.isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transform transition-all">
        <h3 class="text-lg font-semibold text-slate-900">{{ confirmState.title }}</h3>
        <p class="mt-2 text-sm text-slate-600 leading-relaxed">{{ confirmState.message }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            (click)="confirmState.isOpen = false"
          >
            Cancelar
          </button>
          <button
            class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
            (click)="confirmState.onConfirm()"
          >
            {{ confirmState.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminPeriodsPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  periods: AdminPeriod[] = [];
  error: string | null = null;
  loadingCreate = false;
  activatingId: string | null = null;
  clearingId: string | null = null;
  deletingId: string | null = null;
  editingId: string | null = null;
  loadingEdit = false;
  confirmState = {
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    onConfirm: () => { },
  };

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(40)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    kind: ['NIVELACION' as 'NIVELACION' | 'REGULAR', [Validators.required]],
    startsAt: [''],
    endsAt: [''],
  });

  async ngOnInit() {
    await this.load();
  }

  trackPeriod(_: number, item: AdminPeriod) {
    return item.id;
  }

  formatRange(startsAt: string | null, endsAt: string | null) {
    if (startsAt && endsAt) return `${startsAt} a ${endsAt}`;
    if (startsAt) return `Desde ${startsAt}`;
    if (endsAt) return `Hasta ${endsAt}`;
    return 'Sin rango';
  }

  async load() {
    this.error = null;
    try {
      this.periods = await firstValueFrom(this.http.get<AdminPeriod[]>('/api/admin/periods'));
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar periodos';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onSubmitPeriod() {
    if (this.editingId) {
      await this.updatePeriod();
      return;
    }
    await this.createPeriod();
  }

  async createPeriod() {
    if (this.form.invalid) return;
    this.loadingCreate = true;
    this.error = null;
    try {
      const v = this.form.value;
      await firstValueFrom(
        this.http.post('/api/admin/periods', {
          code: String(v.code ?? '').trim(),
          name: String(v.name ?? '').trim(),
          kind: v.kind ?? 'NIVELACION',
          startsAt: String(v.startsAt ?? '').trim() || null,
          endsAt: String(v.endsAt ?? '').trim() || null,
        })
      );
      this.form.reset({ code: '', name: '', kind: 'NIVELACION', startsAt: '', endsAt: '' });
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear periodo';
    } finally {
      this.loadingCreate = false;
      this.cdr.detectChanges();
    }
  }

  async activatePeriod(id: string) {
    this.activatingId = id;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/periods/${encodeURIComponent(id)}/activate`, {})
      );
      await this.load();
      window.location.reload();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo activar periodo';
    } finally {
      this.activatingId = null;
      this.cdr.detectChanges();
    }
  }

  startEdit(period: AdminPeriod) {
    this.editingId = period.id;
    this.form.reset({
      code: period.code,
      name: period.name,
      kind: (period.kind as 'NIVELACION' | 'REGULAR') ?? 'NIVELACION',
      startsAt: period.startsAt ?? '',
      endsAt: period.endsAt ?? '',
    });
  }

  cancelEdit() {
    if (this.loadingEdit) return;
    this.editingId = null;
    this.form.reset({ code: '', name: '', kind: 'NIVELACION', startsAt: '', endsAt: '' });
  }

  async updatePeriod() {
    if (!this.editingId || this.form.invalid) return;
    this.loadingEdit = true;
    this.error = null;
    try {
      const v = this.form.value;
      await firstValueFrom(
        this.http.patch(`/api/admin/periods/${encodeURIComponent(this.editingId)}`, {
          name: String(v.name ?? '').trim(),
          startsAt: String(v.startsAt ?? '').trim() || null,
          endsAt: String(v.endsAt ?? '').trim() || null,
        })
      );
      this.cancelEdit();
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar periodo';
    } finally {
      this.loadingEdit = false;
      this.cdr.detectChanges();
    }
  }

  askConfirmation(title: string, message: string, onConfirm: () => void) {
    this.confirmState = {
      isOpen: true,
      title,
      message,
      confirmLabel: 'Confirmar',
      onConfirm: () => {
        this.confirmState.isOpen = false;
        onConfirm();
      },
    };
  }

  clearData(id: string) {
    this.askConfirmation(
      'Borrar datos del periodo',
      'Se eliminaran secciones, alumnos, horarios, asistencias y matriculas del periodo, pero el periodo se conservara.',
      () => this.executeClearData(id)
    );
  }

  async executeClearData(id: string) {
    this.clearingId = id;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.delete(`/api/admin/periods/${encodeURIComponent(id)}/data`)
      );
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo borrar datos del periodo';
      this.clearingId = null;
      this.cdr.detectChanges();
      return;
    }
    this.clearingId = null;
    this.cdr.detectChanges();
  }

  deleteAll(id: string) {
    this.askConfirmation(
      'Borrar todo el periodo',
      'Se eliminara el periodo completo junto con todos sus datos. Esta accion no se puede deshacer.',
      () => this.executeDeleteAll(id)
    );
  }

  async executeDeleteAll(id: string) {
    this.deletingId = id;
    this.error = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/periods/${encodeURIComponent(id)}`));
      await this.load();
      window.location.reload();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo borrar todo el periodo';
      this.deletingId = null;
      this.cdr.detectChanges();
      return;
    }
    this.deletingId = null;
    this.cdr.detectChanges();
  }
}

