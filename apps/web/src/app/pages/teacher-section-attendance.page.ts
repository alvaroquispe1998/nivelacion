import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AttendanceStatus } from '@uai/shared';
import { combineLatest, firstValueFrom } from 'rxjs';
import type { Subscription } from 'rxjs';
import { DAYS } from '../shared/days';

interface TeacherAssignment {
  sectionCourseId: string;
  sectionId: string;
  sectionName: string;
  sectionCode: string | null;
  courseId: string;
  courseName: string;
}

interface TeacherScheduleBlock {
  id: string;
  sectionId: string;
  sectionCourseId: string;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface TeacherSession {
  id: string;
  scheduleBlockId: string;
  sessionDate: string;
  courseName: string;
  sectionCourseId?: string | null;
}

interface TeacherStudentRow {
  id: string;
  dni: string;
  codigoAlumno: string | null;
  fullName: string;
}

interface TeacherRecordRow {
  studentId: string;
  fullName: string;
  status: AttendanceStatus;
  notes?: string | null;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="text-xl font-semibold">Registro de asistencia</div>
          <div class="text-sm text-slate-600">
            {{ assignmentLabel }}
          </div>
        </div>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="loadAll()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <label class="block">
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Horario asignado
        </div>
        <select
          class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          [(ngModel)]="selectedBlockId"
          (ngModelChange)="onBlockChange()"
          [disabled]="blocks.length === 0"
        >
          <option value="">Seleccionar horario</option>
          <option *ngFor="let b of blocks; trackBy: trackBlock" [value]="b.id">
            {{ dayLabel(b.dayOfWeek) }} {{ b.startTime }}-{{ b.endTime }} |
            {{ formatDateRange(b.startDate, b.endDate) }}
          </option>
        </select>
      </label>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div class="text-sm font-semibold">Control semanal</div>
          <div class="text-xs text-slate-600">
            Alumnos: {{ students.length }} | Fechas: {{ weekDates.length }}
          </div>
        </div>
        <div class="flex items-center gap-2">
          <select
            class="rounded-lg border border-slate-200 px-2 py-2 text-xs"
            [(ngModel)]="selectedSaveDate"
            [disabled]="weekDates.length===0"
          >
            <option value="">Seleccionar fecha</option>
            <option [value]="allDatesOption">Todas las fechas</option>
            <option *ngFor="let d of weekDates; trackBy: trackText" [value]="d">
              {{ d }}
            </option>
          </select>
          <button
            class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            (click)="saveAll()"
            [disabled]="saving || !selectedBlock || students.length===0 || weekDates.length===0 || !selectedSaveDate"
          >
            {{ saving ? 'Guardando...' : 'Guardar asistencia' }}
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-4 py-3">
                Alumno
              </th>
              <th class="border-r border-slate-200 bg-slate-50 px-3 py-3">Codigo</th>
              <th
                *ngFor="let d of weekDates; trackBy: trackText"
                class="min-w-[160px] border-r border-slate-200 px-3 py-3 text-center"
              >
                <div>{{ shortDayLabel(d) }}</div>
                <div class="text-[11px] font-medium normal-case tracking-normal text-slate-500">
                  {{ d }}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of students; trackBy: trackStudent" class="border-t border-slate-100">
              <td class="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 font-medium">
                {{ s.fullName }}
              </td>
              <td class="border-r border-slate-200 bg-white px-3 py-3 text-slate-600">
                {{ studentCode(s.codigoAlumno) }}
              </td>
              <td
                *ngFor="let d of weekDates; trackBy: trackText"
                class="border-r border-slate-100 px-2 py-2"
              >
                <select
                  class="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                  [ngModel]="getStatus(d, s.id)"
                  (ngModelChange)="setStatus(d, s.id, $event)"
                  [ngModelOptions]="{ standalone: true }"
                >
                  <option [ngValue]="AttendanceStatus.ASISTIO">ASISTIO</option>
                  <option [ngValue]="AttendanceStatus.FALTO">FALTO</option>
                </select>
              </td>
            </tr>

