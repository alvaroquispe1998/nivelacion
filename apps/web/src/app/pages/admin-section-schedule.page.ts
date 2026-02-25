import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { AdminScheduleBlock } from '@uai/shared';
import { combineLatest, firstValueFrom } from 'rxjs';
import type { Subscription } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import { DAYS } from '../shared/days';
import { WorkflowStateService } from '../core/workflow/workflow-state.service';

interface ActivePeriod {
  id: string;
  code: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
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

    <div class="mt-5 grid gap-4 xl:grid-cols-3">
      <div class="xl:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-4 py-3">Curso</th>
              <th class="px-4 py-3">Dia</th>
              <th class="px-4 py-3">Hora</th>
              <th class="px-4 py-3">Vigencia</th>
              <th class="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of visibleBlocks; trackBy: trackBlock" class="border-t border-slate-100">
              <td class="px-4 py-3 font-medium">{{ b.courseName }}</td>
              <td class="px-4 py-3">{{ dayLabel(b.dayOfWeek) }}</td>
              <td class="px-4 py-3 text-slate-700">{{ b.startTime }}-{{ b.endTime }}</td>
              <td class="px-4 py-3 text-slate-700">
                {{ formatDateRange(b.startDate, b.endDate) }}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <button
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    (click)="startEdit(b)"
                  >
                    Editar
                  </button>
                  <button
                    class="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                    (click)="remove(b.id)"
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="visibleBlocks.length===0" class="border-t border-slate-100">
              <td class="px-4 py-6 text-slate-600" colspan="5">Sin bloques</td>
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
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly adminPeriodContext = inject(AdminPeriodContextService);
  private readonly workflowState = inject(WorkflowStateService);

  readonly days = DAYS;
  sectionId = '';
  private routeSub?: Subscription;

  blocks: AdminScheduleBlock[] = [];
  error: string | null = null;
  loading = false;
  selectedCourseName = '';
  contextCourseName = '';
  editingBlockId: string | null = null;
  period: ActivePeriod | null = null;

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
  });

  async ngOnInit() {
    this.routeSub = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(
      ([params, queryParams]) => {
        this.sectionId = String(params.get('id') ?? '');
        this.contextCourseName =
          String(queryParams.get('courseName') ?? '').trim() || this.readStoredCourseName();
        void this.load();
      }
    );
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
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

  async load() {
    this.error = null;
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
      this.form.patchValue({
        courseName: selectedCourseName,
        startDate: this.form.get('startDate')?.value || this.period?.startsAt || '',
        endDate: this.form.get('endDate')?.value || this.period?.endsAt || '',
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
    this.editingBlockId = block.id;
    this.form.patchValue({
      courseName: block.courseName,
      dayOfWeek: Number(block.dayOfWeek ?? 1),
      startTime: String(block.startTime ?? ''),
      endTime: String(block.endTime ?? ''),
      startDate: String(block.startDate ?? '').trim(),
      endDate: String(block.endDate ?? '').trim(),
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
    });
    if (detectChanges) {
      this.cdr.detectChanges();
    }
  }

  async create() {
    this.loading = true;
    this.error = null;
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
        })
      );
      this.cancelEdit(false);
      await this.load();
      this.workflowState.notifyWorkflowChanged();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear bloque';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async update(id: string) {
    this.loading = true;
    this.error = null;
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
        })
      );
      this.cancelEdit(false);
      await this.load();
      this.workflowState.notifyWorkflowChanged();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar bloque';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async remove(id: string) {
    this.error = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/schedule-blocks/${id}`));
      await this.load();
      this.workflowState.notifyWorkflowChanged();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar bloque';
    } finally {
      this.cdr.detectChanges();
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
}
