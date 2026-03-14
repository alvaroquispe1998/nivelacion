import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { skip, Subscription } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import {
  AdminWorkshopsService,
  GroupScheduleBlockRow,
  WorkshopGroupRow,
  WorkshopRow,
} from './admin-workshops.service';

interface ZoomMeetingPrefillDraft {
  mode: 'ONE_TIME';
  topic: string;
  agenda: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  sourceType: 'WORKSHOP_BLOCK';
  sourceWorkshopId: string;
  sourceGroupId: string;
  sourceWorkshopScheduleBlockId: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="text-xl font-semibold">Edicion de grupos de taller</div>
        <div class="text-sm text-slate-600">
          Paso 2 de 3: ajusta grupos, cupos y horarios sobre la base generada.
        </div>
      </div>
      <div class="flex gap-2">
        <a
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          [routerLink]="['/admin/workshops', workshopId, 'edit']"
        >
          Volver a cabecera
        </a>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="loadPage()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <a
          class="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-800 transition-colors hover:bg-slate-200"
          [routerLink]="['/admin/workshops', workshopId, 'edit']"
        >
          1. Cabecera
        </a>
        <span class="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white">2. Grupos</span>
        <a
          class="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-800 transition-colors hover:bg-slate-200"
          [routerLink]="['/admin/workshops', workshopId, 'preview']"
        >
          3. Preview y aplicacion
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
      Cargando grupos del taller...
    </div>