            <tr *ngIf="students.length===0" class="border-t border-slate-100">
              <td class="px-4 py-6 text-slate-600" [attr.colspan]="weekDates.length + 2">
                No hay alumnos para este curso-seccion.
              </td>
            </tr>
            <tr *ngIf="students.length>0 && weekDates.length===0" class="border-t border-slate-100">
              <td class="px-4 py-6 text-slate-600" colspan="3">
                El horario no tiene rango de vigencia ni sesiones creadas para calcular semanas.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class TeacherSectionAttendancePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly AttendanceStatus = AttendanceStatus;
  readonly days = DAYS;
  sectionCourseId = '';
  private routeSub?: Subscription;

  assignment: TeacherAssignment | null = null;
  blocks: TeacherScheduleBlock[] = [];
  sessions: TeacherSession[] = [];
  students: TeacherStudentRow[] = [];

  selectedBlockId = '';
  selectedSaveDate = '';
  weekDates: string[] = [];
  statusMatrix: Record<string, Record<string, AttendanceStatus>> = {};
  sessionsByDate = new Map<string, TeacherSession>();

  error: string | null = null;
  saving = false;
  readonly allDatesOption = '__ALL__';

  get selectedBlock() {
    return this.blocks.find((b) => b.id === this.selectedBlockId) ?? null;
  }

  get assignmentLabel() {
    if (!this.assignment) return 'Curso-seccion';
    return `${this.assignment.sectionCode || this.assignment.sectionName} | ${this.assignment.courseName}`;
  }

