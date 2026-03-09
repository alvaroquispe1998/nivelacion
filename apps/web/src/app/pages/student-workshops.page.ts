import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PrivateRouteContextService } from '../core/navigation/private-route-context.service';

interface WorkshopScheduleBlock {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface StudentWorkshopRow {
  applicationId: string;
  workshopId: string;
  workshopName: string;
  deliveryMode: string;
  venueCampusName: string | null;
  responsibleTeacherName: string | null;
  applicationGroupId: string;
  sourceGroupId: string | null;
  groupCode: string | null;
  groupName: string | null;
  groupIndex: number;
  studentCount: number;
  scheduleSummary: string;
  scheduleBlocks: WorkshopScheduleBlock[];
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Mis talleres</div>
        <div class="text-sm text-slate-600">Talleres asignados y su horario de grupo.</div>
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

    <div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th class="px-4 py-3">Taller</th>
            <th class="px-4 py-3">Grupo</th>
            <th class="px-4 py-3">Horario</th>
            <th class="px-4 py-3">Accion</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let item of items; trackBy: trackItem" class="border-t border-slate-100 bg-emerald-50/60">
            <td class="px-4 py-3 font-medium">{{ item.workshopName }}</td>
            <td class="px-4 py-3">{{ item.groupName || item.groupCode || 'Grupo' }}</td>
            <td class="px-4 py-3 text-slate-700">{{ item.scheduleSummary }}</td>
            <td class="px-4 py-3">
              <button
                type="button"
                class="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                (click)="openAttendance(item)"
              >
                Ver asistencia
              </button>
            </td>
          </tr>
          <tr *ngIf="items.length === 0" class="border-t border-slate-100">
            <td class="px-4 py-6 text-slate-600" colspan="4">Sin talleres asignados.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class StudentWorkshopsPage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly routeContext = inject(PrivateRouteContextService);

  items: StudentWorkshopRow[] = [];
  error: string | null = null;

  async ngOnInit() {
    await this.load();
  }

  trackItem(_: number, item: StudentWorkshopRow) {
    return item.applicationGroupId;
  }

  async openAttendance(item: StudentWorkshopRow) {
    this.routeContext.setStudentAttendanceFocus({
      kind: 'WORKSHOP',
      applicationGroupId: item.applicationGroupId,
    });
    await this.router.navigate(['/student/attendance']);
  }

  async load() {
    this.error = null;
    try {
      this.items = await firstValueFrom(
        this.http.get<StudentWorkshopRow[]>('/api/student/workshops')
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar tus talleres.';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
