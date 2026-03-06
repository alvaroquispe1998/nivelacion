import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription, skip } from 'rxjs';
import { AdminPeriodContextService } from '../core/workflow/admin-period-context.service';

type WorkshopMode = 'BY_SIZE' | 'SINGLE';
type SelectionMode = 'ALL' | 'MANUAL';

interface WorkshopRow {
  id: string;
  name: string;
  mode: WorkshopMode;
  groupSize: number | null;
  selectionMode: SelectionMode;
  facultyGroup: string | null;
  campusName: string | null;
  careerName: string | null;
  facultyGroups?: string[] | null;
  campusNames?: string[] | null;
  careerNames?: string[] | null;
  deliveryMode: 'VIRTUAL' | 'PRESENCIAL';
  venueCampusName: string | null;
  studentIds?: string[];
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Talleres</div>
        <div class="text-sm text-slate-600">Configura y aplica talleres para alumnos matriculados.</div>
      </div>
      <div class="flex gap-2">
        <button
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          (click)="loadAll()"
        >
          Refrescar
        </button>
        <button
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
          (click)="startCreate()"
        >
          Crear nuevo taller
        </button>
      </div>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>
    <div *ngIf="success" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {{ success }}
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white">
      <div class="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Talleres creados</div>
      <div *ngIf="workshops.length === 0" class="px-4 py-3 text-sm text-slate-500">No hay talleres creados.</div>
      <div *ngIf="workshops.length > 0" class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-3 py-2">Nombre</th>
              <th class="px-3 py-2">Modo</th>
              <th class="px-3 py-2">Tamaño/Grupo</th>
              <th class="px-3 py-2">Selección</th>
              <th class="px-3 py-2">Entrega</th>
              <th class="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let w of workshops" class="border-t border-slate-100">
              <td class="px-3 py-2 font-semibold">{{ w.name }}</td>
              <td class="px-3 py-2">{{ w.mode === 'BY_SIZE' ? 'Por tamaño' : 'Grupo único' }}</td>
              <td class="px-3 py-2">
                {{ w.mode === 'BY_SIZE' ? (w.groupSize || '-') : '1 grupo' }}
              </td>
              <td class="px-3 py-2">
                {{ w.selectionMode === 'ALL' ? 'Todos (filtros)' : 'Manual' }}
              </td>
              <td class="px-3 py-2">
                {{ w.deliveryMode === 'VIRTUAL' ? 'Virtual' : (w.venueCampusName || 'Presencial') }}
              </td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap gap-1">
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" (click)="editWorkshop(w)">Editar</button>
                  <button class="rounded border border-slate-300 px-2 py-1 text-xs" (click)="previewWorkshop(w)">Previsualizar</button>
                  <button class="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700" (click)="applyWorkshop(w)">
                    Aplicar
                  </button>
                  <button class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700" (click)="deleteWorkshop(w)">
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div *ngIf="editing" class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold text-slate-800">{{ editing.id ? 'Editar taller' : 'Nuevo taller' }}</div>
        <button class="text-xs text-slate-500 underline" (click)="cancelEdit()">Cerrar</button>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="text-xs font-semibold text-slate-700">
          Nombre del taller
          <input
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            [(ngModel)]="form.name"
            placeholder="Ej: Taller de Induccion"
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
          <input type="number" min="1" class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" [(ngModel)]="form.groupSize" />
        </label>
        <label class="text-xs font-semibold text-slate-700">
          Modo de selección
          <select
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            [(ngModel)]="form.selectionMode"
            (ngModelChange)="onSelectionModeChange($event)"
          >
            <option value="ALL">Todos (según filtros)</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label class="text-xs font-semibold text-slate-700">
          Modalidad de taller
          <select class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" [(ngModel)]="form.deliveryMode">
            <option value="VIRTUAL">Virtual</option>
            <option value="PRESENCIAL">Presencial</option>
          </select>
        </label>
        <label *ngIf="form.deliveryMode === 'PRESENCIAL'" class="text-xs font-semibold text-slate-700">
          Sede del taller (venue)
          <input class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" [(ngModel)]="form.venueCampusName" placeholder="Ej: ICA" />
        </label>
      </div>

