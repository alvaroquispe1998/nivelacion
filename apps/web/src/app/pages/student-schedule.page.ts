import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { StudentWeeklyScheduleComponent } from '../components/student-weekly-schedule.component';

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
  standalone: true,
  imports: [CommonModule, StudentWeeklyScheduleComponent],
  template: `
    <app-student-weekly-schedule
      [title]="'Horario semanal'"
      [showRefresh]="true"
      [items]="items"
      [emptyMessage]="!error ? 'No hay horario registrado todavia.' : ''"
      (refresh)="load()"
    />

    <div
      *ngIf="error"
      class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ error }}
    </div>
  `,
})
export class StudentSchedulePage {
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  items: StudentScheduleItem[] = [];
  error: string | null = null;

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
      this.items = [];
      this.error = e?.error?.message ?? 'No se pudo cargar el horario';
    } finally {
      this.cdr.detectChanges();
    }
  }
}