    <div *ngIf="!loading && workshop" class="mt-4 space-y-4">
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
            <div class="text-xs text-slate-500">Modo</div>
            <div class="text-sm font-semibold">{{ workshop.mode === 'BY_SIZE' ? 'Por tamano de grupo' : 'Grupo unico' }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Alumnos base</div>
            <div class="text-sm font-semibold">{{ workshop.studentIds?.length ?? 0 }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Grupos actuales</div>
            <div class="text-sm font-semibold">{{ groups.length }}</div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold">Grupos del taller</div>
            <div class="text-xs text-slate-500">Ajusta la base generada y luego configura el horario de cada grupo.</div>
          </div>
          <div class="flex gap-2">
            <button class="rounded border border-slate-300 px-2 py-1 text-xs" type="button" (click)="addGroup()">Agregar grupo</button>
            <button class="rounded border border-slate-300 px-2 py-1 text-xs" type="button" (click)="saveGroups()">Guardar grupos</button>
            <a
              class="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
              [routerLink]="['/admin/workshops', workshopId, 'preview']"
            >
              Ir al preview
            </a>
          </div>
        </div>

        <div class="space-y-2">
          <div
            *ngFor="let group of groups"
            class="grid grid-cols-12 items-center gap-2 rounded border border-slate-200 p-2 text-xs"
          >
            <input class="col-span-2 rounded border border-slate-200 px-2 py-1" [(ngModel)]="group.code" placeholder="Codigo" />
            <input class="col-span-4 rounded border border-slate-200 px-2 py-1" [(ngModel)]="group.displayName" placeholder="Nombre del grupo" />
            <input type="number" min="1" class="col-span-2 rounded border border-slate-200 px-2 py-1" [(ngModel)]="group.capacity" placeholder="Cupo" />
            <input type="number" min="1" class="col-span-1 rounded border border-slate-200 px-2 py-1" [(ngModel)]="group.sortOrder" />
            <label class="col-span-2 flex items-center gap-1">
              <input type="checkbox" [(ngModel)]="group.isActive" />
              Activo
            </label>
            <div class="col-span-1 flex justify-end gap-1">
              <button class="rounded border border-slate-300 px-2 py-1" type="button" (click)="selectGroup(group.id)">Horario</button>
              <button class="rounded border border-rose-300 px-2 py-1 text-rose-700" type="button" (click)="removeGroup(group.id)">X</button>
            </div>
          </div>
          <div *ngIf="groups.length === 0" class="text-xs text-slate-500">
            No hay grupos configurados. Vuelve a la cabecera para regenerar la base o agrega uno manualmente.
          </div>
        </div>
      </div>

      <div *ngIf="selectedGroupId" class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold">Horario del grupo {{ selectedGroupLabel() }}</div>
            <div class="text-xs text-slate-500">Solo los grupos activos con horario participan en el preview.</div>
          </div>
          <div class="flex gap-2">
            <button class="rounded border border-slate-300 px-2 py-1 text-xs" type="button" (click)="addScheduleBlock()">Agregar bloque</button>
            <button class="rounded border border-slate-300 px-2 py-1 text-xs" type="button" (click)="saveSelectedGroupSchedule()">Guardar horario</button>
          </div>
        </div>

        <div class="space-y-2">
          <div
            *ngFor="let block of selectedGroupSchedule; let blockIndex = index"
            class="grid grid-cols-1 gap-2 rounded border border-slate-200 p-2 text-xs lg:grid-cols-12 lg:items-center"
          >
            <input
              type="date"
              class="rounded border border-slate-200 px-2 py-1 lg:col-span-4"
              [(ngModel)]="block.startDate"
            />
            <input
              type="time"
              class="rounded border border-slate-200 px-2 py-1 lg:col-span-2"
              [(ngModel)]="block.startTime"
            />
            <input
              type="time"
              class="rounded border border-slate-200 px-2 py-1 lg:col-span-2"
              [(ngModel)]="block.endTime"
            />
            <div class="flex flex-wrap gap-1 lg:col-span-4 lg:justify-end">
              <button
                class="rounded border border-sky-300 px-2 py-1 text-sky-700"
                type="button"
                (click)="openZoomPrefillForBlock(block)"
              >
                {{ hasZoomMeeting(block) ? 'Recrear reunion' : 'Crear reunion' }}
              </button>
              <button
                class="rounded border border-emerald-300 px-2 py-1 text-emerald-700 disabled:opacity-50"
                type="button"
                (click)="openMeeting(block)"
                [disabled]="!canStartMeeting(block) || blockMeetingActionId === block.id"
              >
                {{ blockMeetingActionId === block.id && blockMeetingActionType === 'start' ? 'Abriendo...' : 'Entrar' }}
              </button>
              <button
                class="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
                type="button"
                (click)="copyInvitation(block)"
                [disabled]="!canCopyInvitation(block) || blockMeetingActionId === block.id"
              >
                {{ blockMeetingActionId === block.id && blockMeetingActionType === 'copy' ? 'Copiando...' : 'Copiar' }}
              </button>
              <button
                class="rounded border border-rose-300 px-2 py-1 text-rose-700"
                type="button"
                (click)="removeScheduleBlock(blockIndex)"
              >
                Quitar
              </button>
            </div>
          </div>
          <div *ngIf="selectedGroupSchedule.length === 0" class="text-xs text-slate-500">
            Este grupo aun no tiene bloques de horario.
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminWorkshopGroupsPage implements OnInit, OnDestroy {
  private readonly workshopsService = inject(AdminWorkshopsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminPeriod = inject(AdminPeriodContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private routeSub?: Subscription;
  private periodSub?: Subscription;
  private querySub?: Subscription;
  private destroyed = false;

  workshopId: string | null = null;
  workshop: WorkshopRow | null = null;
  groups: WorkshopGroupRow[] = [];
  selectedGroupId: string | null = null;
  selectedGroupSchedule: GroupScheduleBlockRow[] = [];
  loading = false;
  error: string | null = null;
  success: string | null = null;
  blockMeetingActionId: string | null = null;
  blockMeetingActionType: 'start' | 'copy' | null = null;

  ngOnInit() {
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      this.error = params.get('error');
      this.success = params.get('success');
    });
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
    this.querySub?.unsubscribe();
  }

  async loadPage() {
    this.loading = true;
    if (!this.route.snapshot.queryParamMap.has('error')) this.error = null;
    if (!this.route.snapshot.queryParamMap.has('success')) this.success = null;
    try {
      const workshopId = this.route.snapshot.paramMap.get('id');
      if (!workshopId) {
        await this.navigateToList('Taller no encontrado');
        return;
      }
      this.workshopId = workshopId;
      const [workshop, groups] = await Promise.all([
        this.workshopsService.getWorkshop(workshopId),
        this.workshopsService.listGroups(workshopId),
      ]);
      this.workshop = workshop;
      this.groups = groups ?? [];
      if (this.groups.length > 0) {
        const nextSelected =
          this.selectedGroupId && this.groups.some((group) => group.id === this.selectedGroupId)
            ? this.selectedGroupId
            : this.groups[0].id;
        this.selectGroup(nextSelected);
      } else {
        this.selectedGroupId = null;
        this.selectedGroupSchedule = [];
      }
    } catch (e: any) {
      await this.navigateToList(e?.error?.message ?? 'No se pudo cargar el taller');
    } finally {
      this.loading = false;
      this.safeDetectChanges();
    }
  }

  addGroup() {
    if (!this.workshopId || !this.workshop) return;
    const nextOrder = this.groups.length + 1;
    const localId = `local-${Date.now()}-${nextOrder}`;
    this.groups = [
      ...this.groups,
      {
        id: localId,
        workshopId: this.workshopId,
        code: `G${nextOrder}`,
        displayName: `Grupo ${nextOrder}`,
        capacity:
          this.workshop.mode === 'BY_SIZE'
            ? Number(this.workshop.groupSize ?? 40)
            : Math.max(1, Number(this.workshop.studentIds?.length ?? 1)),
        sortOrder: nextOrder,
        isActive: true,
        scheduleBlocks: [],
      },
    ];
    this.selectGroup(localId);
  }

  removeGroup(groupId: string) {
    this.groups = this.groups.filter((group) => group.id !== groupId);
    if (this.selectedGroupId === groupId) {
      this.selectedGroupId = null;
      this.selectedGroupSchedule = [];
    }
  }

  selectGroup(groupId: string) {
    this.selectedGroupId = groupId;
    const group = this.groups.find((item) => item.id === groupId);
    this.selectedGroupSchedule = (group?.scheduleBlocks ?? []).map((block) => ({
      ...block,
      startDate: block.startDate ?? block.endDate ?? null,
      endDate: block.startDate ?? block.endDate ?? null,
    }));
  }

  selectedGroupLabel() {
    if (!this.selectedGroupId) return '';
    const group = this.groups.find((item) => item.id === this.selectedGroupId);
    return group?.displayName || group?.code || this.selectedGroupId;
  }

  responsibleLabel() {
    return this.workshop?.responsibleTeacherName || 'Sin responsable';
  }

  addScheduleBlock() {
    if (!this.selectedGroupId) return;
    const date = this.localTodayIso();
    this.selectedGroupSchedule = [
      ...this.selectedGroupSchedule,
      {
        id: `local-block-${Date.now()}`,
        dayOfWeek: this.isoDayOfWeek(date),
        startDate: date,
        endDate: date,
        startTime: '08:00',
        endTime: '09:00',
      },
    ];
  }

  removeScheduleBlock(index: number) {
    this.selectedGroupSchedule = this.selectedGroupSchedule.filter((_, idx) => idx !== index);
  }

  hasZoomMeeting(block: GroupScheduleBlockRow) {
    return Boolean(
      String(block.zoomMeetingRecordId ?? '').trim() ||
      String(block.joinUrl ?? '').trim() ||
      String(block.startUrl ?? '').trim()
    );
  }

  canStartMeeting(block: GroupScheduleBlockRow) {
    return Boolean(
      String(block.startUrl ?? '').trim() || String(block.zoomMeetingRecordId ?? '').trim()
    );
  }

  canCopyInvitation(block: GroupScheduleBlockRow) {
    return Boolean(
      String(block.joinUrl ?? '').trim() || String(block.zoomMeetingRecordId ?? '').trim()
    );
  }

  async openZoomPrefillForBlock(block: GroupScheduleBlockRow) {
    if (!this.workshopId || !this.selectedGroupId || !block.id || String(block.id).startsWith('local-')) {
      this.error = 'Primero guarda el horario del grupo antes de crear la reunion Zoom.';
      this.success = null;
      this.safeDetectChanges();
      return;
    }
    const meetingDate = String(block.startDate ?? '').trim();
    const teacherDni = String(this.workshop?.responsibleTeacherDni ?? '').trim();
    if (!meetingDate) {
      this.error = 'El bloque debe tener una fecha exacta para crear la reunion.';
      this.success = null;
      this.safeDetectChanges();
      return;
    }
    if (!teacherDni) {
      this.error = 'El taller debe tener un responsable con DNI para crear la reunion.';
      this.success = null;
      this.safeDetectChanges();
      return;
    }
    const draft: ZoomMeetingPrefillDraft = {
      mode: 'ONE_TIME',
      topic: [
        String(this.workshop?.name ?? '').trim(),
        this.selectedGroupLabel(),
        teacherDni,
        meetingDate,
        `${String(block.startTime ?? '').trim()}-${String(block.endTime ?? '').trim()}`,
      ].join(' | '),
      agenda: 'Taller de nivelacion',
      meetingDate,
      startTime: String(block.startTime ?? '').trim(),
      endTime: String(block.endTime ?? '').trim(),
      sourceType: 'WORKSHOP_BLOCK',
      sourceWorkshopId: this.workshopId,
      sourceGroupId: this.selectedGroupId,
      sourceWorkshopScheduleBlockId: String(block.id),
    };
    await this.router.navigate(['/admin/zoom/meetings'], {
      state: { zoomMeetingPrefill: draft },
    });
  }

  async openMeeting(block: GroupScheduleBlockRow) {
    if (!this.workshopId || !this.selectedGroupId || !block.id || !this.canStartMeeting(block)) {
      return;
    }
    this.error = null;
    this.success = null;
    this.blockMeetingActionId = String(block.id);
    this.blockMeetingActionType = 'start';
    const popup = typeof window !== 'undefined'
      ? window.open('about:blank', '_blank')
      : null;
    try {
      const links = await this.workshopsService.refreshGroupScheduleBlockMeetingLinks(
        this.workshopId,
        this.selectedGroupId,
        String(block.id)
      );
      this.patchSelectedBlockMeetingLinks(String(block.id), links);
      if (!links.startUrl) {
        throw new Error('No se pudo obtener un enlace de inicio actualizado.');
      }
      this.navigatePopupToUrl(popup, links.startUrl);
    } catch (e: any) {
      popup?.close();
      this.error =
        e?.error?.message ?? 'No se pudo iniciar la reunion del taller con un enlace actualizado.';
    } finally {
      this.blockMeetingActionId = null;
      this.blockMeetingActionType = null;
      this.safeDetectChanges();
    }
  }

  async copyInvitation(block: GroupScheduleBlockRow) {
    if (!this.workshopId || !this.selectedGroupId || !block.id || !this.canCopyInvitation(block)) {
      return;
    }
    this.error = null;
    this.success = null;
    this.blockMeetingActionId = String(block.id);
    this.blockMeetingActionType = 'copy';
    try {
      const links = await this.workshopsService.refreshGroupScheduleBlockMeetingLinks(
        this.workshopId,
        this.selectedGroupId,
        String(block.id)
      );
      this.patchSelectedBlockMeetingLinks(String(block.id), links);
      if (!links.joinUrl) {
        throw new Error('No se pudo obtener un enlace de invitacion actualizado.');
      }
      await navigator.clipboard.writeText(links.joinUrl);
      this.success = 'Invitacion actualizada y copiada.';
    } catch (e: any) {
      this.error =
        e?.error?.message ?? 'No se pudo copiar una invitacion actualizada del taller.';
    } finally {
      this.blockMeetingActionId = null;
      this.blockMeetingActionType = null;
      this.safeDetectChanges();
    }
  }

  async saveGroups() {
    if (!this.workshopId) return;
    this.error = null;
    this.success = null;
    try {
      const rows = await this.workshopsService.saveGroups(
        this.workshopId,
        this.groups.map((group, index) => ({
          id: group.id.startsWith('local-') ? undefined : group.id,
          code: group.code?.trim() || null,
          displayName: group.displayName?.trim() || `Grupo ${index + 1}`,
          capacity:
            group.capacity === null || group.capacity === undefined || group.capacity === 0
              ? null
              : Number(group.capacity),
          sortOrder: Number(group.sortOrder ?? index + 1),
          isActive: group.isActive !== false,
        }))
      );
      this.groups = rows ?? [];
      if (this.selectedGroupId && this.groups.some((group) => group.id === this.selectedGroupId)) {
        this.selectGroup(this.selectedGroupId);
      } else if (this.groups.length > 0) {
        this.selectGroup(this.groups[0].id);
      } else {
        this.selectedGroupId = null;
        this.selectedGroupSchedule = [];
      }
      this.success = 'Grupos guardados.';
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron guardar los grupos';
    } finally {
      this.safeDetectChanges();
    }
  }

  async saveSelectedGroupSchedule() {
    if (!this.workshopId || !this.selectedGroupId) return;
    this.error = null;
    this.success = null;
    const normalizedBlocks = this.selectedGroupSchedule.map((block) => {
      const exactDate = String(block.startDate ?? '').trim();
      return {
        ...block,
        dayOfWeek: this.isoDayOfWeek(exactDate) || Number(block.dayOfWeek ?? 1),
        startDate: exactDate || null,
        endDate: exactDate || null,
      };
    });
    if (normalizedBlocks.some((block) => !block.startDate)) {
      this.error = 'Debes indicar una fecha exacta para cada bloque del grupo.';
      this.safeDetectChanges();
      return;
    }
    try {
      const rows = await this.workshopsService.saveGroupSchedule(
        this.workshopId,
        this.selectedGroupId,
        normalizedBlocks
      );
      this.groups = this.groups.map((group) =>
        group.id === this.selectedGroupId ? { ...group, scheduleBlocks: rows ?? [] } : group
      );
      this.selectGroup(this.selectedGroupId);
      this.success = 'Horario del grupo guardado.';
    } catch (e: any) {
      this.error = this.formatApiError(
        e?.error,
        e?.error?.message ?? 'No se pudo guardar el horario del grupo'
      );
    } finally {
      this.safeDetectChanges();
    }
  }

  private async navigateToList(error: string) {
    await this.router.navigate(['/admin/workshops'], {
      queryParams: { error },
    });
  }

  private isoDayOfWeek(value: string) {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 0;
    const day = parsed.getDay();
    return day === 0 ? 7 : day;
  }

  private localTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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

  private patchSelectedBlockMeetingLinks(
    blockId: string,
    links: { joinUrl: string | null; startUrl: string | null }
  ) {
    this.selectedGroupSchedule = this.selectedGroupSchedule.map((block) =>
      String(block.id ?? '') === blockId
        ? {
            ...block,
            joinUrl: links.joinUrl,
            startUrl: links.startUrl,
          }
        : block
    );
    this.groups = this.groups.map((group) =>
      group.id === this.selectedGroupId
        ? {
            ...group,
            scheduleBlocks: (group.scheduleBlocks ?? []).map((block) =>
              String(block.id ?? '') === blockId
                ? {
                    ...block,
                    joinUrl: links.joinUrl,
                    startUrl: links.startUrl,
                  }
                : block
            ),
          }
        : group
    );
  }

  private navigatePopupToUrl(popup: Window | null, url: string) {
    if (popup) {
      try {
        popup.opener = null;
      } catch {}
      try {
        popup.location.replace(url);
        return;
      } catch {}
      try {
        popup.location.href = url;
        return;
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  private safeDetectChanges() {
    if (this.destroyed) return;
    this.cdr.detectChanges();
  }
}
