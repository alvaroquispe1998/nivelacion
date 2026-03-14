import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Role, type AdminScheduleBlock, type AdminSection } from '@uai/shared';
import { combineLatest, firstValueFrom, skip } from 'rxjs';
import type { Subscription } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import { DAYS, minutesFromHHmm } from '../shared/days';
import { WorkflowStateService } from '../core/workflow/workflow-state.service';

interface ActivePeriod {
  id: string;
  code: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
}

interface CourseReferenceDefaults {
  referenceModality: string;
  referenceClassroom: string;
}

interface BulkApplyFromMotherResponse {
  motherSectionCourseId: string;
  updatedCount?: number;
  updatedSections?: number;
  removedBlocks?: number;
  createdBlocks?: number;
  skipped?: Array<{ sectionCourseId: string; reason: string }>;
}

interface SectionZoomContext {
  sectionId: string;
  sectionCode: string | null;
  courseName: string;
  teacherDni: string | null;
  teacherName: string | null;
}

type ZoomActionMode = 'ONE_TIME' | 'RECURRING';

interface ZoomMeetingPrefillDraft {
  mode: ZoomActionMode;
  topic: string;
  agenda: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  sourceBlockId?: string;
  sourceSectionId?: string;
  sourceCourseName?: string;
  weeklyDays?: number[];
  repeatInterval?: number;
  recurrenceEndMode?: 'UNTIL_DATE';
  recurrenceEndDate?: string;
}