      <div class="rounded-xl border border-slate-200 p-3 space-y-2">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold">Alumnos</div>
          <div class="text-xs text-slate-500">
            Selección: {{ form.selectionMode === 'ALL' ? 'Todos (filtros)' : selectedStudentIds.size + ' manuales' }}
          </div>
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
          <div class="rounded border border-slate-200 p-2 space-y-1">
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
              <div *ngIf="options.campuses.length === 0" class="text-[11px] text-slate-500">Selecciona facultad.</div>
            </div>
          </div>
          <div class="rounded border border-slate-200 p-2 space-y-1">
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
              <div *ngIf="options.careers.length === 0" class="text-[11px] text-slate-500">Selecciona sede/facultad.</div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="rounded border border-slate-300 px-2 py-1" type="button" (click)="loadStudents()">Filtrar</button>
          <div class="text-[11px] text-slate-500">Se guardan al taller y filtran la lista de alumnos mostrada.</div>
        </div>
        <div class="max-h-64 overflow-auto border border-slate-100 rounded-lg">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left text-slate-600 sticky top-0">
              <tr>
                <th class="px-2 py-1 w-10">
                  <input
                    type="checkbox"
                    [checked]="allVisibleChecked()"
                    (change)="toggleAllVisible($event)"
                    [disabled]="form.selectionMode === 'ALL'"
                  />
                </th>
                <th class="px-2 py-1">Alumno</th>
                <th class="px-2 py-1">Código</th>
                <th class="px-2 py-1">Carrera</th>
                <th class="px-2 py-1">Sede</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of students" class="border-t border-slate-100">
                <td class="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    [checked]="selectedStudentIds.has(s.studentId)"
                    (change)="toggleStudent(s.studentId, $event)"
                    [disabled]="form.selectionMode === 'ALL'"
                  />
                </td>
                <td class="px-2 py-1">{{ s.fullName }}</td>
                <td class="px-2 py-1">{{ s.codigoAlumno || 'SIN CODIGO' }}</td>
                <td class="px-2 py-1">{{ s.careerName || '-' }}</td>
                <td class="px-2 py-1">{{ s.campusName || '-' }}</td>
              </tr>
              <tr *ngIf="students.length === 0">
                <td colspan="5" class="px-2 py-2 text-center text-slate-500">Sin alumnos para los filtros.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" (click)="previewCurrent()">Previsualizar</button>
        <button class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" (click)="saveWorkshop()">
          {{ saving ? 'Guardando...' : 'Guardar taller' }}
        </button>
        <button class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" (click)="applyCurrent()" [disabled]="saving">
          Aplicar taller
        </button>
      </div>

