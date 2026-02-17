import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { LevelingConfig, LevelingPlanResponse } from '@uai/shared';
import { firstValueFrom } from 'rxjs';

interface CourseColumn {
  key: string;
  label: string;
}

const COURSE_COLUMNS: CourseColumn[] = [
  { key: 'COMUNICACION', label: 'COMUNICACION' },
  { key: 'HABILIDADES COMUNICATIVAS', label: 'HABILIDADES COMUNICATIVAS' },
  { key: 'MATEMATICA', label: 'MATEMATICA' },
  { key: 'CIENCIA, TECNOLOGIA Y AMBIENTE', label: 'CIENCIA, TECNOLOGIA Y AMBIENTE' },
  { key: 'CIENCIAS SOCIALES', label: 'CIENCIAS SOCIALES' },
];

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Nivelacion por Excel</div>
        <div class="text-sm text-slate-600">
          Carga A:AD, previsualiza grupos y aplica distribucion automatica.
        </div>
      </div>
      <button
        class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
        (click)="loadConfig()"
      >
        Refrescar config
      </button>
    </div>

    <div *ngIf="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <div class="text-sm font-semibold">Configuracion de aforo</div>
          <form class="mt-3 space-y-2" [formGroup]="configForm" (ngSubmit)="saveConfig()">
            <label class="block text-xs text-slate-700">
              Aforo inicial por seccion
              <input
                type="number"
                min="1"
                class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="initialCapacity"
              />
            </label>
            <label class="block text-xs text-slate-700">
              Maximo extra por seccion (0 = sin extra)
              <input
                type="number"
                min="0"
                class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="maxExtraCapacity"
              />
            </label>
            <button
              class="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="configForm.invalid || savingConfig"
            >
              {{ savingConfig ? 'Guardando...' : 'Guardar configuracion' }}
            </button>
          </form>
        </div>

        <div class="border-t border-slate-200 pt-4">
          <div class="text-sm font-semibold">Archivo Excel</div>
          <div class="mt-2">
            <input
              type="file"
              accept=".xlsx,.xls"
              class="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold hover:file:bg-slate-50"
              (change)="onFileSelected($event)"
            />
          </div>
          <div class="mt-2 text-xs text-slate-600" *ngIf="selectedFileName">
            Archivo: <b>{{ selectedFileName }}</b>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              class="rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              [disabled]="running || !selectedFile || configForm.invalid"
              (click)="runPlan(false)"
              type="button"
            >
              {{ running ? 'Procesando...' : 'Previsualizar' }}
            </button>
            <button
              class="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="running || !selectedFile || configForm.invalid"
              (click)="runPlan(true)"
              type="button"
            >
              {{ running ? 'Aplicando...' : 'Aplicar' }}
            </button>
          </div>
        </div>
      </div>

      <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Resumen ejecutivo</div>
        <div *ngIf="!result" class="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Sube un Excel y pulsa previsualizar para ver la distribucion.
        </div>

        <div *ngIf="result" class="mt-3 space-y-4">
          <div class="grid gap-2 sm:grid-cols-3">
            <div class="rounded-xl bg-slate-50 p-3">
              <div class="text-xs text-slate-600">Filas leidas</div>
              <div class="text-lg font-semibold">{{ result.inputSummary.rowsRead }}</div>
            </div>
            <div class="rounded-xl bg-slate-50 p-3">
              <div class="text-xs text-slate-600">Alumnos elegibles</div>
              <div class="text-lg font-semibold">{{ result.inputSummary.eligibleStudents }}</div>
            </div>
            <div class="rounded-xl bg-slate-50 p-3">
              <div class="text-xs text-slate-600">Secciones propuestas</div>
              <div class="text-lg font-semibold">{{ result.sections.length }}</div>
            </div>
          </div>

          <div
            *ngIf="result.applied"
            class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
          >
            <div class="font-semibold">Distribucion aplicada</div>
            <div class="mt-1">
              Secciones creadas: {{ result.applied.sectionsCreated }} |
              actualizadas: {{ result.applied.sectionsUpdated }} |
              matriculas creadas: {{ result.applied.enrollmentsCreated }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="result && result.summary.byFaculty.length > 0" class="mt-5 space-y-4">
      <div
        *ngFor="let fac of result.summary.byFaculty; trackBy: trackFaculty"
        class="rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div class="text-sm font-semibold">Grupos {{ fac.facultyGroup }}</div>

        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm border border-slate-300">
            <thead class="bg-slate-900 text-white text-xs uppercase tracking-wide">
              <tr>
                <th class="border border-slate-300 px-3 py-2 text-left">Sede - Modalidad</th>
                <th
                  *ngFor="let c of courseColumns; trackBy: trackCourse"
                  class="border border-slate-300 px-3 py-2 text-center"
                >
                  {{ c.label }}
                </th>
                <th class="border border-slate-300 px-3 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of fac.rows; trackBy: trackRow">
                <td class="border border-slate-300 px-3 py-2 font-medium">{{ row.label }}</td>
                <td
                  *ngFor="let c of courseColumns; trackBy: trackCourse"
                  class="border border-slate-300 px-3 py-2 text-center"
                >
                  {{ row.courseGroups[c.key] }}
                </td>
                <td class="border border-slate-300 px-3 py-2 text-center font-semibold">
                  {{ row.totalGroups }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-slate-600">Total de grupos</div>
            <div class="font-semibold">{{ fac.totalGroups }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-slate-600">Cantidad de horas por grupo</div>
            <div class="font-semibold">{{ fac.totalHours }}</div>
          </div>
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="text-slate-600">Total a pagar por 4 semanas</div>
            <div class="font-semibold">{{ fac.totalPay4Weeks }}</div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 bg-slate-900 text-white p-4">
        <div class="text-sm opacity-80">TOTAL DE NIVELACION</div>
        <div class="text-2xl font-semibold">{{ result.summary.totalPay4Weeks }}</div>
      </div>
    </div>

    <div
      *ngIf="result && result.inputSummary.unknownCareers.length > 0"
      class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
    >
      <div class="font-semibold">Carreras sin mapeo directo (se aplico fallback por area)</div>
      <div class="mt-1">{{ result.inputSummary.unknownCareers.join(', ') }}</div>
    </div>

    <div *ngIf="result" class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <details>
        <summary class="cursor-pointer text-sm font-semibold text-slate-800">
          Ver detalle por seccion ({{ result.sections.length }})
        </summary>
        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-4 py-3">Codigo</th>
                <th class="px-4 py-3">Facultad</th>
                <th class="px-4 py-3">Sede</th>
                <th class="px-4 py-3">Modalidad</th>
                <th class="px-4 py-3">Cursos</th>
                <th class="px-4 py-3">Alumnos</th>
                <th class="px-4 py-3">Aforo</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let s of result.sections" class="border-t border-slate-100">
                <td class="px-4 py-3 font-semibold">{{ s.code }}</td>
                <td class="px-4 py-3">
                  <div>{{ s.facultyGroup }}</div>
                  <div class="text-xs text-slate-600">{{ s.facultyName }}</div>
                </td>
                <td class="px-4 py-3">{{ s.campusName }}</td>
                <td class="px-4 py-3">{{ s.modality }}</td>
                <td class="px-4 py-3 text-xs">{{ s.courses.join(', ') }}</td>
                <td class="px-4 py-3 font-medium">{{ s.studentCount }}</td>
                <td class="px-4 py-3 text-xs">
                  {{ s.initialCapacity }} + {{ s.maxExtraCapacity }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  `,
})
export class AdminLevelingPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly courseColumns = COURSE_COLUMNS;

  error: string | null = null;
  result: LevelingPlanResponse | null = null;
  selectedFile: File | null = null;
  selectedFileName: string | null = null;

  savingConfig = false;
  running = false;

  configForm = this.fb.group({
    initialCapacity: [45, [Validators.required, Validators.min(1), Validators.max(1000)]],
    maxExtraCapacity: [0, [Validators.required, Validators.min(0), Validators.max(1000)]],
  });

  async ngOnInit() {
    await this.loadConfig();
  }

  trackCourse(_: number, item: CourseColumn) {
    return item.key;
  }

  trackFaculty(_: number, item: { facultyGroup: string }) {
    return item.facultyGroup;
  }

  trackRow(_: number, item: { label: string }) {
    return item.label;
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.selectedFile = file;
    this.selectedFileName = file?.name ?? null;
  }

  async loadConfig() {
    this.error = null;
    try {
      const cfg = await firstValueFrom(
        this.http.get<LevelingConfig>('/api/admin/leveling/config')
      );
      this.configForm.patchValue({
        initialCapacity: cfg.initialCapacity,
        maxExtraCapacity: cfg.maxExtraCapacity,
      });
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar configuracion';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async saveConfig() {
    if (this.configForm.invalid) return;
    this.savingConfig = true;
    this.error = null;
    try {
      const value = this.configForm.getRawValue();
      await firstValueFrom(
        this.http.put('/api/admin/leveling/config', {
          initialCapacity: Number(value.initialCapacity),
          maxExtraCapacity: Number(value.maxExtraCapacity),
        })
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar configuracion';
    } finally {
      this.savingConfig = false;
      this.cdr.detectChanges();
    }
  }

  async runPlan(apply: boolean) {
    if (!this.selectedFile) {
      this.error = 'Selecciona un archivo Excel';
      this.cdr.detectChanges();
      return;
    }
    if (apply) {
      const ok = window.confirm(
        'Se aplicara la distribucion y se reasignaran matriculas. Deseas continuar?'
      );
      if (!ok) return;
    }

    this.running = true;
    this.error = null;
    try {
      const value = this.configForm.getRawValue();
      const formData = new FormData();
      formData.append('file', this.selectedFile);
      formData.append('initialCapacity', String(Number(value.initialCapacity)));
      formData.append('maxExtraCapacity', String(Number(value.maxExtraCapacity)));
      formData.append('apply', apply ? 'true' : 'false');

      this.result = await firstValueFrom(
        this.http.post<LevelingPlanResponse>('/api/admin/leveling/plan', formData)
      );
    } catch (e: any) {
      this.result = null;
      this.error = e?.error?.message ?? 'No se pudo procesar el archivo';
    } finally {
      this.running = false;
      this.cdr.detectChanges();
    }
  }
}
