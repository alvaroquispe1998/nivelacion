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
            <tr
              *ngFor="let workshop of workshops"
              class="border-t border-slate-100 align-top"
              [class.bg-slate-50]="!workshop.isActive"
            >
              <td class="px-3 py-3">
                <div class="font-semibold text-slate-900">{{ workshop.name }}</div>
                <div class="mt-1">
                  <span
                    class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    [class.bg-emerald-50]="workshop.isActive"
                    [class.text-emerald-700]="workshop.isActive"
                    [class.bg-slate-200]="!workshop.isActive"
                    [class.text-slate-700]="!workshop.isActive"
                  >
                    {{ workshop.isActive ? 'Activo' : 'Inactivo' }}
                  </span>
                </div>
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
                  <a
                    class="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    [class.opacity-50]="!workshop.lastApplicationId"
                    [routerLink]="workshop.lastApplicationId ? ['/admin/workshops', workshop.id, 'applied'] : null"
                    (click)="!workshop.lastApplicationId && $event.preventDefault()"
                  >
                    Ver aplicado
                  </a>
                  <button
                    class="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                    [disabled]="!workshop.lastApplicationId || downloadingExportId === workshop.id"
                    (click)="downloadGroupsExport(workshop)"
                  >
                    {{ downloadingExportId === workshop.id ? 'Exportando...' : 'Exportar grupos' }}
                  </button>
                  <button
                    class="rounded border px-2 py-1 text-xs disabled:opacity-50"
                    [class.border-amber-300]="workshop.isActive"
                    [class.text-amber-700]="workshop.isActive"
                    [class.hover:bg-amber-50]="workshop.isActive"
                    [class.border-emerald-300]="!workshop.isActive"
                    [class.text-emerald-700]="!workshop.isActive"
                    [class.hover:bg-emerald-50]="!workshop.isActive"
                    [disabled]="loadingStatusId === workshop.id"
                    (click)="openToggleWorkshopStatusConfirm(workshop)"
                  >
                    {{
                      loadingStatusId === workshop.id
                        ? 'Guardando...'
                        : workshop.isActive
                          ? 'Inactivar'
                          : 'Activar'
                    }}
                  </button>
                  <button
                    class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    (click)="openDeleteConfirm(workshop)"
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

    <div
      *ngIf="confirmState.isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm"
    >
      <div class="w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_32px_120px_-32px_rgba(15,23,42,0.45)]">
        <div
          class="relative overflow-hidden border-b border-slate-100 bg-gradient-to-r p-6"
          [ngClass]="
            confirmState.tone === 'danger'
              ? 'from-rose-50 via-white to-rose-100'
              : confirmState.tone === 'success'
                ? 'from-emerald-50 via-white to-emerald-100'
                : 'from-amber-50 via-white to-amber-100'
          "
        >
          <div
            class="absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl"
            [ngClass]="
              confirmState.tone === 'danger'
                ? 'bg-rose-200/70'
                : confirmState.tone === 'success'
                  ? 'bg-emerald-200/70'
                  : 'bg-amber-200/70'
            "
          ></div>
          <div class="relative">
            <div
              class="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
              [ngClass]="
                confirmState.tone === 'danger'
                  ? 'bg-rose-100 text-rose-700'
                  : confirmState.tone === 'success'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
              "
            >
              Confirmacion
            </div>
            <div class="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
              {{ confirmState.title }}
            </div>
            <div class="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              {{ confirmState.subtitle }}
            </div>
          </div>
        </div>

        <div class="p-6">
          <div
            class="rounded-2xl border px-4 py-4"
            [ngClass]="
              confirmState.tone === 'danger'
                ? 'border-rose-200 bg-rose-50/70'
                : confirmState.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50/70'
                  : 'border-amber-200 bg-amber-50/70'
            "
          >
            <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Taller seleccionado
            </div>
            <div class="mt-2 break-words text-base font-semibold text-slate-900">
              {{ confirmState.workshopName }}
            </div>
            <div class="mt-2 text-sm leading-relaxed text-slate-600">
              {{ confirmState.message }}
            </div>
          </div>

          <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              class="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="confirmState.loading"
              (click)="closeConfirm()"
            >
              Cancelar
            </button>
            <button
              class="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
              [ngClass]="
                confirmState.tone === 'danger'
                  ? 'bg-rose-600 shadow-lg shadow-rose-600/20 hover:bg-rose-700'
                  : confirmState.tone === 'success'
                    ? 'bg-emerald-600 shadow-lg shadow-emerald-600/20 hover:bg-emerald-700'
                    : 'bg-amber-600 shadow-lg shadow-amber-600/20 hover:bg-amber-700'
              "
              [disabled]="confirmState.loading"
              (click)="executeConfirm()"
            >
              {{ confirmState.loading ? confirmState.loadingLabel : confirmState.confirmLabel }}
            </button>
          </div>
        </div>
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
  loadingStatusId: string | null = null;
  confirmState = {
    isOpen: false,
    title: '',
    subtitle: '',
    message: '',
    workshopName: '',
    confirmLabel: 'Confirmar',
    loadingLabel: 'Guardando...',
    tone: 'warning' as 'warning' | 'success' | 'danger',
    onConfirm: null as null | (() => Promise<boolean>),
    loading: false,
  };

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

  openDeleteConfirm(workshop: WorkshopRow) {
    this.confirmState = {
      isOpen: true,
      title: 'Eliminar taller',
      subtitle: 'Esta accion borra el taller de forma permanente y no se podra deshacer.',
      message:
        'Si solo quieres ocultarlo para alumno y docente, te conviene dejarlo inactivo en lugar de eliminarlo.',
      workshopName: workshop.name,
      confirmLabel: 'Eliminar taller',
      loadingLabel: 'Eliminando...',
      tone: 'danger',
      onConfirm: () => this.deleteWorkshop(workshop),
      loading: false,
    };
    this.safeDetectChanges();
  }

  async deleteWorkshop(workshop: WorkshopRow) {
    this.error = null;
    this.success = null;
    try {
      await this.workshopsService.deleteWorkshop(workshop.id);
      this.workshops = this.workshops.filter((row) => row.id !== workshop.id);
      this.success = 'Taller eliminado.';
      return true;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar el taller';
      return false;
    } finally {
      this.safeDetectChanges();
    }
  }

  openToggleWorkshopStatusConfirm(workshop: WorkshopRow) {
    const nextIsActive = !workshop.isActive;
    this.confirmState = {
      isOpen: true,
      title: nextIsActive ? 'Activar taller' : 'Inactivar taller',
      subtitle: nextIsActive
        ? 'El taller volvera a estar visible y disponible dentro del flujo normal.'
        : 'El taller quedara oculto para alumno y docente, pero seguira disponible en admin.',
      message: nextIsActive
        ? 'Se mostrara otra vez en los listados y podra participar nuevamente en las validaciones de talleres activos.'
        : 'Seguira existiendo para editarlo, revisarlo o reactivarlo despues cuando lo necesites.',
      workshopName: workshop.name,
      confirmLabel: nextIsActive ? 'Activar taller' : 'Inactivar taller',
      loadingLabel: nextIsActive ? 'Activando...' : 'Inactivando...',
      tone: nextIsActive ? 'success' : 'warning',
      onConfirm: () => this.toggleWorkshopStatus(workshop),
      loading: false,
    };
    this.safeDetectChanges();
  }

  async toggleWorkshopStatus(workshop: WorkshopRow) {
    const nextIsActive = !workshop.isActive;
    this.loadingStatusId = workshop.id;
    this.error = null;
    this.success = null;
    try {
      const updated = await this.workshopsService.updateWorkshopStatus(
        workshop.id,
        nextIsActive
      );
      this.workshops = this.workshops.map((row) =>
        row.id === workshop.id ? { ...row, isActive: updated.isActive } : row
      );
      this.success = nextIsActive
        ? 'Taller activado.'
        : 'Taller inactivado. Alumno y docente ya no lo veran.';
      return true;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar el estado del taller';
      return false;
    } finally {
      this.loadingStatusId = null;
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

  closeConfirm(force = false) {
    if (this.confirmState.loading && !force) return;
    this.confirmState = {
      isOpen: false,
      title: '',
      subtitle: '',
      message: '',
      workshopName: '',
      confirmLabel: 'Confirmar',
      loadingLabel: 'Guardando...',
      tone: 'warning',
      onConfirm: null,
      loading: false,
    };
    this.safeDetectChanges();
  }

  async executeConfirm() {
    const action = this.confirmState.onConfirm;
    if (!action || this.confirmState.loading) return;

    this.confirmState = {
      ...this.confirmState,
      loading: true,
    };
    this.safeDetectChanges();

    const shouldClose = await action();
    if (shouldClose) {
      this.closeConfirm(true);
      return;
    }

    this.confirmState = {
      ...this.confirmState,
      loading: false,
    };
    this.safeDetectChanges();
  }

  private safeDetectChanges() {
    if (this.destroyed) return;
    this.cdr.detectChanges();
  }
}