      <div *ngIf="preview" class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
        <div class="font-semibold">Previsualización</div>
        <div class="mt-1 text-slate-600">Alumnos: {{ preview.totalStudents }} | Grupos: {{ preview.groups.length }}</div>
        <div class="mt-2 flex flex-wrap gap-2">
          <span *ngFor="let g of preview.groups" class="rounded bg-white px-3 py-1 border border-slate-200">
            Grupo {{ g.index }}: {{ g.size }}
          </span>
        </div>
      </div>
    </div>
  `,
})
export class AdminWorkshopsPage implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private adminPeriod = inject(AdminPeriodContextService);
  private periodSub?: Subscription;

  workshops: WorkshopRow[] = [];
  students: Array<{ studentId: string; fullName: string; codigoAlumno: string | null; careerName: string | null; campusName: string | null }> = [];
  selectedStudentIds = new Set<string>();
  editing: WorkshopRow | null = null;
  preview: { totalStudents: number; groups: Array<{ index: number; size: number }> } | null = null;
  error: string | null = null;
  success: string | null = null;
  saving = false;

  form: any = {
    name: '',
    mode: 'BY_SIZE' as WorkshopMode,
    groupSize: 40,
    selectionMode: 'ALL' as SelectionMode,
    facultyGroups: [] as string[],
    campusNames: [] as string[],
    careerNames: [] as string[],
    facultyGroup: '',
    campusName: '',
    careerName: '',
    deliveryMode: 'VIRTUAL',
    venueCampusName: '',
  };

  filter: { facultyGroups: string[]; campusNames: string[]; careerNames: string[] } = {
    facultyGroups: [],
    campusNames: [],
    careerNames: [],
  };

  options: { faculties: string[]; campuses: string[]; careers: string[] } = {
    faculties: [],
    campuses: [],
    careers: [],
  };

  async ngOnInit() {
    this.periodSub = this.adminPeriod.changes$.pipe(skip(1)).subscribe(() => {
      void this.loadAll();
    });
    await this.loadAll();
  }

  ngOnDestroy() {
    this.periodSub?.unsubscribe();
  }

  async loadAll() {
    this.error = null;
    this.success = null;
    try {
      this.workshops = await firstValueFrom(this.http.get<WorkshopRow[]>('/api/admin/workshops'));
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar talleres';
    }
  }

  startCreate() {
    this.editing = { id: '', name: '', mode: 'BY_SIZE', groupSize: 40, selectionMode: 'ALL', facultyGroup: null, campusName: null, careerName: null, deliveryMode: 'VIRTUAL', venueCampusName: null };
    this.form = { ...this.editing, groupSize: 40, selectionMode: 'ALL', facultyGroups: [], campusNames: [], careerNames: [], facultyGroup: '', campusName: '', careerName: '', deliveryMode: 'VIRTUAL', venueCampusName: '' };
    this.selectedStudentIds = new Set();
    this.preview = null;
    this.filter = { facultyGroups: [], campusNames: [], careerNames: [] };
    void this.onSelectionModeChange(this.form.selectionMode);
  }

  editWorkshop(row: WorkshopRow) {
    this.editing = row;
    this.form = {
      name: row.name,
      mode: row.mode,
      groupSize: row.groupSize ?? 40,
      selectionMode: row.selectionMode,
      facultyGroups: row.facultyGroups ?? [],
      campusNames: row.campusNames ?? [],
      careerNames: row.careerNames ?? [],
      facultyGroup: row.facultyGroup ?? '',
      campusName: row.campusName ?? '',
      careerName: row.careerName ?? '',
      deliveryMode: row.deliveryMode ?? 'VIRTUAL',
      venueCampusName: row.venueCampusName ?? '',
    };
    this.selectedStudentIds = new Set(row.studentIds ?? []);
    this.filter = {
      facultyGroups: (row.facultyGroups && row.facultyGroups.length > 0) ? row.facultyGroups.slice() : (row.facultyGroup ? [row.facultyGroup] : []),
      campusNames: (row.campusNames && row.campusNames.length > 0) ? row.campusNames.slice() : (row.campusName ? [row.campusName] : []),
      careerNames: (row.careerNames && row.careerNames.length > 0) ? row.careerNames.slice() : (row.careerName ? [row.careerName] : []),
    };
    this.preview = null;
    void this.onSelectionModeChange(this.form.selectionMode);
  }

  cancelEdit() {
    this.editing = null;
    this.preview = null;
    this.selectedStudentIds = new Set();
  }

  private syncFormSinglesFromFilters() {
    this.form.facultyGroup = this.filter.facultyGroups[0] ?? '';
    this.form.campusName = this.filter.campusNames[0] ?? '';
    this.form.careerName = this.filter.careerNames[0] ?? '';
    this.form.facultyGroups = this.filter.facultyGroups.slice();
    this.form.campusNames = this.filter.campusNames.slice();
    this.form.careerNames = this.filter.careerNames.slice();
  }

  private cleanupSelections() {
    const campusesSet = new Set(this.options.campuses);
    const careersSet = new Set(this.options.careers);
    this.filter.campusNames = this.filter.campusNames.filter((c) => campusesSet.has(c));
    this.filter.careerNames = this.filter.careerNames.filter((c) => careersSet.has(c));
    this.syncFormSinglesFromFilters();
  }

  async loadFilterOptionsAndStudents() {
    await this.loadFilterOptions();
    await this.loadStudents();
  }

  async loadFilterOptions() {
    try {
      let params = new HttpParams();
      this.filter.facultyGroups.forEach((v) => (params = params.append('facultyGroup', v)));
      this.filter.campusNames.forEach((v) => (params = params.append('campusName', v)));
      const res = await firstValueFrom(
        this.http.get<{ faculties: string[]; campuses: string[]; careers: string[] }>(
          '/api/admin/workshops/filters',
          { params }
        )
      );
      this.options.faculties = res?.faculties ?? [];
      this.options.campuses = res?.campuses ?? [];
      this.options.careers = res?.careers ?? [];
      this.cleanupSelections();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar filtros';
    }
  }

  async loadStudents() {
    try {
      if (this.form.selectionMode === 'MANUAL') {
        if (this.filter.facultyGroups.length === 0) {
          this.students = [];
          this.selectedStudentIds = new Set();
          return;
        }
        if (this.options.campuses.length > 0 && this.filter.campusNames.length === 0) {
          this.students = [];
          this.selectedStudentIds = new Set();
          return;
        }
        if (this.options.careers.length > 0 && this.filter.careerNames.length === 0) {
          this.students = [];
          this.selectedStudentIds = new Set();
          return;
        }
      }
      let params = new HttpParams();
      this.filter.facultyGroups.forEach((v) => (params = params.append('facultyGroup', v)));
      this.filter.campusNames.forEach((v) => (params = params.append('campusName', v)));
      this.filter.careerNames.forEach((v) => (params = params.append('careerName', v)));
      this.students = await firstValueFrom(
        this.http.get<Array<any>>('/api/admin/workshops/students/list', { params })
      );
      if (this.form.selectionMode === 'ALL') {
        this.selectedStudentIds = new Set(this.students.map((s) => s.studentId));
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar alumnos';
    }
  }

  toggleStudent(id: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    if (checked) this.selectedStudentIds.add(id);
    else this.selectedStudentIds.delete(id);
  }

  toggleAllVisible(ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    for (const s of this.students) {
      if (checked) this.selectedStudentIds.add(s.studentId);
      else this.selectedStudentIds.delete(s.studentId);
    }
  }

  allVisibleChecked() {
    if (this.students.length === 0) return false;
    return this.students.every((s) => this.selectedStudentIds.has(s.studentId));
  }

  async onSelectionModeChange(mode: SelectionMode) {
    this.form.selectionMode = mode;
    if (mode === 'ALL') {
      // Seleccionar todo en cascada y cargar alumnos completos
      await this.loadFilterOptions(); // asegura opciones actualizadas
      this.filter.facultyGroups = [...this.options.faculties];
      this.filter.campusNames = [...this.options.campuses];
      this.filter.careerNames = [...this.options.careers];
      this.syncFormSinglesFromFilters();
      await this.loadStudents();
      this.selectedStudentIds = new Set(this.students.map((s) => s.studentId));
    } else {
      // Manual: limpiar selección de alumnos pero mantener filtros vigentes
      this.selectedStudentIds = new Set();
      // Cascada sigue funcionando con los checks actuales
      await this.loadFilterOptionsAndStudents();
    }
  }

  toggleFilterValue(level: 'faculty' | 'campus' | 'career', value: string, ev: Event) {
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
      // reset dependent selections to avoid stale combos
      this.filter.campusNames = [];
      this.filter.careerNames = [];
    }
    if (level === 'campus') {
      this.filter.careerNames = [];
    }
    this.syncFormSinglesFromFilters();
    void this.loadFilterOptionsAndStudents();
  }

  selectAll(level: 'faculty' | 'campus' | 'career') {
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
    this.syncFormSinglesFromFilters();
    void this.loadFilterOptionsAndStudents();
  }

  clearSelection(level: 'faculty' | 'campus' | 'career') {
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
    this.syncFormSinglesFromFilters();
    void this.loadFilterOptionsAndStudents();
  }

  private buildPayload() {
    const payload: any = {
      name: this.form.name?.trim(),
      mode: this.form.mode,
      groupSize: this.form.mode === 'BY_SIZE' ? Number(this.form.groupSize ?? 0) : null,
      selectionMode: this.form.selectionMode,
      facultyGroups: this.form.facultyGroups ?? [],
      campusNames: this.form.campusNames ?? [],
      careerNames: this.form.careerNames ?? [],
      facultyGroup: this.form.facultyGroup?.trim() || null,
      campusName: this.form.campusName?.trim() || null,
      careerName: this.form.careerName?.trim() || null,
      deliveryMode: this.form.deliveryMode,
      venueCampusName: this.form.venueCampusName?.trim() || null,
    };
    if (payload.selectionMode === 'MANUAL') {
      payload.studentIds = Array.from(this.selectedStudentIds);
    }
    return payload;
  }

  async saveWorkshop() {
    if (!this.editing) return;
    this.saving = true;
    this.error = null;
    this.success = null;
    try {
      const payload = this.buildPayload();
      if (this.editing.id) {
        await firstValueFrom(this.http.put(`/api/admin/workshops/${encodeURIComponent(this.editing.id)}`, payload));
      } else {
        await firstValueFrom(this.http.post('/api/admin/workshops', payload));
      }
      this.success = 'Taller guardado.';
      this.editing = null;
      await this.loadAll();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el taller';
    } finally {
      this.saving = false;
    }
  }

  async previewWorkshop(w: WorkshopRow) {
    this.error = null;
    try {
      const res = await firstValueFrom(this.http.post<{ groups: any[]; totalStudents: number }>(
        `/api/admin/workshops/${encodeURIComponent(w.id)}/preview`,
        {}
      ));
      this.preview = res;
      this.success = `Previsualizado: ${res.totalStudents} alumnos, ${res.groups.length} grupos.`;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo previsualizar';
    }
  }

  async previewCurrent() {
    if (!this.editing) return;
    this.error = null;
    this.preview = null;
    try {
      const payload = this.buildPayload();
      let res: { totalStudents: number; groups: Array<{ index: number; size: number }> };
      if (this.editing.id) {
        res = await firstValueFrom(
          this.http.post<{ totalStudents: number; groups: Array<{ index: number; size: number }> }>(
            `/api/admin/workshops/${encodeURIComponent(this.editing.id)}/preview`,
            payload
          )
        );
      } else {
        // create temp preview using manual split
        const studentCount = payload.selectionMode === 'MANUAL'
          ? (payload.studentIds?.length ?? 0)
          : this.students.length;
        const groups = [];
        if (payload.mode === 'SINGLE') groups.push({ index: 1, size: studentCount });
        else {
          const size = Math.max(1, Number(payload.groupSize ?? 1));
          let rem = studentCount;
          let i = 1;
          while (rem > 0) {
            const take = Math.min(size, rem);
            groups.push({ index: i++, size: take });
            rem -= take;
          }
        }
        res = { totalStudents: studentCount, groups };
      }
      this.preview = res;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo previsualizar';
    }
  }

  async applyWorkshop(w: WorkshopRow) {
    this.error = null;
    this.success = null;
    try {
      const res = await firstValueFrom(
        this.http.post<{ totalStudents: number; groups: Array<{ index: number; size: number }> }>(
          `/api/admin/workshops/${encodeURIComponent(w.id)}/apply`,
          {}
        )
      );
      this.success = `Taller aplicado. Alumnos: ${res?.totalStudents ?? 0}`;
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo aplicar el taller';
    }
  }

  async applyCurrent() {
    if (!this.editing?.id) return;
    await this.applyWorkshop(this.editing);
  }

  async deleteWorkshop(w: WorkshopRow) {
    const ok = window.confirm(`Eliminar taller "${w.name}"?`);
    if (!ok) return;
    this.error = null;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/workshops/${encodeURIComponent(w.id)}`));
      this.workshops = this.workshops.filter((x) => x.id !== w.id);
      this.success = 'Taller eliminado.';
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar';
    }
  }
}
