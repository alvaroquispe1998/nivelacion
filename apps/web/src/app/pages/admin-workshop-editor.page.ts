import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AdminTeacher } from '@uai/shared';
import {
  Subject,
  Subscription,
  catchError,
  from,
  of,
  skip,
  switchMap,
  takeUntil,
} from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';
import {
  AdminWorkshopsService,
  FilterLevel,
  FilterSnapshot,
  WorkshopOptionsResponse,
  WorkshopRow,
  WorkshopSavePayload,
  WorkshopStudentRow,
} from './admin-workshops.service';

interface FormState {
  name: string;
  mode: 'BY_SIZE' | 'SINGLE';
  groupSize: number | null;
  selectionMode: 'MANUAL';
  facultyGroups: string[];
  campusNames: string[];
  careerNames: string[];
  facultyGroup: string;
  campusName: string;
  careerName: string;
  deliveryMode: 'VIRTUAL' | 'PRESENCIAL';
  venueCampusName: string;
  responsibleTeacherId: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="text-xl font-semibold">{{ workshopId ? 'Editar cabecera de taller' : 'Nuevo taller' }}</div>
        <div class="text-sm text-slate-600">
          Paso 1 de 3: define cabecera, selecciona alumnos y genera la base inicial de grupos.
        </div>
      </div>
      <div class="flex gap-2">
        <a
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          routerLink="/admin/workshops"
        >
          Volver a lista
        </a>
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="reload()"
        >
          Refrescar
        </button>
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white">1. Cabecera</span>
        
        <a *ngIf="workshopId" [routerLink]="['/admin/workshops', workshopId, 'groups']" class="rounded-full bg-slate-100 px-3 py-1 text-slate-800 font-medium hover:bg-slate-200 cursor-pointer transition-colors">2. Grupos</a>
        <span *ngIf="!workshopId" class="rounded-full bg-slate-50 px-3 py-1 text-slate-400">2. Grupos</span>
        
        <a *ngIf="workshopId" [routerLink]="['/admin/workshops', workshopId, 'preview']" class="rounded-full bg-slate-100 px-3 py-1 text-slate-800 font-medium hover:bg-slate-200 cursor-pointer transition-colors">3. Preview y aplicación</a>
        <span *ngIf="!workshopId" class="rounded-full bg-slate-50 px-3 py-1 text-slate-400">3. Preview y aplicación</span>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {{ success }}
    </div>

    <div *ngIf="loading" class="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Cargando cabecera del taller...
    </div>

