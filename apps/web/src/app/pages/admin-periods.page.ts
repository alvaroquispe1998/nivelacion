import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

interface AdminPeriod {
  id: string;
  code: string;
  name: string;
  kind: 'LEVELING' | 'SEMESTER';
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
        <div class="text-sm font-semibold">Nuevo periodo</div>
        <form class="mt-3 space-y-2" [formGroup]="form" (ngSubmit)="createPeriod()">
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="code"
            placeholder="Codigo (ej: 2026-1)"
          />
          <input
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="name"
            placeholder="Nombre (ej: Nivelacion 2026-I)"
          />
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="kind"
          >
            <option value="LEVELING">LEVELING</option>
            <option value="SEMESTER">SEMESTER</option>
          </select>
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
            [disabled]="form.invalid || loadingCreate"
          >
            {{ loadingCreate ? 'Guardando...' : 'Crear periodo' }}
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
              </td>
            </tr>
            <tr *ngIf="periods.length === 0" class="border-t border-slate-100">
              <td class="px-4 py-5 text-slate-500" colspan="6">Sin periodos</td>
            </tr>
          </tbody>
        </table>
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

  form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(40)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    kind: ['LEVELING' as 'LEVELING' | 'SEMESTER', [Validators.required]],
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
          kind: v.kind ?? 'LEVELING',
          startsAt: String(v.startsAt ?? '').trim() || null,
          endsAt: String(v.endsAt ?? '').trim() || null,
        })
      );
      this.form.reset({ code: '', name: '', kind: 'LEVELING', startsAt: '', endsAt: '' });
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
}

