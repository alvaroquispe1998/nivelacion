import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AdminSection } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Secciones</div>
        <div class="text-sm text-slate-600">Gestion de secciones, aforo y matriculas</div>
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
      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Seccion</th>
              <th class="px-4 py-3">Datos</th>
              <th class="px-4 py-3">Aforo</th>
              <th class="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of sections" class="border-t border-slate-100">
              <td class="px-4 py-3">
                <div class="font-semibold">{{ s.name }}</div>
                <div class="text-xs text-slate-600" *ngIf="s.code">{{ s.code }}</div>
              </td>
              <td class="px-4 py-3 text-xs">
                <div><b>Facultad:</b> {{ s.facultyGroup || '-' }}</div>
                <div><b>Sede:</b> {{ s.campusName || '-' }}</div>
                <div><b>Modalidad:</b> {{ s.modality || '-' }}</div>
              </td>
              <td class="px-4 py-3">
                <div class="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                    [(ngModel)]="draftFor(s.id).initialCapacity"
                  />
                  <input
                    type="number"
                    min="0"
                    class="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
                    [(ngModel)]="draftFor(s.id).maxExtraCapacity"
                  />
                </div>
                <div class="mt-1 text-[11px] text-slate-500">inicial + extra (0 = sin maximo)</div>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-2">
                  <button
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                    (click)="saveCapacity(s.id)"
                    [disabled]="loadingCapacityId === s.id"
                  >
                    {{ loadingCapacityId === s.id ? 'Guardando...' : 'Guardar aforo' }}
                  </button>
                  <a
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    [routerLink]="['/admin/sections', s.id, 'schedule']"
                    >Horario</a
                  >
                  <a
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    [routerLink]="['/admin/sections', s.id, 'attendance']"
                    >Asistencia</a
                  >
                </div>
              </td>
            </tr>
            <tr *ngIf="sections.length===0" class="border-t border-slate-100">
              <td class="px-4 py-6 text-slate-600" colspan="4">Sin secciones</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <div class="text-sm font-semibold">Crear seccion</div>
          <form class="mt-2 space-y-2" [formGroup]="createForm" (ngSubmit)="createSection()">
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="name"
              placeholder="Nombre de seccion"
            />
            <button
              class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="createForm.invalid || loadingCreate"
            >
              {{ loadingCreate ? 'Creando...' : 'Crear' }}
            </button>
          </form>
        </div>

        <div class="border-t border-slate-200 pt-4">
          <div class="text-sm font-semibold">Matricula bulk (DNIs)</div>
          <form class="mt-2 space-y-2" [formGroup]="bulkForm" (ngSubmit)="bulkEnroll()">
            <select
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="sectionId"
            >
              <option value="">Seleccionar seccion</option>
              <option *ngFor="let s of sections" [value]="s.id">{{ s.name }}</option>
            </select>
            <textarea
              class="w-full min-h-32 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="dnisText"
              placeholder="Un DNI por linea"
            ></textarea>
            <button
              class="w-full rounded-xl border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              [disabled]="bulkForm.invalid || loadingBulk"
            >
              {{ loadingBulk ? 'Procesando...' : 'Matricular' }}
            </button>
          </form>

          <div *ngIf="bulkResult" class="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            <div><b>Enrolled:</b> {{ bulkResult.enrolled.length }}</div>
            <div><b>Already:</b> {{ bulkResult.alreadyEnrolled.length }}</div>
            <div><b>Not found:</b> {{ bulkResult.notFound.length }}</div>
            <div><b>Conflicts:</b> {{ bulkResult.conflicts.length }}</div>
          </div>
        </div>

        <div class="border-t border-slate-200 pt-4">
          <div class="text-sm font-semibold">Importar desde Akademic</div>
          <div class="mt-1 text-xs text-slate-600">
            Endpoint listo: <code>/api/integrations/akademic/secciones</code> (solo ADMIN).
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminSectionsPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  sections: AdminSection[] = [];
  capacityDraft: Record<string, { initialCapacity: number; maxExtraCapacity: number }> = {};
  error: string | null = null;

  loadingCreate = false;
  loadingBulk = false;
  loadingCapacityId: string | null = null;
  bulkResult: any = null;
  private retryEmptyOnce = false;

  createForm = this.fb.group({
    name: ['', [Validators.required]],
  });

  bulkForm = this.fb.group({
    sectionId: ['', [Validators.required]],
    dnisText: ['', [Validators.required]],
  });

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.error = null;
    try {
      this.sections = await firstValueFrom(
        this.http.get<AdminSection[]>('/api/admin/sections')
      );

      this.capacityDraft = {};
      for (const s of this.sections) {
        this.capacityDraft[s.id] = {
          initialCapacity: Number(s.initialCapacity ?? 45),
          maxExtraCapacity: Number(s.maxExtraCapacity ?? 0),
        };
      }

      if (this.sections.length === 0 && !this.retryEmptyOnce) {
        this.retryEmptyOnce = true;
        setTimeout(() => {
          void this.load();
        }, 350);
      } else if (this.sections.length > 0) {
        this.retryEmptyOnce = true;
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar secciones';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async saveCapacity(sectionId: string) {
    const draft = this.draftFor(sectionId);
    this.loadingCapacityId = sectionId;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/sections/${sectionId}/capacity`, {
          initialCapacity: Number(draft.initialCapacity),
          maxExtraCapacity: Number(draft.maxExtraCapacity),
        })
      );
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar aforo';
    } finally {
      this.loadingCapacityId = null;
      this.cdr.detectChanges();
    }
  }

  draftFor(sectionId: string) {
    if (!this.capacityDraft[sectionId]) {
      this.capacityDraft[sectionId] = {
        initialCapacity: 45,
        maxExtraCapacity: 0,
      };
    }
    return this.capacityDraft[sectionId];
  }

  async createSection() {
    this.loadingCreate = true;
    this.error = null;
    try {
      const name = String(this.createForm.value.name ?? '').trim();
      await firstValueFrom(this.http.post('/api/admin/sections', { name }));
      this.createForm.reset();
      await this.load();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear seccion';
    } finally {
      this.loadingCreate = false;
      this.cdr.detectChanges();
    }
  }

  async bulkEnroll() {
    this.loadingBulk = true;
    this.error = null;
    this.bulkResult = null;
    try {
      const sectionId = String(this.bulkForm.value.sectionId ?? '');
      const raw = String(this.bulkForm.value.dnisText ?? '');
      const dnis = raw
        .split(/\r?\n/g)
        .map((x) => x.trim())
        .filter(Boolean);

      this.bulkResult = await firstValueFrom(
        this.http.post(`/api/admin/sections/${sectionId}/enrollments/bulk`, { dnis })
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo matricular';
    } finally {
      this.loadingBulk = false;
      this.cdr.detectChanges();
    }
  }
}