    <div *ngIf="!loading" class="mt-4 space-y-4">
      <div
        *ngIf="existingGroupsCount > 0 && requiresRegeneration"
        class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800"
      >
        <strong>¡Atención!</strong> Has realizado cambios en la base del taller. Al guardar esta cabecera, se regenerarán los grupos base (actualmente {{ existingGroupsCount }}) y se restablecerán sus horarios.
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div class="grid gap-3 md:grid-cols-2">
          <label class="text-xs font-semibold text-slate-700">
            Nombre del taller
            <input
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              [(ngModel)]="form.name"
              placeholder="Ej: Taller de inducción"
            />
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Modo de agrupación
            <select class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" [(ngModel)]="form.mode">
              <option value="BY_SIZE">Por tamaño de grupo</option>
              <option value="SINGLE">Grupo único</option>
            </select>
          </label>
          <label *ngIf="form.mode === 'BY_SIZE'" class="text-xs font-semibold text-slate-700">
            Tamaño de grupo
            <input
              type="number"
              min="1"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              [(ngModel)]="form.groupSize"
            />
          </label>
          <label class="text-xs font-semibold text-slate-700">
            Modalidad de taller
            <select class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" [(ngModel)]="form.deliveryMode">
              <option value="VIRTUAL">Virtual</option>
              <option value="PRESENCIAL">Presencial</option>
            </select>
          </label>
          <label *ngIf="form.deliveryMode === 'PRESENCIAL'" class="text-xs font-semibold text-slate-700">
            Sede del taller
            <input
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              [(ngModel)]="form.venueCampusName"
              placeholder="Ej: ICA"
            />
          </label>
          <label class="text-xs font-semibold text-slate-700 md:col-span-2">
            Responsable del taller
            <select
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              [(ngModel)]="form.responsibleTeacherId"
            >
              <option value="">Sin asignar</option>
              <option *ngFor="let teacher of teachers; trackBy: trackTeacher" [value]="teacher.id">
                {{ teacher.fullName }} | {{ teacher.dni }}
              </option>
            </select>
            <div class="mt-1 text-[11px] font-normal text-slate-500">
              Este responsable se usara mas adelante para la asistencia del taller.
            </div>
            <div *ngIf="teachers.length === 0" class="mt-1 text-[11px] font-normal text-amber-700">
              No hay docentes registrados para asignar como responsable.
            </div>
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Alumnos seleccionados</div>
            <div class="text-lg font-semibold">{{ selectedStudentIds.size }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Grupos base estimados</div>
            <div class="text-lg font-semibold">{{ estimatedGroupsCount() }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-xs text-slate-500">Siguiente paso</div>
            <div class="text-sm font-semibold">Edición de grupos</div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-semibold">Alumnos del taller</div>
            <div class="text-xs text-slate-500">
              Mostrando {{ students.length }} alumno(s) | Selección manual {{ selectedStudentIds.size }}
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            (click)="clearManualStudentSelection()"
            [disabled]="selectedStudentIds.size === 0"
          >
            Limpiar selección manual
          </button>
        </div>

        <div class="grid gap-2 text-xs md:grid-cols-3">
          <div class="rounded border border-slate-200 p-2 space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-semibold">Facultad</span>
              <div class="flex gap-1">
                <button class="rounded border border-slate-200 px-2 py-0.5" type="button" (click)="selectAll('faculty')">Todas</button>
                <button class="rounded border border-slate-200 px-2 py-0.5" type="button" (click)="clearSelection('faculty')">Limpiar</button>
              </div>
            </div>
            <div class="max-h-28 overflow-auto space-y-1">
              <label *ngFor="let fac of options.faculties" class="flex items-center gap-2">
                <input type="checkbox" [checked]="filter.facultyGroups.includes(fac)" (change)="toggleFilterValue('faculty', fac, $event)" />
                <span>{{ fac }}</span>
              </label>
              <div *ngIf="options.faculties.length === 0" class="text-[11px] text-slate-500">Sin facultades.</div>
            </div>
          </div>

          <div *ngIf="filter.facultyGroups.length > 0" class="rounded border border-slate-200 p-2 space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-semibold">Sede</span>
              <div class="flex gap-1">
                <button class="rounded border border-slate-200 px-2 py-0.5" type="button" (click)="selectAll('campus')">Todas</button>
                <button class="rounded border border-slate-200 px-2 py-0.5" type="button" (click)="clearSelection('campus')">Limpiar</button>
              </div>
            </div>
            <div class="max-h-28 overflow-auto space-y-1">
              <label *ngFor="let campus of options.campuses" class="flex items-center gap-2">
                <input type="checkbox" [checked]="filter.campusNames.includes(campus)" (change)="toggleFilterValue('campus', campus, $event)" />
                <span>{{ campus }}</span>
              </label>
              <div *ngIf="options.campuses.length === 0" class="text-[11px] text-slate-500">Sin sedes para esta selección.</div>
            </div>
          </div>

          <div *ngIf="filter.campusNames.length > 0" class="rounded border border-slate-200 p-2 space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-semibold">Carrera</span>
              <div class="flex gap-1">
                <button class="rounded border border-slate-200 px-2 py-0.5" type="button" (click)="selectAll('career')">Todas</button>
                <button class="rounded border border-slate-200 px-2 py-0.5" type="button" (click)="clearSelection('career')">Limpiar</button>
              </div>
            </div>
            <div class="max-h-28 overflow-auto space-y-1">
              <label *ngFor="let career of options.careers" class="flex items-center gap-2">
                <input type="checkbox" [checked]="filter.careerNames.includes(career)" (change)="toggleFilterValue('career', career, $event)" />
                <span>{{ career }}</span>
              </label>
              <div *ngIf="options.careers.length === 0" class="text-[11px] text-slate-500">Sin carreras para esta selección.</div>
            </div>
          </div>
        </div>

        <div class="text-[11px] text-slate-500">Selecciona manualmente los alumnos que entrarán en la base del taller.</div>

        <div class="max-h-72 overflow-auto rounded-lg border border-slate-100">
          <table class="min-w-full text-xs">
            <thead class="sticky top-0 bg-slate-50 text-left text-slate-600">
              <tr>
                <th class="px-2 py-1 w-10">
                  <input type="checkbox" [checked]="allVisibleChecked()" (change)="toggleAllVisible($event)" />
                </th>
                <th class="px-2 py-1">Alumno</th>
                <th class="px-2 py-1">DNI</th>
                <th class="px-2 py-1">Código</th>
                <th class="px-2 py-1">Carrera</th>
                <th class="px-2 py-1">Sede</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let student of students" class="border-t border-slate-100">
                <td class="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    [checked]="selectedStudentIds.has(student.studentId)"
                    (change)="toggleStudent(student.studentId, $event)"
                  />
                </td>
                <td class="px-2 py-1">{{ student.fullName }}</td>
                <td class="px-2 py-1">{{ student.dni || 'SIN DNI' }}</td>
                <td class="px-2 py-1">{{ student.codigoAlumno || 'SIN CODIGO' }}</td>
                <td class="px-2 py-1">{{ student.careerName || '-' }}</td>
                <td class="px-2 py-1">{{ student.campusName || '-' }}</td>
              </tr>
              <tr *ngIf="students.length === 0">
                <td colspan="6" class="px-2 py-4 text-center text-slate-500">Sin alumnos para los filtros actuales.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <a
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          routerLink="/admin/workshops"
        >
          Cancelar
        </a>
        <button
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          [disabled]="saving"
          (click)="saveHeader()"
        >
          {{ saving ? 'Guardando...' : 'Guardar y continuar a grupos' }}
        </button>
      </div>

      <div
        *ngIf="showRegenerationConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
        (click)="closeRegenerationConfirm()"
      >
        <div
          class="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          (click)="$event.stopPropagation()"
        >
          <div class="text-lg font-semibold text-slate-900">Confirmar guardado de cabecera</div>
          <div class="mt-2 text-sm text-slate-600">
            Cambiaste la configuración base del taller. Si continúas, se reconstruirá la base actual.
          </div>

          <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div class="font-semibold">Se regenerarán los grupos y sus horarios.</div>
            <div class="mt-1">
              Los grupos preexistentes (actualmente {{ existingGroupsCount }}) perderán su configuración actual.
            </div>
          </div>

          <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            Usa esta opción solo si realmente quieres guardar la nueva selección de alumnos o modalidad y volver a generar la estructura del taller.
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              (click)="closeRegenerationConfirm()"
              [disabled]="saving"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              (click)="confirmSaveHeader()"
              [disabled]="saving"
            >
              {{ saving ? 'Guardando...' : 'Sí, guardar y regenerar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminWorkshopEditorPage implements OnInit, OnDestroy {
  private readonly workshopsService = inject(AdminWorkshopsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly adminPeriod = inject(AdminPeriodContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly filterReload$ = new Subject<FilterSnapshot>();
  private routeSub?: Subscription;
  private periodSub?: Subscription;
  private originalRegenerationFingerprint = '';
  private destroyed = false;

  workshopId: string | null = null;
  existingGroupsCount = 0;
  loading = false;
  saving = false;
  error: string | null = null;
  success: string | null = null;
  students: WorkshopStudentRow[] = [];
  teachers: AdminTeacher[] = [];
  selectedStudentIds = new Set<string>();
  options: WorkshopOptionsResponse = { faculties: [], campuses: [], careers: [] };
  filter: FilterSnapshot = { facultyGroups: [], campusNames: [], careerNames: [] };
  showRegenerationConfirm = false;

  form: FormState = this.createFormState(this.workshopsService.createEmptyWorkshop());

  ngOnInit() {
    this.setupFilterPipeline();
    this.routeSub = this.route.paramMap.subscribe(() => {
      void this.loadFromRoute();
    });
    this.periodSub = this.adminPeriod.changes$.pipe(skip(1)).subscribe(() => {
      void this.loadFromRoute();
    });
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.routeSub?.unsubscribe();
    this.periodSub?.unsubscribe();
  }

  get requiresRegeneration() {
    if (!this.workshopId || this.existingGroupsCount === 0) return true;
    return this.buildRegenerationFingerprint() !== this.originalRegenerationFingerprint;
  }

  async reload() {
    await this.loadFromRoute();
  }

  async saveHeader() {
    this.error = null;
    this.success = null;
    const payload = this.buildPayload();
    const validationError = this.validatePayload(payload);
    if (validationError) {
      this.error = validationError;
      this.safeDetectChanges();
      return;
    }
    if (this.existingGroupsCount > 0 && this.requiresRegeneration) {
      this.showRegenerationConfirm = true;
      this.safeDetectChanges();
      return;
    }
    await this.persistHeader(payload);
  }

  closeRegenerationConfirm() {
    if (this.saving) return;
    this.showRegenerationConfirm = false;
    this.safeDetectChanges();
  }

  async confirmSaveHeader() {
    const payload = this.buildPayload();
    const validationError = this.validatePayload(payload);
    if (validationError) {
      this.error = validationError;
      this.showRegenerationConfirm = false;
      this.safeDetectChanges();
      return;
    }
    await this.persistHeader(payload);
  }

  private async persistHeader(payload: WorkshopSavePayload) {
    this.saving = true;
    this.showRegenerationConfirm = false;
    this.safeDetectChanges();
    try {
      const saved = await this.workshopsService.saveWorkshop(this.workshopId, payload);
      const shouldRegenerate = !this.workshopId || this.existingGroupsCount === 0 || this.requiresRegeneration;
      if (shouldRegenerate) {
        await this.workshopsService.regenerateGroups(saved.id);
      }
      await this.router.navigate(['/admin/workshops', saved.id, 'groups'], {
        queryParams: {
          success: shouldRegenerate
            ? 'Cabecera guardada y grupos base regenerados.'
            : 'Cabecera guardada.',
        },
      });
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar la cabecera del taller';
    } finally {
      this.saving = false;
      this.safeDetectChanges();
    }
  }

  private validatePayload(payload: WorkshopSavePayload) {
    if (!payload.name) {
      return 'El nombre del taller es requerido.';
    }
    if (payload.mode === 'BY_SIZE' && (!payload.groupSize || payload.groupSize <= 0)) {
      return 'El tamaño de grupo debe ser mayor a 0.';
    }
    if (payload.studentIds.length === 0) {
      return 'Debes seleccionar al menos un alumno.';
    }
    if (payload.deliveryMode === 'PRESENCIAL' && !payload.venueCampusName) {
      return 'Debes indicar la sede del taller presencial.';
    }
    return null;
  }

  toggleStudent(id: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selectedStudentIds.add(id);
    else this.selectedStudentIds.delete(id);
  }

  toggleAllVisible(ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const student of this.students) {
      if (checked) this.selectedStudentIds.add(student.studentId);
      else this.selectedStudentIds.delete(student.studentId);
    }
  }

  clearManualStudentSelection() {
    this.selectedStudentIds = new Set<string>();
    this.safeDetectChanges();
  }

  allVisibleChecked() {
    if (this.students.length === 0) return false;
    return this.students.every((student) => this.selectedStudentIds.has(student.studentId));
  }

  trackTeacher(_: number, item: AdminTeacher) {
    return item.id;
  }

  toggleFilterValue(level: FilterLevel, value: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    const list =
      level === 'faculty'
        ? this.filter.facultyGroups
        : level === 'campus'
          ? this.filter.campusNames
          : this.filter.careerNames;
    if (checked && !list.includes(value)) list.push(value);
    if (!checked) {
      const idx = list.indexOf(value);
      if (idx >= 0) list.splice(idx, 1);
    }
    if (level === 'faculty') {
      this.filter.campusNames = [];
      this.filter.careerNames = [];
    } else if (level === 'campus') {
      this.filter.careerNames = [];
    }
    this.selectedStudentIds = new Set<string>();
    this.syncFormSinglesFromFilters();
    this.queueFilterReload();
  }

  selectAll(level: FilterLevel) {
    if (level === 'faculty') {
      this.filter.facultyGroups = [...this.options.faculties];
      this.filter.campusNames = [];
      this.filter.careerNames = [];
    } else if (level === 'campus') {
      this.filter.campusNames = [...this.options.campuses];
      this.filter.careerNames = [];
    } else {
      this.filter.careerNames = [...this.options.careers];
    }
    this.selectedStudentIds = new Set<string>();
    this.syncFormSinglesFromFilters();
    this.queueFilterReload();
  }

  clearSelection(level: FilterLevel) {
    if (level === 'faculty') {
      this.filter.facultyGroups = [];
      this.filter.campusNames = [];
      this.filter.careerNames = [];
    } else if (level === 'campus') {
      this.filter.campusNames = [];
      this.filter.careerNames = [];
    } else {
      this.filter.careerNames = [];
    }
    this.selectedStudentIds = new Set<string>();
    this.syncFormSinglesFromFilters();
    this.queueFilterReload();
  }

  estimatedGroupsCount() {
    const total = this.selectedStudentIds.size;
    if (total === 0) return 0;
    if (this.form.mode === 'SINGLE') return 1;
    const size = Math.max(1, Number(this.form.groupSize ?? 0));
    return Math.ceil(total / size);
  }

  private async loadFromRoute() {
    this.loading = true;
    this.error = null;
    this.success = null;
    this.showRegenerationConfirm = false;
    this.options = { faculties: [], campuses: [], careers: [] };
    this.students = [];
    this.teachers = [];
    this.selectedStudentIds = new Set<string>();
    try {
      this.teachers = await this.workshopsService.listTeachers();
      const id = this.route.snapshot.paramMap.get('id');
      this.workshopId = id && id.trim() ? id : null;
      if (!this.workshopId) {
        this.existingGroupsCount = 0;
        const workshop = this.workshopsService.createEmptyWorkshop();
        this.form = this.createFormState(workshop);
        this.filter = this.workshopsService.buildInitialFilter(workshop);
        this.originalRegenerationFingerprint = this.buildRegenerationFingerprint();
        this.queueFilterReload();
        return;
      }

      const [workshop, groups] = await Promise.all([
        this.workshopsService.getWorkshop(this.workshopId),
        this.workshopsService.listGroups(this.workshopId),
      ]);
      this.existingGroupsCount = groups.length;
      this.form = this.createFormState(workshop);
      this.selectedStudentIds = new Set(workshop.studentIds ?? []);
      this.filter = this.workshopsService.buildInitialFilter(workshop);
      this.syncFormSinglesFromFilters();
      this.originalRegenerationFingerprint = this.buildRegenerationFingerprint();
      this.queueFilterReload();
    } catch (e: any) {
      await this.navigateToList(e?.error?.message ?? 'No se pudo cargar el taller');
    } finally {
      this.loading = false;
      this.safeDetectChanges();
    }
  }

  private setupFilterPipeline() {
    this.filterReload$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((snapshot) => this.loadOptionsAndStudents(snapshot))
      )
      .subscribe((result) => {
        this.options = result.options;
        this.filter = result.snapshot;
        this.students = result.students;
        this.syncFormSinglesFromFilters();
        this.safeDetectChanges();
      });
  }

  private loadOptionsAndStudents(snapshot: FilterSnapshot) {
    this.error = null;
    return from(this.workshopsService.listFilters(snapshot)).pipe(
      switchMap((response) => {
        const options = {
          faculties: response?.faculties ?? [],
          campuses: response?.campuses ?? [],
          careers: response?.careers ?? [],
        };
        const clampedSnapshot = this.workshopsService.clampSnapshotToOptions(snapshot, options);
        if (
          clampedSnapshot.facultyGroups.length === 0 ||
          clampedSnapshot.careerNames.length === 0
        ) {
          return of({
            options,
            snapshot: clampedSnapshot,
            students: [] as WorkshopStudentRow[],
          });
        }
        return from(this.workshopsService.listStudents(clampedSnapshot)).pipe(
          switchMap((students) =>
            of({
              options,
              snapshot: clampedSnapshot,
              students: students ?? [],
            })
          )
        );
      }),
      catchError((e: any) => {
        this.error = e?.error?.message ?? 'No se pudo actualizar filtros y alumnos';
        return of({
          options: this.options,
          snapshot,
          students: [] as WorkshopStudentRow[],
        });
      })
    );
  }

  private queueFilterReload() {
    this.filterReload$.next(this.snapshotFilter());
  }

  private snapshotFilter(): FilterSnapshot {
    return {
      facultyGroups: this.workshopsService.normalizeList(this.filter.facultyGroups),
      campusNames: this.workshopsService.normalizeList(this.filter.campusNames),
      careerNames: this.workshopsService.normalizeList(this.filter.careerNames),
    };
  }

  private syncFormSinglesFromFilters() {
    this.form.facultyGroup = this.filter.facultyGroups[0] ?? '';
    this.form.campusName = this.filter.campusNames[0] ?? '';
    this.form.careerName = this.filter.careerNames[0] ?? '';
    this.form.facultyGroups = this.filter.facultyGroups.slice();
    this.form.campusNames = this.filter.campusNames.slice();
    this.form.careerNames = this.filter.careerNames.slice();
  }

  private buildPayload(): WorkshopSavePayload {
    return {
      name: this.form.name.trim(),
      mode: this.form.mode,
      groupSize: this.form.mode === 'BY_SIZE' ? Number(this.form.groupSize ?? 0) : null,
      selectionMode: 'MANUAL',
      facultyGroups: this.form.facultyGroups ?? [],
      campusNames: this.form.campusNames ?? [],
      careerNames: this.form.careerNames ?? [],
      facultyGroup: this.form.facultyGroup.trim() || null,
      campusName: this.form.campusName.trim() || null,
      careerName: this.form.careerName.trim() || null,
      deliveryMode: this.form.deliveryMode,
      venueCampusName: this.form.venueCampusName.trim() || null,
      responsibleTeacherId: this.form.responsibleTeacherId.trim() || null,
      studentIds: Array.from(this.selectedStudentIds),
    };
  }

  private createFormState(workshop: WorkshopRow): FormState {
    return {
      name: workshop.name ?? '',
      mode: workshop.mode ?? 'BY_SIZE',
      groupSize: workshop.groupSize ?? 40,
      selectionMode: 'MANUAL',
      facultyGroups: workshop.facultyGroups?.slice() ?? [],
      campusNames: workshop.campusNames?.slice() ?? [],
      careerNames: workshop.careerNames?.slice() ?? [],
      facultyGroup: workshop.facultyGroup ?? '',
      campusName: workshop.campusName ?? '',
      careerName: workshop.careerName ?? '',
      deliveryMode: workshop.deliveryMode ?? 'VIRTUAL',
      venueCampusName: workshop.venueCampusName ?? '',
      responsibleTeacherId: workshop.responsibleTeacherId ?? '',
    };
  }

  private buildRegenerationFingerprint() {
    return JSON.stringify({
      mode: this.form.mode,
      groupSize: this.form.mode === 'BY_SIZE' ? Number(this.form.groupSize ?? 0) : null,
      studentIds: Array.from(this.selectedStudentIds).sort(),
    });
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
