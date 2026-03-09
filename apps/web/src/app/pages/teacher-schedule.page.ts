import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DAYS } from '../shared/days';

interface TeacherScheduleItem {
  id: string;
  kind?: 'COURSE' | 'WORKSHOP';
  scheduleBlockId?: string | null;
  sectionId?: string | null;
  sectionCourseId?: string | null;
  applicationId?: string | null;
  applicationGroupId?: string | null;
  sectionName: string;
  sectionCode: string | null;
  courseName: string;
  groupName?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
  zoomMeetingRecordId?: string | null;
  joinUrl?: string | null;
  startUrl?: string | null;
  location?: string | null;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Horario</div>
        <div class="text-sm text-slate-600">Cursos y talleres asignados</div>
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

    <div class="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="min-w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th class="px-4 py-3">Tipo</th>
            <th class="px-4 py-3">Seccion</th>
            <th class="px-4 py-3">Espacio</th>
            <th class="px-4 py-3">Dia</th>
            <th class="px-4 py-3">Hora</th>
            <th class="px-4 py-3">Vigencia</th>
            <th class="px-4 py-3">Reunion</th>
          </tr>
        </thead>
        <tbody>
          <tr
            *ngFor="let item of items; trackBy: trackItem"
            class="border-t border-slate-100"
            [class.bg-emerald-50]="itemKind(item) === 'WORKSHOP'"
          >
            <td class="px-4 py-3">
              <span
                class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                [class.bg-sky-100]="itemKind(item) === 'COURSE'"
                [class.text-sky-700]="itemKind(item) === 'COURSE'"
                [class.bg-emerald-100]="itemKind(item) === 'WORKSHOP'"
                [class.text-emerald-700]="itemKind(item) === 'WORKSHOP'"
              >
                {{ itemKind(item) === 'WORKSHOP' ? 'Taller' : 'Curso' }}
              </span>
            </td>
            <td class="px-4 py-3 font-medium">{{ secondaryLabel(item) }}</td>
            <td class="px-4 py-3">{{ item.courseName }}</td>
            <td class="px-4 py-3">{{ dayLabel(item.dayOfWeek) }}</td>
            <td class="px-4 py-3">{{ item.startTime }}-{{ item.endTime }}</td>
            <td class="px-4 py-3">{{ formatDateRange(item.startDate, item.endDate) }}</td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  *ngIf="canStartMeeting(item); else noStart"
                  class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  type="button"
                  (click)="openMeeting(item)"
                  [disabled]="meetingActionId === item.id"
                >
                  {{ meetingActionId === item.id && meetingActionType === 'start' ? 'Abriendo...' : 'Entrar' }}
                </button>
                <ng-template #noStart>
                  <span class="text-xs text-slate-400">-</span>
                </ng-template>
                <button
                  class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  type="button"
                  (click)="copyInvitation(item)"
                  [disabled]="!canCopyInvitation(item) || meetingActionId === item.id"
                >
                  {{ meetingActionId === item.id && meetingActionType === 'copy' ? 'Copiando...' : 'Copiar invitacion' }}
                </button>
              </div>
            </td>
          </tr>
          <tr *ngIf="items.length === 0" class="border-t border-slate-100">
            <td class="px-4 py-6 text-slate-600" colspan="7">Sin horarios asignados.</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
})
export class TeacherSchedulePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly days = DAYS;
  items: TeacherScheduleItem[] = [];
  error: string | null = null;
  meetingActionId: string | null = null;
  meetingActionType: 'start' | 'copy' | null = null;

  async ngOnInit() {
    await this.load();
  }

  trackItem(_: number, item: TeacherScheduleItem) {
    return item.id;
  }

  dayLabel(dow: number) {
    return this.days.find((d) => d.dayOfWeek === dow)?.label ?? String(dow);
  }

  formatDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate) return `${startDate} a ${endDate}`;
    if (startDate) return `Desde ${startDate}`;
    if (endDate) return `Hasta ${endDate}`;
    return 'Sin rango';
  }

  itemKind(item: TeacherScheduleItem | null | undefined) {
    return String(item?.kind ?? 'COURSE').trim().toUpperCase() === 'WORKSHOP'
      ? 'WORKSHOP'
      : 'COURSE';
  }

  secondaryLabel(item: TeacherScheduleItem) {
    if (this.itemKind(item) === 'WORKSHOP') {
      return String(item.groupName ?? item.sectionName ?? '').trim() || 'Grupo';
    }
    return String(item.sectionCode || item.sectionName || '').trim();
  }

  canStartMeeting(item: TeacherScheduleItem) {
    return Boolean(
      String(item.startUrl ?? '').trim() || String(item.zoomMeetingRecordId ?? '').trim()
    );
  }

  canCopyInvitation(item: TeacherScheduleItem) {
    return Boolean(
      String(item.joinUrl ?? '').trim() || String(item.zoomMeetingRecordId ?? '').trim()
    );
  }

  async load() {
    this.error = null;
    try {
      this.items = await firstValueFrom(
        this.http.get<TeacherScheduleItem[]>('/api/teacher/schedule')
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar horario de docente';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async openMeeting(item: TeacherScheduleItem) {
    if (!this.canStartMeeting(item)) return;
    this.error = null;
    this.meetingActionId = item.id;
    this.meetingActionType = 'start';
    const popup = typeof window !== 'undefined'
      ? window.open('about:blank', '_blank')
      : null;
    try {
      const links = await this.refreshMeetingLinks(item.id);
      if (!links.startUrl) {
        throw new Error('No se pudo obtener un enlace de inicio para la reunion.');
      }
      this.patchMeetingLinks(item.id, links);
      this.navigatePopupToUrl(popup, links.startUrl);
    } catch {
      popup?.close();
      this.error = 'No se pudo iniciar la reunion con un enlace actualizado.';
    } finally {
      this.meetingActionId = null;
      this.meetingActionType = null;
      this.cdr.detectChanges();
    }
  }

  async copyInvitation(item: TeacherScheduleItem) {
    if (!this.canCopyInvitation(item)) return;
    this.error = null;
    this.meetingActionId = item.id;
    this.meetingActionType = 'copy';
    try {
      const links = await this.refreshMeetingLinks(item.id);
      if (!links.joinUrl) {
        throw new Error('No se pudo obtener un enlace de invitacion para la reunion.');
      }
      this.patchMeetingLinks(item.id, links);
      await navigator.clipboard.writeText(links.joinUrl);
    } catch {
      this.error = 'No se pudo copiar una invitacion actualizada.';
    } finally {
      this.meetingActionId = null;
      this.meetingActionType = null;
      this.cdr.detectChanges();
    }
  }

  private async refreshMeetingLinks(blockId: string) {
    const item = this.items.find(
      (scheduleItem) => String(scheduleItem.scheduleBlockId ?? scheduleItem.id) === blockId
    );
    const endpoint =
      this.itemKind(item) === 'WORKSHOP'
        ? `/api/teacher/workshop-schedule-blocks/${encodeURIComponent(blockId)}/refresh-meeting-links`
        : `/api/teacher/schedule-blocks/${encodeURIComponent(blockId)}/refresh-meeting-links`;
    return firstValueFrom(
      this.http.post<{ joinUrl: string | null; startUrl: string | null }>(
        endpoint,
        {}
      )
    );
  }

  private patchMeetingLinks(
    blockId: string,
    links: { joinUrl: string | null; startUrl: string | null }
  ) {
    this.items = this.items.map((item) =>
      item.id === blockId
        ? {
            ...item,
            joinUrl: links.joinUrl,
            startUrl: links.startUrl,
          }
        : item
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
}
