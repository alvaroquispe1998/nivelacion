import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { skip, Subscription } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import {
  AdminWorkshopsService,
  WorkshopAppliedView,
  WorkshopStudentGroupOptionsResponse,
} from './admin-workshops.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="text-xl font-semibold">Aplicacion del taller</div>
        <div class="text-sm text-slate-600">
          Revisa lo aplicado, los cruces actuales y cambia alumnos de grupo sin reaplicar.
        </div>
      </div>
      <div class="flex gap-2">
        <a
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          routerLink="/admin/workshops"
        >
          Volver
        </a>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="loadPage()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {{ success }}
    </div>

    <div *ngIf="loading" class="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Cargando aplicacion del taller...
    </div>

    <div *ngIf="!loading && appliedView" class="mt-4 space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="grid gap-3 sm:grid-cols-5">
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Taller</div>
            <div class="text-sm font-semibold">{{ appliedView.workshop.name }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Aplicado</div>
            <div class="text-sm font-semibold">
              {{ appliedView.run.createdAt | date: 'dd/MM/yyyy HH:mm' }}
            </div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Asignados</div>
            <div class="text-lg font-semibold">{{ appliedView.summary.assignedCount }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Grupos</div>
            <div class="text-lg font-semibold">{{ appliedView.summary.groupsCount }}</div>
          </div>
          <div class="rounded-xl bg-amber-50 p-3">
            <div class="text-xs text-amber-700">Alumnos con cruce</div>
            <div class="text-lg font-semibold text-amber-900">
              {{ appliedView.summary.conflictingStudents }}
            </div>
            <div class="mt-1 text-xs text-amber-700">
              Conflictos detectados: {{ appliedView.summary.totalConflicts }}
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Cruces actuales</div>
        <div class="mt-3 max-h-[420px] overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left text-slate-700">
              <tr>
                <th class="px-3 py-2">Taller</th>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Codigo</th>
                <th class="px-3 py-2">Grupo</th>
                <th class="px-3 py-2">Bloque taller</th>
                <th class="px-3 py-2">Bloque conflictivo</th>
                <th class="px-3 py-2">Accion</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of appliedView.currentConflicts" class="border-t border-slate-100">
                <td class="px-3 py-2">{{ row.workshopName }}</td>
                <td class="px-3 py-2">
                  <div class="font-semibold">{{ row.fullName }}</div>
                  <div class="text-[11px] text-slate-500">{{ row.dni || 'SIN DNI' }}</div>
                </td>
                <td class="px-3 py-2">{{ row.codigoAlumno || 'SIN CODIGO' }}</td>
                <td class="px-3 py-2">{{ row.groupName || '-' }}</td>
                <td class="px-3 py-2">{{ row.workshopBlockText }}</td>
                <td class="px-3 py-2">{{ row.levelingBlockText }}</td>
                <td class="px-3 py-2">
                  <button
                    class="rounded border border-sky-300 px-2 py-1 text-sky-700 hover:bg-sky-50"
                    type="button"
                    (click)="openChangeGroup(row.studentId)"
                  >
                    Cambiar grupo
                  </button>
                </td>
              </tr>
              <tr *ngIf="appliedView.currentConflicts.length === 0" class="border-t border-slate-100">
                <td colspan="7" class="px-3 py-3 text-slate-500">
                  No hay cruces actuales entre el taller, los cursos y otros talleres activos.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Grupos aplicados</div>
        <div class="mt-3 space-y-3">
          <div *ngFor="let group of appliedView.groups" class="rounded-xl border border-slate-200">
            <div class="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="font-semibold">{{ group.displayName || group.code || 'Grupo' }}</div>
                <div class="text-xs text-slate-500">
                  Cupo {{ group.capacity ?? 'Sin limite' }} | Asignados {{ group.assignedCount }}
                </div>
              </div>
              <div class="text-xs text-slate-500">
                {{ scheduleText(group.scheduleBlocks) }}
              </div>
            </div>
            <div class="max-h-72 overflow-auto">
              <table class="min-w-full text-xs">
                <thead class="bg-white text-left text-slate-600">
                  <tr>
                    <th class="px-3 py-2">Alumno</th>
                    <th class="px-3 py-2">DNI</th>
                    <th class="px-3 py-2">Codigo</th>
                    <th class="px-3 py-2">Carrera</th>
                    <th class="px-3 py-2">Sede</th>
                    <th class="px-3 py-2">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let student of group.students" class="border-t border-slate-100">
                    <td class="px-3 py-2">{{ student.fullName }}</td>
                    <td class="px-3 py-2">{{ student.dni || 'SIN DNI' }}</td>
                    <td class="px-3 py-2">{{ student.codigoAlumno || 'SIN CODIGO' }}</td>
                    <td class="px-3 py-2">{{ student.careerName || '-' }}</td>
                    <td class="px-3 py-2">{{ student.campusName || '-' }}</td>
                    <td class="px-3 py-2">
                      <button
                        class="rounded border border-sky-300 px-2 py-1 text-sky-700 hover:bg-sky-50"
                        type="button"
                        (click)="openChangeGroup(student.studentId)"
                      >
                        Cambiar grupo
                      </button>
                    </td>
                  </tr>
                  <tr *ngIf="group.students.length === 0" class="border-t border-slate-100">
                    <td colspan="6" class="px-3 py-3 text-slate-500">Sin alumnos en este grupo.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

    </div>

    <div *ngIf="groupOptions" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div class="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-lg font-semibold">Cambiar grupo</div>
            <div class="text-sm text-slate-600">
              {{ groupOptions.student.fullName }} | {{ groupOptions.student.codigoAlumno || 'SIN CODIGO' }}
            </div>
          </div>
          <button class="rounded border border-slate-300 px-3 py-1 text-sm" type="button" (click)="closeChangeGroup()">
            Cerrar
          </button>
        </div>

        <div *ngIf="modalError" class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ modalError }}
        </div>

        <div class="mt-4 max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left text-slate-700">
              <tr>
                <th class="px-3 py-2">Grupo</th>
                <th class="px-3 py-2">Horario</th>
                <th class="px-3 py-2">Asignados</th>
                <th class="px-3 py-2">Estado</th>
                <th class="px-3 py-2">Detalle</th>
                <th class="px-3 py-2">Seleccion</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let group of groupOptions.groups" class="border-t border-slate-100">
                <td class="px-3 py-2">
                  <div class="font-semibold">{{ group.displayName || group.code || 'Grupo' }}</div>
                  <div class="text-[11px] text-slate-500">
                    Cupo {{ group.capacity ?? 'Sin limite' }}
                  </div>
                </td>
                <td class="px-3 py-2">{{ scheduleText(group.scheduleBlocks) }}</td>
                <td class="px-3 py-2">{{ group.assignedCount }}</td>
                <td class="px-3 py-2">
                  <span *ngIf="group.isCurrent" class="font-semibold text-slate-700">Actual</span>
                  <span *ngIf="!group.isCurrent && group.hasConflict" class="font-semibold text-red-700">Cruce horario</span>
                  <span *ngIf="!group.isCurrent && !group.hasConflict && group.wouldBeOverCapacity" class="font-semibold text-amber-700">Sobrecupo permitido</span>
                  <span *ngIf="!group.isCurrent && !group.hasConflict && !group.wouldBeOverCapacity" class="font-semibold text-emerald-700">Disponible</span>
                </td>
                <td class="px-3 py-2">
                  {{ group.conflictDetail || (group.wouldBeOverCapacity ? 'El cambio quedaria en sobrecupo, pero se permite.' : '-') }}
                </td>
                <td class="px-3 py-2">
                  <input
                    type="radio"
                    name="targetGroup"
                    [disabled]="!group.selectable"
                    [checked]="selectedTargetRunGroupId === group.runGroupId"
                    (change)="selectedTargetRunGroupId = group.runGroupId"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded border border-slate-300 px-3 py-2 text-sm" type="button" (click)="closeChangeGroup()">
            Cancelar
          </button>
          <button
            class="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            type="button"
            [disabled]="changingGroup || !selectedTargetRunGroupId"
            (click)="submitGroupChange()"
          >
            {{ changingGroup ? 'Guardando...' : 'Cambiar grupo' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminWorkshopAppliedPage implements OnInit, OnDestroy {
  private readonly workshopsService = inject(AdminWorkshopsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminPeriod = inject(AdminPeriodContextService);
  private readonly cdr = inject(ChangeDetectorRef);

  private routeSub?: Subscription;
  private periodSub?: Subscription;
  private destroyed = false;

  workshopId: string | null = null;
  appliedView: WorkshopAppliedView | null = null;
  loading = false;
  error: string | null = null;
  success: string | null = null;

  groupOptions: WorkshopStudentGroupOptionsResponse | null = null;
  selectedTargetRunGroupId: string | null = null;
  modalError: string | null = null;
  changingGroup = false;

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
    try {
      const workshopId = this.route.snapshot.paramMap.get('id');
      if (!workshopId) {
        await this.navigateToList('Taller no encontrado');
        return;
      }
      this.workshopId = workshopId;
      this.appliedView = await this.workshopsService.getLatestAppliedView(workshopId);
    } catch (e: any) {
      await this.navigateToList(e?.error?.message ?? 'No se pudo cargar la aplicacion del taller');
    } finally {
      this.loading = false;
      this.safeDetectChanges();
    }
  }

  async openChangeGroup(studentId: string) {
    if (!this.workshopId || !this.appliedView?.run.runId) return;
    this.modalError = null;
    this.selectedTargetRunGroupId = null;
    try {
      this.groupOptions = await this.workshopsService.getAssignmentRunStudentGroupOptions(
        this.workshopId,
        this.appliedView.run.runId,
        studentId
      );
      const firstSelectable = this.groupOptions.groups.find((group) => group.selectable);
      this.selectedTargetRunGroupId = firstSelectable?.runGroupId ?? null;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar las opciones de grupo';
    } finally {
      this.safeDetectChanges();
    }
  }

  closeChangeGroup() {
    this.groupOptions = null;
    this.selectedTargetRunGroupId = null;
    this.modalError = null;
  }

  async submitGroupChange() {
    if (!this.workshopId || !this.appliedView?.run.runId || !this.groupOptions || !this.selectedTargetRunGroupId) {
      return;
    }
    this.changingGroup = true;
    this.modalError = null;
    try {
      await this.workshopsService.changeAssignmentRunStudentGroup(
        this.workshopId,
        this.appliedView.run.runId,
        this.groupOptions.student.studentId,
        this.selectedTargetRunGroupId
      );
      this.success = 'Cambio de grupo registrado.';
      this.closeChangeGroup();
      await this.loadPage();
    } catch (e: any) {
      this.modalError = this.formatApiError(
        e?.error,
        e?.error?.message ?? 'No se pudo cambiar al alumno de grupo'
      );
    } finally {
      this.changingGroup = false;
      this.safeDetectChanges();
    }
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
    if (!blocks || blocks.length === 0) return 'Sin horario';
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

  private dayLabel(dayOfWeek: number) {
    return (
      {
        1: 'Lun',
        2: 'Mar',
        3: 'Mie',
        4: 'Jue',
        5: 'Vie',
        6: 'Sab',
        7: 'Dom',
      }[Number(dayOfWeek)] ?? `Dia ${dayOfWeek}`
    );
  }

  private formatApiError(errorBody: any, fallback: string) {
    const baseMessage = String(errorBody?.message ?? fallback ?? '').trim() || fallback;
    const students = Array.isArray(errorBody?.students) ? errorBody.students.slice(0, 3) : [];
    if (students.length <= 0) return baseMessage;
    const detail = students
      .map((student: any) => {
        const firstConflict = Array.isArray(student?.conflicts) ? student.conflicts[0] : null;
        const reason =
          firstConflict?.reason ||
          firstConflict?.levelingBlock ||
          firstConflict?.conflictingBlock ||
          '-';
        return `${student?.fullName || 'Alumno'}: ${reason}`;
      })
      .join(' | ');
    return `${baseMessage} ${detail}`.trim();
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
