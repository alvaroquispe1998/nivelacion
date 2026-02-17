import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import type { StudentScheduleItem } from '@uai/shared';
import { firstValueFrom } from 'rxjs';
import { DAYS, minutesFromHHmm } from '../shared/days';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Horario semanal</div>
        <div class="text-sm text-slate-600">6:00 a 22:00 (30 min)</div>
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

    <div class="mt-5 overflow-x-auto">
      <div class="min-w-[980px] rounded-2xl border border-slate-200 bg-white">
        <div class="grid grid-cols-[84px_repeat(7,minmax(0,1fr))] border-b border-slate-200">
          <div class="p-3 text-xs font-semibold text-slate-600">Hora</div>
          <div
            *ngFor="let d of days"
            class="p-3 text-xs font-semibold text-slate-700 border-l border-slate-200"
          >
            {{ d.label }}
          </div>
        </div>

        <div class="grid grid-cols-[84px_repeat(7,minmax(0,1fr))]">
          <div class="border-r border-slate-200">
            <div
              *ngFor="let t of timeRows; let i = index"
              class="h-6 px-3 text-[11px] text-slate-500 flex items-start"
              [class.border-t]="i>0"
              [class.border-slate-100]="i>0"
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
              <a
                class="m-0.5 rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-sky-700"
                [style.gridColumn]="gridCol(item)"
                [style.gridRow]="gridRow(item)"
                [href]="item.zoomUrl || null"
                [attr.target]="item.zoomUrl ? '_blank' : null"
                [attr.rel]="item.zoomUrl ? 'noreferrer' : null"
                (click)="!item.zoomUrl && $event.preventDefault()"
              >
                <div class="truncate">{{ item.courseName }}</div>
                <div class="opacity-90 font-normal">
                  {{ item.startTime }}-{{ item.endTime }}
                  <span class="opacity-80">|</span>
                  {{ item.sectionName }}
                </div>
              </a>
            </ng-container>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class StudentSchedulePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  days = DAYS;
  items: StudentScheduleItem[] = [];
  error: string | null = null;

  startMinutes = 6 * 60;
  endMinutes = 22 * 60;
  slotMinutes = 30;
  slotCount = (this.endMinutes - this.startMinutes) / this.slotMinutes;

  timeRows = Array.from({ length: this.slotCount }).map((_, idx) => {
    const minutes = this.startMinutes + idx * this.slotMinutes;
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    return mm === 0 ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : '';
  });

  gridBg =
    'repeating-linear-gradient(to bottom, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 1px, transparent 1px, transparent 24px), ' +
    'repeating-linear-gradient(to right, rgba(148,163,184,0.35), rgba(148,163,184,0.35) 1px, transparent 1px, transparent calc(100%/7))';

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.error = null;
    try {
      this.items = await firstValueFrom(
        this.http.get<StudentScheduleItem[]>('/api/student/schedule')
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar el horario';
    } finally {
      // This app runs without zone.js; force a render after async updates.
      this.cdr.detectChanges();
    }
  }

  gridCol(item: StudentScheduleItem) {
    // 1=Lunes ... 7=Domingo
    return `${item.dayOfWeek} / span 1`;
  }

  gridRow(item: StudentScheduleItem) {
    const start = minutesFromHHmm(item.startTime);
    const end = minutesFromHHmm(item.endTime);
    const rowStart = (start - this.startMinutes) / this.slotMinutes + 1;
    const rowSpan = (end - start) / this.slotMinutes;
    return `${rowStart} / span ${rowSpan}`;
  }
}
