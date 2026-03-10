import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { skip, Subscription } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import { AdminWorkshopsService, WorkshopRow } from './admin-workshops.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="text-xl font-semibold">Talleres</div>
        <div class="text-sm text-slate-600">
          Gestiona el flujo de talleres en pasos: cabecera, grupos y preview final.
        </div>
      </div>
      <div class="flex gap-2">
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="loadAll()"
        >
          Refrescar
        </button>
        <a
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          routerLink="/admin/workshops/new"
        >
          Crear nuevo taller
        </a>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {{ success }}
    </div>

    <div *ngIf="loading" class="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Cargando talleres...
    </div>

    <div *ngIf="!loading" class="mt-4 rounded-2xl border border-slate-200 bg-white">
      <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
        Talleres creados
      </div>

      <div *ngIf="workshops.length === 0" class="px-4 py-8 text-sm text-slate-500">
        No hay talleres creados. Empieza creando la cabecera del taller y la selección de alumnos.
      </div>

      <div *ngIf="workshops.length > 0" class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-3 py-2">Taller</th>
              <th class="px-3 py-2">Responsable</th>
              <th class="px-3 py-2">Modo</th>
              <th class="px-3 py-2">Alumnos</th>
              <th class="px-3 py-2">Grupos</th>
              <th class="px-3 py-2">Horarios</th>
              <th class="px-3 py-2">Ultima aplicacion</th>
              <th class="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let workshop of workshops" class="border-t border-slate-100 align-top">
              <td class="px-3 py-3">
                <div class="font-semibold text-slate-900">{{ workshop.name }}</div>
                <div class="mt-1 text-xs text-slate-500">
                  {{ deliveryLabel(workshop) }}
                </div>
              </td>
              <td class="px-3 py-3">
                <div class="font-semibold text-slate-900">{{ responsibleLabel(workshop) }}</div>
                <div class="mt-1 text-xs text-slate-500">
                  {{ workshop.responsibleTeacherDni || 'Sin DNI' }}
                </div>
              </td>
              <td class="px-3 py-3">
                <div>{{ workshop.mode === 'BY_SIZE' ? 'Por tamaño de grupo' : 'Grupo único' }}</div>
                <div class="mt-1 text-xs text-slate-500">
                  {{ workshop.mode === 'BY_SIZE' ? 'Tamaño ' + (workshop.groupSize || '-') : '1 grupo base' }}
                </div>
              </td>
              <td class="px-3 py-3 font-semibold">
                {{ workshop.selectedStudentsCount ?? 0 }}
              </td>
              <td class="px-3 py-3">
                <div class="font-semibold">{{ workshop.groupsCount ?? 0 }}</div>
                <div class="mt-1 text-xs text-slate-500">
                  {{ groupsStatusLabel(workshop) }}
                </div>
              </td>
              <td class="px-3 py-3">
                <div class="font-semibold">{{ workshop.scheduledGroupsCount ?? 0 }}/{{ workshop.groupsCount ?? 0 }}</div>
                <div class="mt-1 text-xs text-slate-500">
                  {{ scheduleStatusLabel(workshop) }}
                </div>
              </td>
              <td class="px-3 py-3">
                <div *ngIf="workshop.lastApplicationAt; else noApplication" class="text-xs text-slate-700">
                  {{ workshop.lastApplicationAt | date: 'dd/MM/yyyy HH:mm' }}
                </div>
                <ng-template #noApplication>
                  <span class="text-xs text-slate-500">Aun no aplicado</span>
                </ng-template>
              </td>
              <td class="px-3 py-3">
                <div class="flex flex-wrap gap-1">
                  <a
                    class="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    [routerLink]="['/admin/workshops', workshop.id, 'edit']"
                  >
                    Editar cabecera
                  </a>
                  <a
                    class="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    [routerLink]="['/admin/workshops', workshop.id, 'groups']"
                  >
                    Editar grupos
                  </a>
                  <a
                    class="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    [routerLink]="['/admin/workshops', workshop.id, 'preview']"
                  >
                    Preview / aplicar
                  </a>
                  <button
                    class="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                    [disabled]="!workshop.lastApplicationId || downloadingExportId === workshop.id"
                    (click)="downloadGroupsExport(workshop)"
                  >
                    {{ downloadingExportId === workshop.id ? 'Exportando...' : 'Exportar grupos' }}
                  </button>
                  <button
                    class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    (click)="deleteWorkshop(workshop)"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdminWorkshopsPage implements OnInit, OnDestroy {
  private readonly workshopsService = inject(AdminWorkshopsService);
  private readonly route = inject(ActivatedRoute);
  private readonly adminPeriod = inject(AdminPeriodContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private periodSub?: Subscription;
  private querySub?: Subscription;
  private destroyed = false;

  workshops: WorkshopRow[] = [];
  loading = false;
  error: string | null = null;
  success: string | null = null;
  downloadingExportId: string | null = null;

  async ngOnInit() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.error = params.get('error');
      this.success = params.get('success');
    });
    this.periodSub = this.adminPeriod.changes$.pipe(skip(1)).subscribe(() => {
      void this.loadAll();
    });
    await this.loadAll();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.periodSub?.unsubscribe();
    this.querySub?.unsubscribe();
  }

  async loadAll() {
    this.loading = true;
    if (!this.route.snapshot.queryParamMap.has('error')) this.error = null;
    if (!this.route.snapshot.queryParamMap.has('success')) this.success = null;
    try {
      this.workshops = await this.workshopsService.listWorkshops();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar talleres';
    } finally {
      this.loading = false;
      this.safeDetectChanges();
    }
  }

  async deleteWorkshop(workshop: WorkshopRow) {
    const ok = window.confirm(`Eliminar taller "${workshop.name}"?`);
    if (!ok) return;
    this.error = null;
    this.success = null;
    try {
      await this.workshopsService.deleteWorkshop(workshop.id);
      this.workshops = this.workshops.filter((row) => row.id !== workshop.id);
      this.success = 'Taller eliminado.';
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar el taller';
    } finally {
      this.safeDetectChanges();
    }
  }

  async downloadGroupsExport(workshop: WorkshopRow) {
    if (!workshop.lastApplicationId) {
      this.error = 'Aplica el taller primero para exportar grupos.';
      this.safeDetectChanges();
      return;
    }
    this.error = null;
    this.success = null;
    this.downloadingExportId = workshop.id;
    try {
      const blob = await this.workshopsService.downloadGroupsExcel(workshop.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workshop.name}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo exportar grupos del taller';
    } finally {
      this.downloadingExportId = null;
      this.safeDetectChanges();
    }
  }

  deliveryLabel(workshop: WorkshopRow) {
    if (workshop.deliveryMode === 'VIRTUAL') return 'Virtual';
    return workshop.venueCampusName || 'Presencial';
  }

  responsibleLabel(workshop: WorkshopRow) {
    return workshop.responsibleTeacherName || 'Sin responsable';
  }

  groupsStatusLabel(workshop: WorkshopRow) {
    const groupsCount = Number(workshop.groupsCount ?? 0);
    if (groupsCount === 0) return 'Pendiente de generar';
    if (workshop.mode === 'BY_SIZE' && workshop.groupSize) {
      return `Base por ${workshop.groupSize} alumnos`;
    }
    return 'Base generada';
  }

  scheduleStatusLabel(workshop: WorkshopRow) {
    const groupsCount = Number(workshop.groupsCount ?? 0);
    const scheduled = Number(workshop.scheduledGroupsCount ?? 0);
    if (groupsCount === 0) return 'Sin grupos';
    if (scheduled === 0) return 'Sin horarios';
    if (scheduled < groupsCount) return 'Faltan horarios';
    return 'Todos configurados';
  }

  private safeDetectChanges() {
    if (this.destroyed) return;
    this.cdr.detectChanges();
  }
}
