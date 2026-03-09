import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { skip, Subscription } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import {
  AdminWorkshopsService,
  WorkshopAssignmentPreview,
  WorkshopAssignmentRun,
  WorkshopRow,
} from './admin-workshops.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="text-xl font-semibold">Preview y aplicación de taller</div>
        <div class="text-sm text-slate-600">
          Paso 3 de 3: valida cómo quedarán los alumnos en los grupos y aplica la asignación.
        </div>
      </div>
      <div class="flex gap-2">
        <a
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          [routerLink]="['/admin/workshops', workshopId, 'groups']"
        >
          Volver a grupos
        </a>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="refreshPreview()"
        >
          {{ previewLoading ? 'Actualizando...' : 'Actualizar preview' }}
        </button>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <a class="rounded-full bg-slate-100 px-3 py-1 text-slate-800 font-medium hover:bg-slate-200 cursor-pointer transition-colors" [routerLink]="['/admin/workshops', workshopId, 'edit']">1. Cabecera</a>
        <a class="rounded-full bg-slate-100 px-3 py-1 text-slate-800 font-medium hover:bg-slate-200 cursor-pointer transition-colors" [routerLink]="['/admin/workshops', workshopId, 'groups']">2. Grupos</a>
        <span class="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white">3. Preview y aplicación</span>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {{ success }}
    </div>

    <div *ngIf="loading || (previewLoading && !preview)" class="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      {{ loading ? 'Cargando preview del taller...' : 'Actualizando preview del taller...' }}
    </div>

    <div *ngIf="!loading && workshop && preview" class="mt-4 space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="grid gap-3 sm:grid-cols-5">
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Taller</div>
            <div class="text-sm font-semibold">{{ workshop.name }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Responsable</div>
            <div class="text-sm font-semibold">{{ responsibleLabel() }}</div>
            <div class="mt-1 text-xs text-slate-500">{{ workshop.responsibleTeacherDni || 'Sin DNI' }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Candidatos</div>
            <div class="text-lg font-semibold">{{ preview.totalCandidates }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Asignados</div>
            <div class="text-lg font-semibold">{{ preview.assignedCount }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Pendientes</div>
            <div class="text-lg font-semibold">{{ preview.pendingCount }}</div>
          </div>
        </div>

        <div
          *ngIf="!hasResponsibleAssigned()"
          class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          Debes asignar un responsable en la cabecera del taller antes de aplicarlo.
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            [disabled]="applying || previewLoading || !hasResponsibleAssigned()"
            (click)="apply()"
          >
            {{ applying ? 'Aplicando...' : 'Aplicar taller' }}
          </button>
          <a
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            routerLink="/admin/workshops"
          >
            Volver a lista
          </a>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Resumen de compatibilidad</div>
        <div class="mt-3 grid gap-3 sm:grid-cols-4">
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Grupos configurados</div>
            <div class="text-base font-semibold">{{ preview.groupsConfigured }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Grupos elegibles</div>
            <div class="text-base font-semibold">{{ preview.groupsEligible }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Cruce horario</div>
            <div class="text-base font-semibold">{{ preview.pendingSummary.SCHEDULE_CONFLICT }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Sin cupo / sin grupo</div>
            <div class="text-base font-semibold">
              {{ preview.pendingSummary.NO_CAPACITY + preview.pendingSummary.NO_ELIGIBLE_GROUP }}
            </div>
          </div>
        </div>
        <div *ngIf="preview.suggestion" class="mt-3 text-xs text-slate-600">
          Si agregas un grupo con cupo {{ preview.suggestion.recommendedGroupCapacity }}, podrías cubrir hasta
          {{ preview.suggestion.potentialCoveredIfAddOneGroup }} pendiente(s).
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Distribución simulada por grupo</div>
        <div class="mt-3 space-y-3">
          <div *ngFor="let group of preview.groups" class="rounded-xl border border-slate-200">
            <div class="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="font-semibold">{{ group.displayName || group.code }}</div>
                <div class="text-xs text-slate-500">
                  {{ group.code || '-' }} | Cupo {{ group.capacity ?? 'Sin límite' }} | Asignados {{ group.assignedCount }}
                </div>
              </div>
              <div class="text-xs text-slate-500">
                <span *ngIf="group.scheduleBlocks?.length; else noSchedule">
                  {{ scheduleText(group.scheduleBlocks || []) }}
                </span>
                <ng-template #noSchedule>Sin horario</ng-template>
              </div>
            </div>
            <div class="max-h-64 overflow-auto">
              <table class="min-w-full text-xs">
                <thead class="bg-white text-left text-slate-600">
                  <tr>
                    <th class="px-3 py-2">Alumno</th>
                    <th class="px-3 py-2">DNI</th>
                    <th class="px-3 py-2">Código</th>
                    <th class="px-3 py-2">Carrera</th>
                    <th class="px-3 py-2">Sede</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let student of group.students" class="border-t border-slate-100">
                    <td class="px-3 py-2">{{ student.fullName }}</td>
                    <td class="px-3 py-2">{{ student.dni || 'SIN DNI' }}</td>
                    <td class="px-3 py-2">{{ student.codigoAlumno || 'SIN CODIGO' }}</td>
                    <td class="px-3 py-2">{{ student.careerName || '-' }}</td>
                    <td class="px-3 py-2">{{ student.campusName || '-' }}</td>
                  </tr>
                  <tr *ngIf="group.students.length === 0" class="border-t border-slate-100">
                    <td colspan="5" class="px-3 py-3 text-slate-500">Sin alumnos asignados a este grupo en la simulación.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Pendientes</div>
        <div class="mt-3 max-h-[420px] overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left text-slate-700">
              <tr>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">DNI</th>
                <th class="px-3 py-2">Código</th>
                <th class="px-3 py-2">Carrera</th>
                <th class="px-3 py-2">Motivo</th>
                <th class="px-3 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of preview.pending" class="border-t border-slate-100">
                <td class="px-3 py-2">{{ row.fullName }}</td>
                <td class="px-3 py-2">{{ row.dni || 'SIN DNI' }}</td>
                <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                <td class="px-3 py-2">{{ row.careerName || '-' }}</td>
                <td class="px-3 py-2 font-semibold">{{ reasonLabel(row.reasonCode) }}</td>
                <td class="px-3 py-2">{{ row.reasonDetail || '-' }}</td>
              </tr>
              <tr *ngIf="preview.pending.length === 0" class="border-t border-slate-100">
                <td colspan="6" class="px-3 py-3 text-slate-500">No hay pendientes en la simulación.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div *ngIf="applicationRun" class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div class="text-sm font-semibold text-emerald-800">Aplicación registrada</div>
        <div class="mt-2 grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl bg-white p-3">
            <div class="text-xs text-slate-500">Run</div>
            <div class="text-sm font-semibold">{{ applicationRun.runId }}</div>
          </div>
          <div class="rounded-xl bg-white p-3">
            <div class="text-xs text-slate-500">Asignados</div>
            <div class="text-sm font-semibold">{{ applicationRun.summary.assignedCount }}</div>
          </div>
          <div class="rounded-xl bg-white p-3">
            <div class="text-xs text-slate-500">Pendientes</div>
            <div class="text-sm font-semibold">{{ applicationRun.summary.pendingCount }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminWorkshopPreviewPage implements OnInit, OnDestroy {
  private readonly workshopsService = inject(AdminWorkshopsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminPeriod = inject(AdminPeriodContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private routeSub?: Subscription;
  private periodSub?: Subscription;
  private destroyed = false;

  workshopId: string | null = null;
  workshop: WorkshopRow | null = null;
  preview: WorkshopAssignmentPreview | null = null;
  applicationRun: WorkshopAssignmentRun | null = null;
  loading = false;
  previewLoading = false;
  applying = false;
  error: string | null = null;
  success: string | null = null;

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe(() => {
      void this.loadPage();
    });
    this.periodSub = this.adminPeriod.changes$.pipe(skip(1)).subscribe(() => {
      void this.loadPage();
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.routeSub?.unsubscribe();
    this.periodSub?.unsubscribe();
  }

  async loadPage() {
    this.loading = true;
    this.error = null;
    this.success = null;
    this.applicationRun = null;
    try {
      const workshopId = this.route.snapshot.paramMap.get('id');
      if (!workshopId) {
        await this.navigateToList('Taller no encontrado');
        return;
      }
      this.workshopId = workshopId;
      this.workshop = await this.workshopsService.getWorkshop(workshopId);
      await this.refreshPreview(false);
    } catch (e: any) {
      await this.navigateToList(e?.error?.message ?? 'No se pudo cargar el taller');
    } finally {
      this.loading = false;
      this.safeDetectChanges();
    }
  }

  async refreshPreview(resetMessages = true) {
    if (!this.workshopId) return;
    if (resetMessages) {
      this.error = null;
      this.success = null;
    }
    this.previewLoading = true;
    try {
      this.preview = await this.workshopsService.previewAssignments(this.workshopId);
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo generar el preview del taller';
    } finally {
      this.previewLoading = false;
      this.safeDetectChanges();
    }
  }

  async apply() {
    if (!this.workshopId) return;
    if (!this.preview) {
      this.error = 'Debes generar el preview antes de aplicar.';
      return;
    }
    if (!this.hasResponsibleAssigned()) {
      this.error = 'Debes asignar un responsable al taller desde la cabecera antes de aplicarlo.';
      this.safeDetectChanges();
      return;
    }
    this.error = null;
    this.success = null;
    this.applying = true;
    try {
      const result = await this.workshopsService.runAssignments(this.workshopId);
      this.preview = result;
      this.applicationRun = await this.workshopsService.getAssignmentRun(this.workshopId, result.runId);
      this.success = `Taller aplicado. Asignados: ${result.assignedCount}/${result.totalCandidates}.`;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo aplicar el taller';
    } finally {
      this.applying = false;
      this.safeDetectChanges();
    }
  }

  reasonLabel(code: string) {
    if (code === 'SCHEDULE_CONFLICT') return 'Cruce de horario';
    if (code === 'NO_CAPACITY') return 'Sin cupo';
    if (code === 'NO_ELIGIBLE_GROUP') return 'Sin grupo elegible';
    return code;
  }

  scheduleText(
    blocks: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      startDate?: string | null;
      endDate?: string | null;
    }>
  ) {
    return blocks
      .map((block) => {
        const base = `${this.dayLabel(block.dayOfWeek)} ${block.startTime}-${block.endTime}`;
        if (block.startDate && block.endDate) {
          return block.startDate === block.endDate
            ? `${base} (${block.startDate})`
            : `${base} (${block.startDate} a ${block.endDate})`;
        }
        return block.startDate || block.endDate
          ? `${base} (${block.startDate || block.endDate})`
          : base;
      })
      .join(' | ');
  }

  responsibleLabel() {
    return this.workshop?.responsibleTeacherName || 'Sin responsable';
  }

  hasResponsibleAssigned() {
    return Boolean(String(this.workshop?.responsibleTeacherId ?? '').trim());
  }

  private dayLabel(dayOfWeek: number) {
    return (
      {
        1: 'Lun',
        2: 'Mar',
        3: 'Mié',
        4: 'Jue',
        5: 'Vie',
        6: 'Sáb',
        7: 'Dom',
      }[Number(dayOfWeek)] ?? `Día ${dayOfWeek}`
    );
  }

  private async navigateToList(error: string) {
    await this.router.navigate(['/admin/workshops'], {
      queryParams: { error },
    });
  }

  private safeDetectChanges() {
    if (this.destroyed) return;
    this.cdr.detectChanges();
  }
}