const COURSE_CONTEXT_STORAGE_KEY = 'admin.sections.selectedCourseName';

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="text-xl font-semibold">Horario de seccion</div>
          <div class="text-sm text-slate-600">
            Registra curso, dia, hora y rango de vigencia para usarlo en asistencias.
          </div>
        </div>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="load()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {{ success }}
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-3">
      <div class="xl:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Curso</th>
              <th class="px-4 py-3">Dia</th>
              <th class="px-4 py-3">Hora</th>
              <th class="px-4 py-3">Modalidad</th>
              <th class="px-4 py-3">Aula</th>
              <th class="px-4 py-3">Vigencia</th>
              <th class="px-4 py-3">Reunion</th>
              <th class="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of visibleBlocks; trackBy: trackBlock" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ b.courseName }}</td>
              <td class="px-4 py-3">{{ dayLabel(b.dayOfWeek) }}</td>
              <td class="px-4 py-3 text-slate-700">{{ b.startTime }}-{{ b.endTime }}</td>
              <td class="px-4 py-3 text-slate-700">{{ blockReferenceModalityLabel(b) }}</td>
              <td class="px-4 py-3 text-slate-700">{{ blockReferenceClassroomLabel(b) }}</td>
              <td class="px-4 py-3 text-slate-700">
                {{ formatDateRange(b.startDate, b.endDate) }}
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <a
                    *ngIf="canStartMeeting(b); else noStartUrl"
                    class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    href=""
                    (click)="openMeeting($event, b)"
                    [class.pointer-events-none]="meetingActionId === b.id"
                    [class.opacity-60]="meetingActionId === b.id"
                  >
                    {{ meetingActionId === b.id && meetingActionType === 'start' ? 'Abriendo...' : 'Entrar' }}
                  </a>
                  <ng-template #noStartUrl>
                    <span class="text-xs text-slate-400">-</span>
                  </ng-template>
                  <button
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    type="button"
                    (click)="copyInvitation(b)"
                    [disabled]="!canCopyInvitation(b) || meetingActionId === b.id"
                  >
                    {{ meetingActionId === b.id && meetingActionType === 'copy' ? 'Copiando...' : 'Copiar invitacion' }}
                  </button>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <ng-container *ngIf="canUseZoomPrefill">
                    <span [title]="zoomPrefillReason(b, 'ONE_TIME') || 'Abrir Zoom con reunion unica precargada'">
                      <button
                        type="button"
                        class="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                        [disabled]="!!zoomPrefillReason(b, 'ONE_TIME')"
                        (click)="openZoomPrefill(b, 'ONE_TIME')"
                      >
                        Reunion unica
                      </button>
                    </span>
                    <span [title]="zoomPrefillReason(b, 'RECURRING') || 'Abrir Zoom con reunion recurrente precargada'">
                      <button
                        type="button"
                        class="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                        [disabled]="!!zoomPrefillReason(b, 'RECURRING')"
                        (click)="openZoomPrefill(b, 'RECURRING')"
                      >
                        Reunion recurrente
                      </button>
                    </span>
                  </ng-container>
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="startEdit(b)"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    class="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    (click)="remove(b.id)"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="visibleBlocks.length===0" class="border-t border-slate-100">
              <td class="px-4 py-6 text-slate-600" colspan="8">Sin bloques</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">
          {{ editingBlockId ? 'Editar bloque' : 'Nuevo bloque' }}
        </div>
        <div class="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div class="text-[11px] uppercase tracking-wide text-slate-500">Curso</div>
          <div class="text-sm font-semibold text-slate-900">{{ selectedCourseName || '-' }}</div>
        </div>
        <form class="mt-3 space-y-3" [formGroup]="form" (ngSubmit)="saveBlock()">
          <select
            class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            formControlName="dayOfWeek"
          >
            <option *ngFor="let d of days" [value]="d.dayOfWeek">{{ d.label }}</option>
          </select>
          <div class="grid grid-cols-2 gap-2">
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="startTime"
              placeholder="Inicio (HH:mm)"
            />
            <input
              class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
              formControlName="endTime"
              placeholder="Fin (HH:mm)"
            />
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div class="mb-1 text-xs text-slate-500">Fecha inicio</div>
              <input
                type="date"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="startDate"
              />
            </div>
            <div>
              <div class="mb-1 text-xs text-slate-500">Fecha fin</div>
              <input
                type="date"
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="endDate"
              />
            </div>
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div class="mb-1 text-xs text-slate-500">Modalidad</div>
              <select
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="referenceModality"
              >
                <option value="PRESENCIAL">PRESENCIAL</option>
                <option value="VIRTUAL">VIRTUAL</option>
              </select>
            </div>
            <div>
              <div class="mb-1 text-xs text-slate-500">Aula</div>
              <input
                class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="referenceClassroom"
                placeholder="Sin aula"
              />
            </div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div class="text-xs font-semibold text-slate-700">Enlaces de clase</div>
            <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div class="mb-1 text-xs text-slate-500">Enlace de inicio de clase (Docente)</div>
                <input
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  formControlName="startUrl"
                  placeholder="https://..."
                />
              </div>
              <div>
                <div class="mb-1 text-xs text-slate-500">
                  Enlace de acceso a clase (Estudiantes)
                </div>
                <input
                  class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  formControlName="joinUrl"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>
          <label
            *ngIf="canApplyWholeCourse"
            class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          >
            <input
              type="checkbox"
              formControlName="applyToWholeCourse"
              class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            Horario para todo el curso (todas las secciones)
          </label>
          <label
            *ngIf="canApplyWholeCourse && form.value.applyToWholeCourse"
            class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
          >
            <input
              type="checkbox"
              formControlName="applyTeacherToWholeCourse"
              class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            Aplicar tambien el docente de seccion madre a todo el curso
          </label>
          <div *ngIf="showMotherOnlyInfo" class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            La sincronizacion masiva se habilita solo cuando editas desde la seccion madre del curso.
          </div>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="form.invalid || loading"
            >
              {{
                loading
                  ? (editingBlockId ? 'Guardando...' : 'Creando...')
                  : (editingBlockId ? 'Guardar cambios' : 'Crear')
              }}
            </button>
            <button
              type="button"
              class="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              [disabled]="!editingBlockId || loading"
              (click)="cancelEdit()"
            >
              Cancelar
            </button>
          </div>
        </form>

        <div class="mt-2 text-xs text-slate-600">Si defines vigencia, se usara para semanas de asistencia.</div>
      </div>
    </div>
  `,
})
export class AdminSectionSchedulePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private readonly workflowState = inject(WorkflowStateService);

  readonly days = DAYS;
  sectionId = '';
  private routeSub?: Subscription;
  private periodSub?: Subscription;

  blocks: AdminScheduleBlock[] = [];
  error: string | null = null;
  success: string | null = null;
  loading = false;
  selectedCourseName = '';
  contextCourseName = '';
  scopeFacultyGroup = '';
  scopeCampusName = '';
  scopeCourseName = '';
  isMotherSection = false;
  editingBlockId: string | null = null;
  meetingActionId: string | null = null;
  meetingActionType: 'start' | 'copy' | null = null;
  period: ActivePeriod | null = null;
  zoomContext: SectionZoomContext | null = null;
  zoomContextError: string | null = null;
  referenceDefaults: CourseReferenceDefaults = {
    referenceModality: 'PRESENCIAL',
    referenceClassroom: 'Sin aula',
  };

  get visibleBlocks() {
    const course = this.selectedCourseName.trim();
    if (!course) return this.blocks;
    const key = this.courseKey(course);
    return this.blocks.filter((b) => this.courseKey(b.courseName) === key);
  }

  form = this.fb.group({
    courseName: ['', [Validators.required]],
    dayOfWeek: [1, [Validators.required]],
    startTime: ['08:00', [Validators.required]],
    endTime: ['10:00', [Validators.required]],
    startDate: [''],
    endDate: [''],
    referenceModality: ['PRESENCIAL', [Validators.required]],
    referenceClassroom: ['Sin aula'],
    joinUrl: [''],
    startUrl: [''],
    applyToWholeCourse: [false],
    applyTeacherToWholeCourse: [false],
  });

  get isWelcomeScope() {
    return this.scopeKey(this.scopeFacultyGroup) === 'GENERAL';
  }

  get hasScopeFilters() {
    return (
      Boolean(String(this.scopeFacultyGroup ?? '').trim()) &&
      Boolean(String(this.scopeCampusName ?? '').trim()) &&
      Boolean(String(this.effectiveScopeCourseName).trim())
    );
  }

  get canApplyWholeCourse() {
    return this.isWelcomeScope && this.isMotherSection && this.hasScopeFilters;
  }

  get canUseZoomPrefill() {
    return this.auth.user?.role === Role.ADMIN;
  }

  get showMotherOnlyInfo() {
    return this.isWelcomeScope && this.hasScopeFilters && !this.isMotherSection;
  }

  private get effectiveScopeCourseName() {
    return String(this.scopeCourseName ?? '').trim() || String(this.selectedCourseName ?? '').trim();
  }

  async ngOnInit() {
    this.routeSub = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(
      ([params, queryParams]) => {
        this.sectionId = String(params.get('id') ?? '');
        this.contextCourseName =
          String(queryParams.get('courseName') ?? '').trim() || this.readStoredCourseName();
        this.scopeFacultyGroup = String(queryParams.get('facultyGroup') ?? '').trim();
        this.scopeCampusName = String(queryParams.get('campusName') ?? '').trim();
        this.scopeCourseName = String(queryParams.get('courseName') ?? '').trim();
        void this.load();
      }
    );
    this.periodSub = this.adminPeriodContext.changes$
      .pipe(skip(1))
      .subscribe(() => {
        void this.handlePeriodChanged();
      });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    this.periodSub?.unsubscribe();
  }

  private async handlePeriodChanged() {
    this.error = null;
    this.success = null;
    this.cancelEdit(false);
    await this.load();
    this.workflowState.notifyWorkflowChanged({ reason: 'period-change' });
    this.cdr.detectChanges();
  }

  dayLabel(dow: number) {
    return this.days.find((d) => d.dayOfWeek === dow)?.label ?? String(dow);
  }

  trackBlock(_: number, item: AdminScheduleBlock) {
    return item.id;
  }

  formatDateRange(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate) return `${startDate} a ${endDate}`;
    if (startDate) return `Desde ${startDate}`;
    if (endDate) return `Hasta ${endDate}`;
    return 'Sin rango';
  }

  canStartMeeting(block: AdminScheduleBlock) {
    return Boolean(
      String(block.startUrl ?? '').trim() || String(block.zoomMeetingRecordId ?? '').trim()
    );
  }

  canCopyInvitation(block: AdminScheduleBlock) {
    return Boolean(
      String(block.joinUrl ?? '').trim() || String(block.zoomMeetingRecordId ?? '').trim()
    );
  }

  async openMeeting(event: Event, block: AdminScheduleBlock) {
    event.preventDefault();
    if (!this.canStartMeeting(block)) return;
    this.error = null;
    this.success = null;
    this.meetingActionId = block.id;
    this.meetingActionType = 'start';
    const popup = typeof window !== 'undefined'
      ? window.open('about:blank', '_blank')
      : null;
    try {
      const links = await this.refreshMeetingLinks(block.id);
      if (!links.startUrl) {
        throw new Error('No se pudo obtener un enlace de inicio actualizado.');
      }
      this.patchBlockMeetingLinks(block.id, links);
      this.success = 'Enlace de inicio actualizado.';
      this.navigatePopupToUrl(popup, links.startUrl);
    } catch (e: any) {
      popup?.close();
      this.error = e?.error?.message ?? 'No se pudo iniciar la reunion con un enlace actualizado.';
    } finally {
      this.meetingActionId = null;
      this.meetingActionType = null;
      this.cdr.detectChanges();
    }
  }

  async copyInvitation(block: AdminScheduleBlock) {
    if (!this.canCopyInvitation(block)) return;
    this.error = null;
    this.success = null;
    this.meetingActionId = block.id;
    this.meetingActionType = 'copy';
    try {
      const links = await this.refreshMeetingLinks(block.id);
      if (!links.joinUrl) {
        throw new Error('No se pudo obtener un enlace de invitacion actualizado.');
      }
      this.patchBlockMeetingLinks(block.id, links);
      await navigator.clipboard.writeText(links.joinUrl);
      this.success = 'Invitacion actualizada y copiada.';
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo copiar una invitacion actualizada.';
    } finally {
      this.meetingActionId = null;
      this.meetingActionType = null;
      this.cdr.detectChanges();
    }
  }

  blockReferenceModalityLabel(block: AdminScheduleBlock) {
    const modality = String(block.referenceModality ?? '').trim().toUpperCase();
    if (!modality) return '-';
    return modality;
  }

  blockReferenceClassroomLabel(block: AdminScheduleBlock) {
    const modality = this.blockReferenceModalityLabel(block);
    if (modality === 'VIRTUAL') return 'Sin aula';
    const classroom = String(block.referenceClassroom ?? '').trim();
    return classroom || 'Sin aula';
  }

  async load() {
    this.error = null;
    this.success = null;
    try {
      const [allCourses, blocks, period] = await Promise.all([
        firstValueFrom(
          this.http.get<string[]>(
            `/api/admin/sections/${encodeURIComponent(this.sectionId)}/courses`
          )
        ),
        firstValueFrom(
          this.http.get<AdminScheduleBlock[]>(
            `/api/admin/schedule-blocks?sectionId=${encodeURIComponent(this.sectionId)}`
          )
        ),
        this.resolvePeriodContext(),
      ]);

      this.period = period;
      this.blocks = blocks;
      const selectedCourseName = this.resolveCourseContext(allCourses);
      this.selectedCourseName = selectedCourseName;
      this.referenceDefaults = await this.loadReferenceDefaults(selectedCourseName);
      await this.refreshMotherSectionContext();
      this.zoomContext = await this.loadZoomContext(selectedCourseName);
      this.form.patchValue({
        courseName: selectedCourseName,
        startDate: this.form.get('startDate')?.value || this.period?.startsAt || '',
        endDate: this.form.get('endDate')?.value || this.period?.endsAt || '',
        referenceModality: this.referenceDefaults.referenceModality,
        referenceClassroom: this.referenceDefaults.referenceClassroom,
        joinUrl: '',
        startUrl: '',
        applyToWholeCourse: false,
        applyTeacherToWholeCourse: false,
      });
      if (selectedCourseName) {
        this.saveStoredCourseName(selectedCourseName);
      }
      if (this.editingBlockId) {
        const current = this.blocks.find((b) => b.id === this.editingBlockId) ?? null;
        if (!current) {
          this.cancelEdit(false);
        }
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar bloques';
    } finally {
      this.cdr.detectChanges();
    }
  }

  private async resolvePeriodContext(): Promise<ActivePeriod | null> {
    const selected = this.adminPeriodContext.getSelectedPeriod();
    if (selected?.id && (selected.startsAt || selected.endsAt)) {
      return {
        id: selected.id,
        code: selected.code,
        name: selected.name,
        startsAt: selected.startsAt ?? null,
        endsAt: selected.endsAt ?? null,
      };
    }
    const rows = await firstValueFrom(
      this.http.get<Array<ActivePeriod & { status?: string }>>('/api/admin/periods')
    );
    const resolved = this.adminPeriodContext.resolveFromPeriodList(rows);
    if (!resolved?.id) return null;
    const row = rows.find((p) => String(p.id ?? '').trim() === resolved.id) ?? null;
    return {
      id: resolved.id,
      code: resolved.code,
      name: resolved.name,
      startsAt: row?.startsAt ?? resolved.startsAt ?? null,
      endsAt: row?.endsAt ?? resolved.endsAt ?? null,
    };
  }

  async saveBlock() {
    if (this.editingBlockId) {
      await this.update(this.editingBlockId);
      return;
    }
    await this.create();
  }

  startEdit(block: AdminScheduleBlock) {
    this.error = null;
    this.success = null;
    this.editingBlockId = block.id;
    this.form.patchValue({
      courseName: block.courseName,
      dayOfWeek: Number(block.dayOfWeek ?? 1),
      startTime: String(block.startTime ?? ''),
      endTime: String(block.endTime ?? ''),
      startDate: String(block.startDate ?? '').trim(),
      endDate: String(block.endDate ?? '').trim(),
      referenceModality:
        String(block.referenceModality ?? '').trim().toUpperCase() || 'PRESENCIAL',
      referenceClassroom:
        String(block.referenceClassroom ?? '').trim() || 'Sin aula',
      joinUrl: String(block.joinUrl ?? '').trim(),
      startUrl: String(block.startUrl ?? '').trim(),
      applyToWholeCourse: false,
      applyTeacherToWholeCourse: false,
    });
    this.cdr.detectChanges();
  }

  cancelEdit(detectChanges = true) {
    this.editingBlockId = null;
    this.form.patchValue({
      courseName: this.selectedCourseName || '',
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '10:00',
      startDate: this.period?.startsAt || '',
      endDate: this.period?.endsAt || '',
      referenceModality: this.referenceDefaults.referenceModality,
      referenceClassroom: this.referenceDefaults.referenceClassroom,
      joinUrl: '',
      startUrl: '',
      applyToWholeCourse: false,
      applyTeacherToWholeCourse: false,
    });
    if (detectChanges) {
      this.cdr.detectChanges();
    }
  }

  async create() {
    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const v = this.form.value;
      await firstValueFrom(
        this.http.post('/api/admin/schedule-blocks', {
          sectionId: this.sectionId,
          courseName: this.selectedCourseName || String(v.courseName ?? '').trim(),
          dayOfWeek: Number(v.dayOfWeek ?? 1),
          startTime: String(v.startTime ?? ''),
          endTime: String(v.endTime ?? ''),
          startDate: String(v.startDate ?? '').trim() || null,
          endDate: String(v.endDate ?? '').trim() || null,
          referenceModality:
            String(v.referenceModality ?? '').trim().toUpperCase() || null,
          referenceClassroom: String(v.referenceClassroom ?? '').trim() || null,
          joinUrl: String(v.joinUrl ?? '').trim() || undefined,
          startUrl: String(v.startUrl ?? '').trim() || undefined,
          zoomMeetingRecordId: null,
          applyToWholeCourse: Boolean(v.applyToWholeCourse),
          applyTeacherToWholeCourse: Boolean(v.applyTeacherToWholeCourse),
          scopeFacultyGroup: this.scopeFacultyGroup || null,
          scopeCampusName: this.scopeCampusName || null,
          scopeCourseName: this.effectiveScopeCourseName || null,
        })
      );
      await this.applyWholeCourseFromMotherIfNeeded();
      this.cancelEdit(false);
      await this.load();
      this.workflowState.notifyWorkflowChanged({ reason: 'schedule-saved' });
    } catch (e: any) {
      this.error = this.formatApiError(
        e?.error,
        e?.error?.message ?? 'No se pudo crear bloque'
      );
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async update(id: string) {
    this.loading = true;
    this.error = null;
    this.success = null;
    try {
      const v = this.form.value;
      await firstValueFrom(
        this.http.put(`/api/admin/schedule-blocks/${id}`, {
          courseName: this.selectedCourseName || String(v.courseName ?? '').trim(),
          dayOfWeek: Number(v.dayOfWeek ?? 1),
          startTime: String(v.startTime ?? ''),
          endTime: String(v.endTime ?? ''),
          startDate: String(v.startDate ?? '').trim() || null,
          endDate: String(v.endDate ?? '').trim() || null,
          referenceModality:
            String(v.referenceModality ?? '').trim().toUpperCase() || null,
          referenceClassroom: String(v.referenceClassroom ?? '').trim() || null,
          joinUrl: String(v.joinUrl ?? '').trim() || undefined,
          startUrl: String(v.startUrl ?? '').trim() || undefined,
          applyToWholeCourse: Boolean(v.applyToWholeCourse),
          applyTeacherToWholeCourse: Boolean(v.applyTeacherToWholeCourse),
          scopeFacultyGroup: this.scopeFacultyGroup || null,
          scopeCampusName: this.scopeCampusName || null,
          scopeCourseName: this.effectiveScopeCourseName || null,
        })
      );
      await this.applyWholeCourseFromMotherIfNeeded();
      this.cancelEdit(false);
      await this.load();
      this.workflowState.notifyWorkflowChanged({ reason: 'schedule-saved' });
    } catch (e: any) {
      this.error = this.formatApiError(
        e?.error,
        e?.error?.message ?? 'No se pudo actualizar bloque'
      );
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async remove(id: string) {
    this.error = null;
    this.success = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/schedule-blocks/${id}`));
      await this.load();
      this.workflowState.notifyWorkflowChanged({ reason: 'schedule-saved' });
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar bloque';
    } finally {
      this.cdr.detectChanges();
    }
  }

  zoomPrefillReason(block: AdminScheduleBlock, mode: ZoomActionMode) {
    if (!this.canUseZoomPrefill) return 'Disponible solo para administradores.';
    if (!this.zoomContext) {
      return this.zoomContextError || 'No se pudo cargar el contexto de Zoom para este curso.';
    }
    if (!String(this.zoomContext.teacherDni ?? '').trim()) {
      return 'Falta el DNI del docente para este curso.';
    }
    if (mode === 'RECURRING' && !String(block.endDate ?? '').trim()) {
      return 'La reunion recurrente requiere fecha fin en el horario.';
    }
    if (!this.getNextValidClassDate(block)) {
      return 'No hay una proxima clase valida dentro de la vigencia del horario.';
    }
    return null;
  }

  async openZoomPrefill(block: AdminScheduleBlock, mode: ZoomActionMode) {
    const reason = this.zoomPrefillReason(block, mode);
    if (reason) {
      this.error = reason;
      this.success = null;
      this.cdr.detectChanges();
      return;
    }

    const draft = this.buildZoomPrefillDraft(block, mode);
    if (!draft) {
      this.error = 'No se pudo construir la precarga para Zoom.';
      this.success = null;
      this.cdr.detectChanges();
      return;
    }

    await this.router.navigate(['/admin/zoom/meetings'], {
      state: { zoomMeetingPrefill: draft },
    });
  }

  private async loadZoomContext(courseName: string): Promise<SectionZoomContext | null> {
    this.zoomContext = null;
    this.zoomContextError = null;
    const normalizedCourseName = String(courseName ?? '').trim();
    if (!this.canUseZoomPrefill || !this.sectionId || !normalizedCourseName) {
      return null;
    }
    try {
      return await firstValueFrom(
        this.http.get<SectionZoomContext>(
          `/api/admin/sections/${encodeURIComponent(
            this.sectionId
          )}/zoom-context?courseName=${encodeURIComponent(normalizedCourseName)}`
        )
      );
    } catch (e: any) {
      this.zoomContextError =
        e?.error?.message ?? 'No se pudo cargar el contexto de Zoom para este curso.';
      return null;
    }
  }

  private buildZoomPrefillDraft(
    block: AdminScheduleBlock,
    mode: ZoomActionMode
  ): ZoomMeetingPrefillDraft | null {
    const ctx = this.zoomContext;
    if (!ctx) return null;
    const teacherDni = String(ctx.teacherDni ?? '').trim();
    const meetingDate = this.getNextValidClassDate(block);
    if (!teacherDni || !meetingDate) return null;

    const draft: ZoomMeetingPrefillDraft = {
      mode,
      topic: [
        String(block.courseName ?? '').trim(),
        teacherDni,
        String(ctx.sectionCode ?? '').trim(),
        String(block.startTime ?? '').trim(),
        String(block.endTime ?? '').trim(),
      ].join(' | '),
      agenda: 'Clase nivelacion',
      meetingDate,
      startTime: String(block.startTime ?? '').trim(),
      endTime: String(block.endTime ?? '').trim(),
      sourceBlockId: String(block.id ?? '').trim() || undefined,
      sourceSectionId: this.sectionId || undefined,
      sourceCourseName: String(block.courseName ?? '').trim() || undefined,
    };

    if (mode === 'RECURRING') {
      const recurrenceEndDate = String(block.endDate ?? '').trim();
      if (!recurrenceEndDate) return null;
      draft.weeklyDays = [this.zoomWeekdayFromBlockDay(Number(block.dayOfWeek ?? 0))];
      draft.repeatInterval = 1;
      draft.recurrenceEndMode = 'UNTIL_DATE';
      draft.recurrenceEndDate = recurrenceEndDate;
    }

    return draft;
  }

  private getNextValidClassDate(block: AdminScheduleBlock) {
    const targetDay = Number(block.dayOfWeek ?? 0);
    if (!Number.isInteger(targetDay) || targetDay < 1 || targetDay > 7) return null;

    const today = this.startOfLocalDay(new Date());
    const startBoundary = this.parseIsoDateOnly(block.startDate);
    const endBoundary = this.parseIsoDateOnly(block.endDate);
    const baseDate =
      startBoundary && startBoundary.getTime() > today.getTime() ? startBoundary : today;

    let candidate = this.firstOccurrenceOnOrAfter(baseDate, targetDay);
    if (
      this.isSameLocalDate(candidate, today) &&
      this.timeHasAlreadyPassed(String(block.startTime ?? '').trim())
    ) {
      candidate = this.addDays(candidate, 7);
    }

    if (startBoundary && candidate.getTime() < startBoundary.getTime()) {
      candidate = this.firstOccurrenceOnOrAfter(startBoundary, targetDay);
    }
    if (endBoundary && candidate.getTime() > endBoundary.getTime()) {
      return null;
    }
    return this.formatIsoDateOnly(candidate);
  }

  private zoomWeekdayFromBlockDay(dayOfWeek: number) {
    if (dayOfWeek === 7) return 1;
    if (dayOfWeek >= 1 && dayOfWeek <= 6) return dayOfWeek + 1;
    return 1;
  }

  private firstOccurrenceOnOrAfter(baseDate: Date, targetDayOfWeek: number) {
    const baseAppDay = this.appDayOfWeek(baseDate);
    const delta = (targetDayOfWeek - baseAppDay + 7) % 7;
    return this.addDays(baseDate, delta);
  }

  private timeHasAlreadyPassed(hhmm: string) {
    const targetMinutes = minutesFromHHmm(hhmm);
    if (!Number.isFinite(targetMinutes)) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes >= targetMinutes;
  }

  private appDayOfWeek(value: Date) {
    const day = value.getDay();
    return day === 0 ? 7 : day;
  }

  private parseIsoDateOnly(value?: string | null) {
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  private formatIsoDateOnly(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private startOfLocalDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private addDays(value: Date, days: number) {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return this.startOfLocalDay(next);
  }

  private isSameLocalDate(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private async refreshMotherSectionContext() {
    this.isMotherSection = false;
    if (!this.hasScopeFilters) return;
    try {
      const params = new HttpParams()
        .set('facultyGroup', this.scopeFacultyGroup)
        .set('campusName', this.scopeCampusName)
        .set('courseName', this.effectiveScopeCourseName);
      const rows = await firstValueFrom(
        this.http.get<AdminSection[]>('/api/admin/sections', { params })
      );
      const mother = rows.find((row) => Boolean(row.isMotherSection)) ?? null;
      this.isMotherSection = Boolean(mother && String(mother.id ?? '').trim() === this.sectionId);
    } catch {
      this.isMotherSection = false;
    }
  }

  private async refreshMeetingLinks(blockId: string) {
    return firstValueFrom(
      this.http.post<{ joinUrl: string | null; startUrl: string | null }>(
        `/api/admin/schedule-blocks/${encodeURIComponent(blockId)}/refresh-meeting-links`,
        {}
      )
    );
  }

  private patchBlockMeetingLinks(
    blockId: string,
    links: { joinUrl: string | null; startUrl: string | null }
  ) {
    this.blocks = this.blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            joinUrl: links.joinUrl,
            startUrl: links.startUrl,
          }
        : block
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

  private async applyWholeCourseFromMotherIfNeeded() {
    const shouldApply = Boolean(this.form.value.applyToWholeCourse);
    const shouldApplyTeacher = Boolean(this.form.value.applyTeacherToWholeCourse);
    if (!shouldApply) return;
    if (!this.canApplyWholeCourse) {
      throw new BadRequestLikeError(
        'La sincronizacion masiva solo se permite desde la seccion madre de Bienvenida.'
      );
    }

    const scheduleResult = await firstValueFrom(
      this.http.post<BulkApplyFromMotherResponse>(
        '/api/admin/sections/course-schedule/bulk-apply-from-mother',
        {
          facultyGroup: this.scopeFacultyGroup,
          campusName: this.scopeCampusName,
          courseName: this.effectiveScopeCourseName,
        }
      )
    );

    let teacherResult: BulkApplyFromMotherResponse | null = null;
    if (shouldApplyTeacher) {
      teacherResult = await firstValueFrom(
        this.http.post<BulkApplyFromMotherResponse>(
          '/api/admin/sections/course-teacher/bulk-apply-from-mother',
          {
            facultyGroup: this.scopeFacultyGroup,
            campusName: this.scopeCampusName,
            courseName: this.effectiveScopeCourseName,
          }
        )
      );
    }

    const scheduleUpdated = Number(scheduleResult.updatedSections ?? 0);
    const scheduleSkipped = Array.isArray(scheduleResult.skipped)
      ? scheduleResult.skipped.length
      : 0;
    const teacherUpdated = Number(teacherResult?.updatedCount ?? 0);
    const teacherSkipped = Array.isArray(teacherResult?.skipped)
      ? teacherResult!.skipped!.length
      : 0;

    const messageParts = [
      `Horario aplicado a ${scheduleUpdated} seccion(es)`,
      scheduleSkipped > 0 ? `omitidas ${scheduleSkipped}` : '',
      shouldApplyTeacher
        ? `docente aplicado a ${teacherUpdated} seccion(es)${
            teacherSkipped > 0 ? `, omitidas ${teacherSkipped}` : ''
          }`
        : '',
    ].filter(Boolean);
    this.success = `${messageParts.join(' | ')}.`;
    if (shouldApplyTeacher) {
      this.workflowState.notifyWorkflowChanged({ reason: 'teacher-saved' });
    }
  }

  private courseKey(value: string) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  private resolveCourseContext(courses: string[]) {
    const candidates = [this.contextCourseName, this.selectedCourseName]
      .map((x) => String(x ?? '').trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const matched = courses.find((c) => this.courseKey(c) === this.courseKey(candidate));
      if (matched) return matched;
    }
    return courses[0] ?? '';
  }

  private readStoredCourseName() {
    if (typeof window === 'undefined') return '';
    return String(window.localStorage.getItem(COURSE_CONTEXT_STORAGE_KEY) ?? '').trim();
  }

  private saveStoredCourseName(courseName: string) {
    if (typeof window === 'undefined') return;
    const value = String(courseName ?? '').trim();
    if (!value) return;
    window.localStorage.setItem(COURSE_CONTEXT_STORAGE_KEY, value);
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

  private async loadReferenceDefaults(
    courseName: string
  ): Promise<CourseReferenceDefaults> {
    const normalizedCourseName = String(courseName ?? '').trim();
    if (!normalizedCourseName || !this.sectionId) {
      return {
        referenceModality: 'PRESENCIAL',
        referenceClassroom: 'Sin aula',
      };
    }
    try {
      const context = await firstValueFrom(
        this.http.get<{
          referenceModality?: string | null;
          referenceClassroom?: string | null;
        }>(
          `/api/admin/sections/${encodeURIComponent(
            this.sectionId
          )}/course-capacity?courseName=${encodeURIComponent(normalizedCourseName)}`
        )
      );
      const referenceModality = String(context?.referenceModality ?? '')
        .trim()
        .toUpperCase();
      return {
        referenceModality:
          referenceModality === 'VIRTUAL' ? 'VIRTUAL' : 'PRESENCIAL',
        referenceClassroom:
          String(context?.referenceClassroom ?? '').trim() || 'Sin aula',
      };
    } catch {
      return {
        referenceModality: 'PRESENCIAL',
        referenceClassroom: 'Sin aula',
      };
    }
  }

  private scopeKey(value: string | null | undefined) {
    return String(value ?? '')
      .trim()
      .toUpperCase();
  }
}

class BadRequestLikeError extends Error {}
