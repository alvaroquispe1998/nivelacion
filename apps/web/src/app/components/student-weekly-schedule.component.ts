import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DAYS, minutesFromHHmm } from '../shared/days';

interface StudentScheduleItem {
  id?: string;
  kind?: 'COURSE' | 'WORKSHOP';
  scheduleBlockId?: string | null;
  zoomMeetingRecordId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  courseName: string;
  sectionName: string;
  groupName?: string | null;
  teacherName?: string | null;
  modality?: string | null;
  classroomCode?: string | null;
  classroomName?: string | null;
  joinUrl?: string | null;
  startUrl?: string | null;
  location?: string | null;
  referenceModality?: string | null;
  referenceClassroom?: string | null;
}

@Component({
  selector: 'app-student-weekly-schedule',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="title || showRefresh" class="flex items-center justify-between gap-3">
      <div *ngIf="title">
        <div class="text-xl font-semibold">{{ title }}</div>
        <div *ngIf="subtitle" class="text-sm text-slate-600">{{ subtitle }}</div>
      </div>
      <button
        *ngIf="showRefresh"
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="refresh.emit()"
      >
        Refrescar
      </button>
    </div>

    <div class="mt-5 overflow-x-auto">
      <div class="min-w-[980px] rounded-2xl border border-slate-200 bg-white">
        <div class="grid grid-cols-[84px_repeat(7,minmax(0,1fr))] border-b border-slate-200">
          <div class="p-3 text-xs font-semibold text-slate-600">Hora</div>
          <div
            *ngFor="let d of days"
            class="border-l border-slate-200 p-3 text-xs font-semibold text-slate-700"
          >
            {{ d.label }}
          </div>
        </div>

        <div class="grid grid-cols-[84px_repeat(7,minmax(0,1fr))]">
          <div class="border-r border-slate-200">
            <div
              *ngFor="let t of timeRows; let i = index"
              class="flex h-6 items-start px-3 text-[11px] text-slate-500"
              [class.border-t]="i > 0"
              [class.border-slate-100]="i > 0"
            >
              <span *ngIf="t">{{ t }}</span>
            </div>
          </div>

          <div
            class="relative col-span-7 grid"
            [style.gridTemplateColumns]="'repeat(7, minmax(0, 1fr))'"
            [style.gridTemplateRows]="'repeat(' + slotCount + ', 24px)'"
          >
            <div
              class="pointer-events-none absolute inset-0"
              [style.background]="gridBg"
            ></div>

            <ng-container *ngFor="let item of items">
              <button
                type="button"
                class="m-0.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-white shadow-sm"
                [class.bg-sky-600]="itemKind(item) === 'COURSE'"
                [class.hover:bg-sky-700]="itemKind(item) === 'COURSE'"
                [class.bg-emerald-600]="itemKind(item) === 'WORKSHOP'"
                [class.hover:bg-emerald-700]="itemKind(item) === 'WORKSHOP'"
                [style.gridColumn]="gridCol(item)"
                [style.gridRow]="gridRow(item)"
                (click)="selectItem(item)"
              >
                <div class="truncate">{{ item.courseName }}</div>
                <div class="font-normal opacity-90">
                  {{ item.startTime }}-{{ item.endTime }}
                  <span class="opacity-80">|</span>
                  {{ secondaryLabel(item) }}
                </div>
              </button>
            </ng-container>
          </div>
        </div>
      </div>
    </div>

    <div
      *ngIf="selectedItem"
      class="fixed inset-0 z-40 bg-slate-900/40 p-4 sm:p-6"
      (click)="closeDetail()"
    >
      <div
        class="mx-auto mt-16 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="text-base font-semibold text-slate-900">
            Detalle de {{ itemKind(selectedItem) === 'WORKSHOP' ? 'taller' : 'curso' }}
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50"
            (click)="closeDetail()"
          >
            Cerrar
          </button>
        </div>
        <div class="mt-3 space-y-1 text-sm text-slate-700">
          <div>
            <b>{{ itemKind(selectedItem) === 'WORKSHOP' ? 'Taller' : 'Curso' }}:</b>
            {{ selectedItem.courseName }}
          </div>
          <div>
            <b>{{ itemKind(selectedItem) === 'WORKSHOP' ? 'Grupo' : 'Seccion' }}:</b>
            {{ secondaryLabel(selectedItem) }}
          </div>
          <div><b>Dia:</b> {{ dayLabel(selectedItem.dayOfWeek) }}</div>
          <div><b>Hora:</b> {{ selectedItem.startTime }}-{{ selectedItem.endTime }}</div>
          <div><b>Docente:</b> {{ selectedItem.teacherName || 'Sin docente asignado' }}</div>
          <div>
            <b>Tipo:</b> {{ itemKind(selectedItem) === 'WORKSHOP' ? 'Taller' : 'Curso' }}
          </div>
          <div *ngIf="isVirtualItem(selectedItem)"><b>Modalidad:</b> Virtual</div>
          <div *ngIf="!isVirtualItem(selectedItem)"><b>Aula:</b> {{ classroomLabel(selectedItem) }}</div>
        </div>
        <div
          *ngIf="detailError"
          class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {{ detailError }}
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            *ngIf="itemKind(selectedItem) === 'WORKSHOP'"
            type="button"
            class="inline-block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
            (click)="joinWorkshop(selectedItem)"
            [disabled]="!canJoinWorkshop(selectedItem) || workshopJoinLoading"
          >
            {{ workshopJoinLoading ? 'Uniendo...' : 'Unirse a taller' }}
          </button>
          <a
            *ngIf="itemKind(selectedItem) !== 'WORKSHOP' && selectedItem.joinUrl"
            class="inline-block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
            [href]="selectedItem.joinUrl"
            target="_blank"
            rel="noreferrer"
          >
            Abrir enlace de clase
          </a>
          <button
            *ngIf="itemKind(selectedItem) !== 'WORKSHOP' && selectedItem.startUrl"
            type="button"
            class="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
            (click)="copyStartUrl(selectedItem.startUrl)"
          >
            Copiar invitacion
          </button>
        </div>
      </div>
    </div>

    <div
      *ngIf="!items.length && emptyMessage"
      class="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-600"
    >
      {{ emptyMessage }}
    </div>
  `,
})
export class StudentWeeklyScheduleComponent {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() title = '';
  @Input() subtitle = '';
  @Input() showRefresh = false;
  @Input() emptyMessage = '';
  @Input() items: StudentScheduleItem[] = [];
  @Output() refresh = new EventEmitter<void>();

  days = DAYS;
  selectedItem: StudentScheduleItem | null = null;
  detailError: string | null = null;
  workshopJoinLoading = false;

  startMinutes = 6 * 60;
  endMinutes = 22 * 60;
  slotMinutes = 30;
  slotCount = (this.endMinutes - this.startMinutes) / this.slotMinutes;

  timeRows = Array.from({ length: this.slotCount }).map((_, idx) => {
    const minutes = this.startMinutes + idx * this.slotMinutes;
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return mm === 0
      ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      : '';
  });

  gridBg =
    'repeating-linear-gradient(to bottom, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 1px, transparent 1px, transparent 24px), ' +
    'repeating-linear-gradient(to right, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 1px, transparent 1px, transparent calc(100%/7))';

  gridCol(item: StudentScheduleItem) {
    return `${item.dayOfWeek} / span 1`;
  }

  gridRow(item: StudentScheduleItem) {
    const start = this.safeMinutes(item.startTime, this.startMinutes);
    const end = this.safeMinutes(item.endTime, start + this.slotMinutes);
    const rowStart = Math.max(
      1,
      Math.min(
        this.slotCount,
        Math.floor(
          (Math.max(start, this.startMinutes) - this.startMinutes) / this.slotMinutes
        ) + 1
      )
    );
    const rowSpan = Math.max(1, Math.ceil((Math.max(end, start) - start) / this.slotMinutes));
    return `${rowStart} / span ${rowSpan}`;
  }

  selectItem(item: StudentScheduleItem) {
    this.detailError = null;
    this.selectedItem = item;
  }

  closeDetail() {
    this.selectedItem = null;
    this.detailError = null;
    this.workshopJoinLoading = false;
  }

  async copyStartUrl(url?: string | null) {
    const value = String(url ?? '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore
    }
  }

  canJoinWorkshop(item: StudentScheduleItem | null | undefined) {
    return this.itemKind(item) === 'WORKSHOP' && Boolean(
      String(item?.joinUrl ?? '').trim() ||
      String(item?.zoomMeetingRecordId ?? '').trim()
    );
  }

  async joinWorkshop(item: StudentScheduleItem | null | undefined) {
    if (!item || !this.canJoinWorkshop(item)) return;
    const blockId = String(item.scheduleBlockId ?? item.id ?? '').trim();
    if (!blockId) return;
    this.detailError = null;
    this.workshopJoinLoading = true;
    const popup = typeof window !== 'undefined'
      ? window.open('about:blank', '_blank')
      : null;
    try {
      const links = await firstValueFrom(
        this.http.post<{ joinUrl: string | null }>(
          `/api/student/workshop-schedule-blocks/${encodeURIComponent(blockId)}/refresh-join-link`,
          {}
        )
      );
      const joinUrl = String(links.joinUrl ?? '').trim();
      if (!joinUrl) {
        throw new Error('No se pudo obtener un enlace vigente para el taller.');
      }
      this.selectedItem = {
        ...item,
        joinUrl,
      };
      this.navigatePopupToUrl(popup, joinUrl);
    } catch (e: any) {
      popup?.close();
      this.detailError =
        e?.error?.message ?? 'No se pudo abrir un enlace actualizado para el taller.';
    } finally {
      this.workshopJoinLoading = false;
      this.cdr.detectChanges();
    }
  }

  dayLabel(dayOfWeek: number) {
    const labels: Record<number, string> = {
      1: 'Lunes',
      2: 'Martes',
      3: 'Miercoles',
      4: 'Jueves',
      5: 'Viernes',
      6: 'Sabado',
      7: 'Domingo',
    };
    return labels[Number(dayOfWeek)] ?? String(dayOfWeek ?? '');
  }

  isVirtualItem(item: StudentScheduleItem | null | undefined) {
    const reference = String(item?.referenceModality ?? '')
      .trim()
      .toUpperCase();
    if (reference) return reference.includes('VIRTUAL');
    return String(item?.modality ?? '')
      .trim()
      .toUpperCase()
      .includes('VIRTUAL');
  }

  classroomLabel(item: StudentScheduleItem | null | undefined) {
    const reference = String(item?.referenceClassroom ?? '').trim();
    if (reference) return reference;
    const name = String(item?.classroomName ?? '').trim();
    if (name) return name;
    const code = String(item?.classroomCode ?? '').trim();
    if (code) return `Aula ${code}`;
    const location = String(item?.location ?? '').trim();
    if (location) return location;
    return 'Sin aula asignada';
  }

  itemKind(item: StudentScheduleItem | null | undefined) {
    return String(item?.kind ?? 'COURSE').trim().toUpperCase() === 'WORKSHOP'
      ? 'WORKSHOP'
      : 'COURSE';
  }

  secondaryLabel(item: StudentScheduleItem | null | undefined) {
    if (this.itemKind(item) === 'WORKSHOP') {
      return String(item?.groupName ?? item?.sectionName ?? '').trim() || 'Grupo';
    }
    return String(item?.sectionName ?? '').trim() || 'Seccion';
  }

  private safeMinutes(value: string, fallback: number) {
    const minutes = minutesFromHHmm(value);
    return Number.isFinite(minutes) ? minutes : fallback;
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