  async ngOnInit() {
    this.routeSub = combineLatest([this.route.paramMap]).subscribe(([params]) => {
      this.sectionCourseId = String(params.get('sectionCourseId') ?? '').trim();
      void this.loadAll();
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  trackText(_: number, item: string) {
    return item;
  }

  trackBlock(_: number, item: TeacherScheduleBlock) {
    return item.id;
  }

  trackStudent(_: number, item: TeacherStudentRow) {
    return item.id;
  }

  studentCode(code: string | null | undefined) {
    const value = String(code ?? '').trim();
    return value || 'SIN CODIGO';
  }

  dayLabel(dow: number) {
    return this.days.find((d) => d.dayOfWeek === dow)?.label ?? String(dow);
  }

  shortDayLabel(isoDate: string) {
    const jsDow = new Date(`${isoDate}T00:00:00`).getDay();
    const dow = jsDow === 0 ? 7 : jsDow;
    return this.dayLabel(dow);
  }

  formatDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate) return `${startDate} a ${endDate}`;
    if (startDate) return `Desde ${startDate}`;
    if (endDate) return `Hasta ${endDate}`;
    return 'Sin rango';
  }

  async loadAll() {
    this.error = null;
    this.selectedBlockId = '';
    this.selectedSaveDate = '';
    this.weekDates = [];
    this.statusMatrix = {};
    this.sessionsByDate.clear();
    this.students = [];

    if (!this.sectionCourseId) {
      this.error = 'sectionCourseId invalido';
      this.cdr.detectChanges();
      return;
    }

    try {
      const [assignments, blocks, sessions, students] = await Promise.all([
        firstValueFrom(this.http.get<TeacherAssignment[]>('/api/teacher/assignments')),
        firstValueFrom(
          this.http.get<TeacherScheduleBlock[]>(
            `/api/teacher/section-courses/${encodeURIComponent(this.sectionCourseId)}/blocks`
          )
        ),
        firstValueFrom(
          this.http.get<TeacherSession[]>(
            `/api/teacher/attendance-sessions?sectionCourseId=${encodeURIComponent(this.sectionCourseId)}`
          )
        ),
        firstValueFrom(
          this.http.get<TeacherStudentRow[]>(
            `/api/teacher/section-courses/${encodeURIComponent(this.sectionCourseId)}/students`
          )
        ),
      ]);
      this.assignment =
        assignments.find((x) => x.sectionCourseId === this.sectionCourseId) ?? null;
      this.blocks = blocks;
      this.sessions = sessions;
      this.students = students;

      if (this.blocks.length > 0) {
        this.selectedBlockId = this.blocks[0].id;
      }
      await this.onBlockChange();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar asistencia de docente';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onBlockChange() {
    this.error = null;
    this.selectedSaveDate = '';
    this.weekDates = [];
    this.statusMatrix = {};
    this.sessionsByDate.clear();

    const block = this.selectedBlock;
    if (!block) {
      this.cdr.detectChanges();
      return;
    }

    const blockSessions = this.sessions
      .filter((s) => s.scheduleBlockId === block.id)
      .slice()
      .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

    this.weekDates = this.computeWeekDates(block, blockSessions);
    this.selectedSaveDate = this.weekDates[0] ?? '';
    for (const session of blockSessions) {
      this.sessionsByDate.set(session.sessionDate, session);
    }

    try {
      const recordsBySession = await Promise.all(
        blockSessions.map((s) =>
          firstValueFrom(
            this.http.get<TeacherRecordRow[]>(
              `/api/teacher/attendance-sessions/${s.id}/records`
            )
          ).then((records) => ({ date: s.sessionDate, records }))
        )
      );

      for (const item of recordsBySession) {
        this.statusMatrix[item.date] = this.statusMatrix[item.date] ?? {};
        for (const rec of item.records) {
          this.statusMatrix[item.date][rec.studentId] = rec.status;
        }
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar registros de sesiones';
    } finally {
      this.cdr.detectChanges();
    }
  }

  getStatus(date: string, studentId: string) {
    return this.statusMatrix[date]?.[studentId] ?? AttendanceStatus.FALTO;
  }

  setStatus(date: string, studentId: string, status: AttendanceStatus) {
    this.statusMatrix[date] = this.statusMatrix[date] ?? {};
    this.statusMatrix[date][studentId] = status;
  }

  async saveAll() {
    const block = this.selectedBlock;
    if (!block) return;
    if (this.students.length === 0 || this.weekDates.length === 0) return;
    const datesToSave =
      this.selectedSaveDate === this.allDatesOption
        ? this.weekDates
        : this.selectedSaveDate
          ? [this.selectedSaveDate]
          : [];
    if (datesToSave.length === 0) return;

    this.saving = true;
    this.error = null;
    try {
      for (const date of datesToSave) {
        let session = this.sessionsByDate.get(date);
        if (!session) {
          const created = await firstValueFrom(
            this.http.post<{ id: string; scheduleBlockId: string; sessionDate: string }>(
              '/api/teacher/attendance-sessions',
              {
                scheduleBlockId: block.id,
                sessionDate: date,
              }
            )
          );
          session = {
            id: created.id,
            scheduleBlockId: created.scheduleBlockId,
            sessionDate: created.sessionDate,
            courseName: block.courseName,
            sectionCourseId: block.sectionCourseId,
          };
          this.sessionsByDate.set(date, session);
          this.sessions.push(session);
        }

        await firstValueFrom(
          this.http.put(`/api/teacher/attendance-sessions/${session.id}/records`, [
            ...this.students.map((st) => ({
              studentId: st.id,
              status: this.getStatus(date, st.id),
            })),
          ])
        );
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar asistencia';
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private computeWeekDates(block: TeacherScheduleBlock, sessions: TeacherSession[]) {
    const start = String(block.startDate ?? '').trim();
    const end = String(block.endDate ?? '').trim();
    if (start && end) {
      const targetDow = Number(block.dayOfWeek || 1);
      const dates: string[] = [];
      let current = new Date(`${start}T00:00:00`);
      const endDate = new Date(`${end}T00:00:00`);

      const currentDow = current.getDay() === 0 ? 7 : current.getDay();
      const delta = (targetDow - currentDow + 7) % 7;
      current.setDate(current.getDate() + delta);

      while (current <= endDate) {
        dates.push(this.toIsoDate(current));
        current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
      }
      return dates;
    }

    return Array.from(new Set(sessions.map((x) => x.sessionDate))).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  private toIsoDate(value: Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
