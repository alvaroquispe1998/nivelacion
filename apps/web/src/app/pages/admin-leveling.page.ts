import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  LevelingConfig,
  LevelingManualSectionCourseResult,
  LevelingMatriculationResult,
  LevelingPlanResponse,
  LevelingRunConflictItem,
  LevelingRunDetailsResponse,
  LevelingRunSectionView,
} from '@uai/shared';
import { firstValueFrom } from 'rxjs';

interface CourseColumn {
  key: string;
  label: string;
}

type Modality = 'PRESENCIAL' | 'VIRTUAL';

interface EditableGroupItem {
  id: string;
  size: number;
  modality: Modality;
}

const PREFERRED_COURSE_ORDER = [
  'COMUNICACION',
  'HABILIDADES COMUNICATIVAS',
  'MATEMATICA',
  'CIENCIA, TECNOLOGIA Y AMBIENTE',
  'CIENCIAS SOCIALES',
];

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xl font-semibold">Nivelacion por Excel</div>
        <div class="text-sm text-slate-600">
          Paso 1: define grupos (presencial/virtual). Paso 2: regenera secciones.
          Paso 3: aplica estructura. Paso 4: configura horarios y ejecuta matricula.
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

          <div
            *ngIf="sectionsDirty"
            class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            Cambiaste grupos. Debes pulsar <b>Regenerar secciones</b> antes de aplicar.
          </div>

          <div class="mt-3 grid grid-cols-3 gap-2">
            <button
              class="rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              [disabled]="running || !selectedFile || configForm.invalid"
              (click)="previewBase()"
              type="button"
            >
              {{ running ? 'Procesando...' : 'Previsualizar' }}
            </button>
            <button
              class="rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              [disabled]="running || !selectedFile || configForm.invalid || !sectionsDirty"
              (click)="regenerateSections()"
              type="button"
            >
              {{ running ? 'Regenerando...' : 'Regenerar' }}
            </button>
            <button
              class="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              [disabled]="running || !selectedFile || configForm.invalid || sectionsDirty"
              (click)="runPlan(true, true)"
              type="button"
            >
              {{ running ? 'Aplicando...' : 'Aplicar estructura' }}
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
              <div class="text-xs text-slate-600">Secciones generadas</div>
              <div class="text-lg font-semibold">{{ result.sections.length }}</div>
            </div>
          </div>

          <div
            *ngIf="result.applied"
            class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
          >
            <div class="font-semibold">Estructura aplicada</div>
            <div class="mt-1">
              Run: {{ result.applied.runId }} |
              Estado: {{ result.applied.runStatus }} |
              Secciones creadas: {{ result.applied.sectionsCreated }} |
              actualizadas: {{ result.applied.sectionsUpdated }} |
              demandas creadas: {{ result.applied.demandsCreated }}
            </div>
            <div class="mt-1">
              seccion-curso creadas: {{ result.applied.sectionCoursesCreated }} |
              omitidas: {{ result.applied.sectionCoursesOmitted }} |
              demandas omitidas: {{ result.applied.demandsOmitted }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div *ngIf="result" class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="text-sm font-semibold">Base por programa (previo a grupos)</div>
      <div class="mt-1 text-xs text-slate-600">
        Conteo desde Excel (A:AD) para comparar por sede y modalidad.
      </div>

      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <label class="text-xs text-slate-700">
          Sede
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="programCampusFilter"
            [ngModelOptions]="{ standalone: true }"
          >
            <option value="ALL">Todas</option>
            <option *ngFor="let campus of programCampusOptions" [value]="campus">
              {{ campus }}
            </option>
          </select>
        </label>

        <label class="text-xs text-slate-700">
          Modalidad
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="programModalityFilter"
            [ngModelOptions]="{ standalone: true }"
          >
            <option value="ALL">Todas</option>
            <option *ngFor="let modality of programModalityOptions" [value]="modality">
              {{ modality }}
            </option>
          </select>
        </label>
      </div>

      <div class="mt-3 overflow-x-auto">
        <table class="min-w-full text-sm border border-slate-300">
          <thead class="bg-slate-900 text-white text-xs uppercase tracking-wide">
            <tr>
              <th class="border border-slate-300 px-3 py-2 text-left">Programa academico</th>
              <th
                *ngFor="let c of courseColumns; trackBy: trackCourse"
                class="border border-slate-300 px-3 py-2 text-center"
              >
                {{ c.label }}
              </th>
              <th class="border border-slate-300 px-3 py-2 text-center">
                Total de competencias desaprobadas
              </th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of programRows; trackBy: trackProgramRow">
              <td class="border border-slate-300 px-3 py-2 font-medium">{{ row.careerName }}</td>
              <td
                *ngFor="let c of courseColumns; trackBy: trackCourse"
                class="border border-slate-300 px-3 py-2 text-center"
              >
                {{ row.needsByCourse[c.key] }}
              </td>
              <td class="border border-slate-300 px-3 py-2 text-center font-semibold">
                {{ row.totalNeeds }}
              </td>
            </tr>
            <tr *ngIf="programRows.length === 0">
              <td
                class="border border-slate-300 px-3 py-3 text-slate-500"
                [attr.colspan]="courseColumns.length + 2"
              >
                Sin datos para el filtro seleccionado.
              </td>
            </tr>
          </tbody>
          <tfoot *ngIf="programRows.length > 0">
            <tr class="bg-slate-100 font-semibold">
              <td class="border border-slate-300 px-3 py-2 text-left">TOTAL</td>
              <td
                *ngFor="let c of courseColumns; trackBy: trackCourse"
                class="border border-slate-300 px-3 py-2 text-center"
              >
                {{ programTotals[c.key] }}
              </td>
              <td class="border border-slate-300 px-3 py-2 text-center">
                {{ programTotals['TOTAL'] }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div *ngIf="result && result.groupPlan.byFaculty.length > 0" class="mt-5 space-y-4">
      <div class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="text-sm font-semibold">Configuracion de grupos</div>
        <div class="text-xs text-slate-600 mt-1">
          Click en cada grupo para alternar modalidad (P/V). Al cambiar, debes regenerar secciones.
        </div>
      </div>

      <div
        *ngFor="let fac of result.groupPlan.byFaculty; trackBy: trackFaculty"
        class="rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div class="text-sm font-semibold">Edicion grupos {{ fac.facultyGroup }}</div>
        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm border border-slate-300">
            <thead class="bg-slate-100 text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th class="border border-slate-300 px-3 py-2 text-left">Sede</th>
                <th
                  *ngFor="let c of courseColumns; trackBy: trackCourse"
                  class="border border-slate-300 px-3 py-2 text-left"
                >
                  {{ c.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of fac.rows; trackBy: trackCampusRow">
                <td class="border border-slate-300 px-3 py-2 font-medium">{{ row.campusName }}</td>
                <td
                  *ngFor="let c of courseColumns; trackBy: trackCourse"
                  class="border border-slate-300 px-3 py-2 align-top"
                >
                  <div class="flex flex-wrap gap-1">
                    <button
                      *ngFor="let g of row.courses[c.key]; trackBy: trackGroup"
                      type="button"
                      class="rounded-md px-2 py-1 text-[11px] font-semibold border"
                      [ngClass]="
                        g.modality === 'VIRTUAL'
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-300 bg-slate-50 text-slate-800'
                      "
                      (click)="toggleGroupModality(g)"
                    >
                      {{ g.size }} {{ g.modality === 'VIRTUAL' ? 'V' : 'P' }}
                    </button>
                    <span *ngIf="!row.courses[c.key] || row.courses[c.key].length === 0" class="text-xs text-slate-400">
                      -
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div *ngIf="result && result.summary.byFaculty.length > 0" class="mt-5 space-y-4">
      <div
        *ngFor="let fac of result.summary.byFaculty; trackBy: trackFaculty"
        class="rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div class="text-sm font-semibold">Resumen {{ fac.facultyGroup }}</div>

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
              <tr *ngFor="let row of fac.rows; trackBy: trackSummaryRow">
                <td class="border border-slate-300 px-3 py-2 font-medium">{{ row.label }}</td>
                <td
                  *ngFor="let c of courseColumns; trackBy: trackCourse"
                  class="border border-slate-300 px-3 py-2 text-center"
                >
                  <div>{{ row.courseGroups[c.key] }}</div>
                  <div class="text-[10px] text-slate-500" *ngIf="(row.courseGroupSizes[c.key]?.length || 0) > 0">
                    {{ row.courseGroupSizes[c.key]?.join(' + ') }}
                  </div>
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
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <label class="text-xs text-slate-700">
            Facultad
            <select
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              [(ngModel)]="sectionFacultyFilter"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="ALL">Todas</option>
              <option *ngFor="let fac of sectionFacultyOptions" [value]="fac">
                {{ fac }}
              </option>
            </select>
          </label>
          <label class="text-xs text-slate-700">
            Sede - Modalidad
            <select
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              [(ngModel)]="sectionSiteModalityFilter"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="ALL">Todas</option>
              <option *ngFor="let opt of sectionSiteModalityOptions" [value]="opt">
                {{ opt }}
              </option>
            </select>
          </label>
          <label class="text-xs text-slate-700">
            Curso
            <select
              class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              [(ngModel)]="sectionCourseFilter"
              [ngModelOptions]="{ standalone: true }"
            >
              <option value="ALL">Todos</option>
              <option *ngFor="let c of sectionCourseOptions" [value]="c">
                {{ c }}
              </option>
            </select>
          </label>
        </div>
        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-4 py-3">Codigo</th>
                <th class="px-4 py-3">Facultad</th>
                <th class="px-4 py-3">Sede</th>
                <th class="px-4 py-3">Modalidad</th>
                <th class="px-4 py-3">Alumnos</th>
                <th class="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of filteredSectionRows" class="border-t border-slate-100">
                <td class="px-4 py-3 font-semibold">{{ row.section.code }}</td>
                <td class="px-4 py-3">
                  <div>{{ row.section.facultyGroup }}</div>
                  <div class="text-xs text-slate-600">{{ row.section.facultyName }}</div>
                </td>
                <td class="px-4 py-3">{{ row.section.campusName }}</td>
                <td class="px-4 py-3">{{ row.section.modality }}</td>
                <td class="px-4 py-3 font-medium">{{ row.studentCount }}</td>
                <td class="px-4 py-3 text-xs">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    (click)="openStudentsModal(row.section, row.students)"
                  >
                    Ver alumnos
                  </button>
                </td>
              </tr>
              <tr *ngIf="filteredSectionRows.length === 0" class="border-t border-slate-100">
                <td colspan="6" class="px-4 py-4 text-sm text-slate-500">
                  Sin secciones para el filtro seleccionado.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>

    <div *ngIf="runId" class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="text-lg font-semibold">Matricula (Schedule-Aware)</div>
          <div class="text-xs text-slate-600">
            Run: <span class="font-mono">{{ runId }}</span>
            <span *ngIf="runDetails"> | Estado: <b>{{ runDetails.status }}</b></span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            [disabled]="loadingRunSections || !runId"
            (click)="runId && loadRunContext(runId)"
          >
            {{ loadingRunSections ? 'Actualizando...' : 'Refrescar matricula' }}
          </button>
          <button
            type="button"
            class="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            [disabled]="!canMatriculateRun"
            (click)="matriculateRun()"
          >
            {{ runningMatriculation ? 'Matriculando...' : 'Matricular' }}
          </button>
        </div>
      </div>

      <div *ngIf="runDetails" class="mt-3 grid gap-2 sm:grid-cols-4">
        <div class="rounded-xl bg-slate-50 p-3 text-xs">
          <div class="text-slate-600">Secciones</div>
          <div class="font-semibold">{{ runDetails.metrics.sections }}</div>
        </div>
        <div class="rounded-xl bg-slate-50 p-3 text-xs">
          <div class="text-slate-600">Seccion-curso</div>
          <div class="font-semibold">{{ runDetails.metrics.sectionCourses }}</div>
        </div>
        <div class="rounded-xl bg-slate-50 p-3 text-xs">
          <div class="text-slate-600">Demandas</div>
          <div class="font-semibold">{{ runDetails.metrics.demands }}</div>
        </div>
        <div class="rounded-xl bg-slate-50 p-3 text-xs">
          <div class="text-slate-600">Matriculados</div>
          <div class="font-semibold">{{ runDetails.metrics.assigned }}</div>
        </div>
      </div>

      <div *ngIf="!canMatriculateRun && runSectionCourseCount > 0" class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Debes completar horario en todas las secciones-curso para habilitar matricula.
      </div>

      <div class="mt-4 grid gap-2 sm:grid-cols-2">
        <label class="text-xs text-slate-700">
          Facultad
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="runFacultyFilter"
            [ngModelOptions]="{ standalone: true }"
          >
            <option value="ALL">Todas</option>
            <option *ngFor="let value of runFacultyOptions" [value]="value">{{ value }}</option>
          </select>
        </label>
        <label class="text-xs text-slate-700">
          Sede
          <select
            class="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            [(ngModel)]="runCampusFilter"
            [ngModelOptions]="{ standalone: true }"
          >
            <option value="ALL">Todas</option>
            <option *ngFor="let value of runCampusOptions" [value]="value">{{ value }}</option>
          </select>
        </label>
      </div>

      <div class="mt-3 overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead class="bg-slate-50 text-left uppercase tracking-wide text-slate-600">
            <tr>
              <th class="px-3 py-2">Seccion</th>
              <th class="px-3 py-2">Contexto</th>
              <th class="px-3 py-2">Aforo</th>
              <th class="px-3 py-2">Cursos / Horarios</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let section of filteredRunSections; trackBy: trackRunSection" class="border-t border-slate-100 align-top">
              <td class="px-3 py-2">
                <div class="font-semibold">{{ section.code || section.name }}</div>
                <div class="text-[11px] text-slate-500">
                  {{ section.isAutoLeveling ? 'AUTO' : 'MANUAL' }}
                </div>
              </td>
              <td class="px-3 py-2">
                <div>{{ section.facultyGroup || '-' }}</div>
                <div>{{ section.campusName || '-' }}</div>
                <div>{{ section.modality || '-' }}</div>
              </td>
              <td class="px-3 py-2">
                <div class="grid grid-cols-2 gap-1">
                  <input
                    type="number"
                    min="1"
                    class="w-full rounded border border-slate-300 px-2 py-1"
                    [(ngModel)]="section.initialCapacity"
                    [ngModelOptions]="{ standalone: true }"
                  />
                  <input
                    type="number"
                    min="0"
                    class="w-full rounded border border-slate-300 px-2 py-1"
                    [(ngModel)]="section.maxExtraCapacity"
                    [ngModelOptions]="{ standalone: true }"
                  />
                </div>
                <button
                  type="button"
                  class="mt-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-slate-50 disabled:opacity-60"
                  [disabled]="savingCapacityBySectionId.has(section.sectionId)"
                  (click)="saveRunSectionCapacity(section)"
                >
                  Guardar aforo
                </button>
              </td>
              <td class="px-3 py-2">
                <div *ngFor="let sectionCourse of section.sectionCourses; trackBy: trackRunSectionCourse" class="mb-2 rounded border border-slate-200 p-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-semibold">{{ sectionCourse.courseName }}</span>
                    <span
                      class="rounded px-2 py-0.5 text-[10px] font-semibold"
                      [ngClass]="
                        sectionCourse.hasSchedule
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      "
                    >
                      {{ sectionCourse.hasSchedule ? 'CON HORARIO' : 'SIN HORARIO' }}
                    </span>
                    <span class="text-[11px] text-slate-500">
                      Bloques: {{ sectionCourse.scheduleBlocksCount }} | Asignados: {{ sectionCourse.assignedStudents }}
                    </span>
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold hover:bg-slate-50"
                      (click)="openRunSectionSchedule(section.sectionId, sectionCourse.courseName)"
                    >
                      Editar horario
                    </button>
                    <button
                      *ngIf="!section.isAutoLeveling"
                      type="button"
                      class="rounded border border-rose-300 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      [disabled]="
                        deletingManualSectionCourseId === sectionCourse.sectionCourseId ||
                        sectionCourse.assignedStudents > 0
                      "
                      (click)="deleteManualSectionCourse(section, sectionCourse)"
                    >
                      Eliminar manual
                    </button>
                  </div>
                </div>
              </td>
            </tr>
            <tr *ngIf="filteredRunSections.length === 0">
              <td class="px-3 py-3 text-slate-500" colspan="4">Sin secciones para el filtro seleccionado.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-4 rounded-xl border border-slate-200 p-3">
        <div class="text-sm font-semibold">Crear seccion-curso manual</div>
        <form class="mt-2 grid gap-2 sm:grid-cols-4" [formGroup]="manualSectionCourseForm" (ngSubmit)="createManualSectionCourse()">
          <input class="rounded border border-slate-300 px-2 py-1 text-xs" formControlName="facultyGroup" placeholder="Facultad (FICA/SALUD)" />
          <input class="rounded border border-slate-300 px-2 py-1 text-xs" formControlName="campusName" placeholder="Sede" />
          <input class="rounded border border-slate-300 px-2 py-1 text-xs" formControlName="modality" placeholder="Modalidad" />
          <input class="rounded border border-slate-300 px-2 py-1 text-xs" formControlName="courseName" placeholder="Curso" />
          <input class="rounded border border-slate-300 px-2 py-1 text-xs" type="number" min="1" formControlName="initialCapacity" placeholder="Aforo inicial" />
          <input class="rounded border border-slate-300 px-2 py-1 text-xs" type="number" min="0" formControlName="maxExtraCapacity" placeholder="Aforo extra" />
          <input class="rounded border border-slate-300 px-2 py-1 text-xs sm:col-span-2" formControlName="facultyName" placeholder="Nombre facultad (opcional)" />
          <button
            class="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 sm:col-span-4"
            [disabled]="manualSectionCourseForm.invalid || creatingManualSectionCourse"
          >
            {{ creatingManualSectionCourse ? 'Creando...' : 'Crear seccion-curso manual' }}
          </button>
        </form>
      </div>

      <div *ngIf="matriculationResult" class="mt-4 rounded-xl border border-slate-200 p-3">
        <div class="text-sm font-semibold">Resultado de matricula</div>
        <div class="mt-1 text-xs text-slate-600">
          Estado run: {{ matriculationResult.status }} | Asignados: {{ matriculationResult.assignedCount }} |
          No asignados: {{ matriculationResult.unassigned.length }} |
          Cruces detectados: {{ matriculationResult.conflictsFoundAfterAssign }}
        </div>
        <div *ngIf="matriculationResult.unassigned.length > 0" class="mt-3 overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-2 py-1">Codigo</th>
                <th class="px-2 py-1">Alumno</th>
                <th class="px-2 py-1">Curso</th>
                <th class="px-2 py-1">Motivo</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of matriculationResult.unassigned" class="border-t border-slate-100">
                <td class="px-2 py-1">{{ studentCode(row.studentCode) }}</td>
                <td class="px-2 py-1">{{ row.studentName }}</td>
                <td class="px-2 py-1">{{ row.courseName }}</td>
                <td class="px-2 py-1">{{ row.reason }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="mt-4 rounded-xl border border-slate-200 p-3">
        <div class="text-sm font-semibold">Validar cruces</div>
        <div class="mt-2 grid gap-2 sm:grid-cols-3">
          <input
            class="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="Facultad (opcional)"
            [(ngModel)]="runConflictsFacultyFilter"
            [ngModelOptions]="{ standalone: true }"
          />
          <input
            class="rounded border border-slate-300 px-2 py-1 text-xs"
            placeholder="Sede (opcional)"
            [(ngModel)]="runConflictsCampusFilter"
            [ngModelOptions]="{ standalone: true }"
          />
          <button
            type="button"
            class="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
            [disabled]="runConflictLoading"
            (click)="loadRunConflicts()"
          >
            {{ runConflictLoading ? 'Validando...' : 'Buscar cruces' }}
          </button>
        </div>
        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50 text-left uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-2 py-1">Codigo</th>
                <th class="px-2 py-1">Alumno</th>
                <th class="px-2 py-1">Dia</th>
                <th class="px-2 py-1">Cruce A</th>
                <th class="px-2 py-1">Cruce B</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of runConflictRows; trackBy: trackRunConflict" class="border-t border-slate-100">
                <td class="px-2 py-1">{{ studentCode(row.studentCode) }}</td>
                <td class="px-2 py-1">{{ row.studentName }}</td>
                <td class="px-2 py-1">{{ dayLabel(row.dayOfWeek) }}</td>
                <td class="px-2 py-1">
                  {{ row.blockA.sectionCode || row.blockA.sectionName }} / {{ row.blockA.courseName }} /
                  {{ row.blockA.startTime }}-{{ row.blockA.endTime }}
                </td>
                <td class="px-2 py-1">
                  {{ row.blockB.sectionCode || row.blockB.sectionName }} / {{ row.blockB.courseName }} /
                  {{ row.blockB.startTime }}-{{ row.blockB.endTime }}
                </td>
              </tr>
              <tr *ngIf="!runConflictLoading && runConflictRows.length === 0">
                <td class="px-2 py-3 text-slate-500" colspan="5">Sin cruces detectados.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div
      *ngIf="studentsModalSection"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      (click)="closeStudentsModal()"
    >
      <div
        class="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div class="text-sm font-semibold text-slate-900">
              Alumnos de seccion {{ studentsModalSection.code }}
            </div>
            <div class="text-xs text-slate-600">
              {{ studentsModalSection.facultyGroup }} | {{ studentsModalSection.campusName }} |
              {{ studentsModalSection.modality }} | {{ studentsModalStudents.length }} alumnos
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            (click)="closeStudentsModal()"
          >
            Cerrar
          </button>
        </div>

        <div class="max-h-[70vh] overflow-auto p-5">
          <table class="min-w-full text-sm">
            <thead class="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th class="px-3 py-2">Codigo alumno</th>
                <th class="px-3 py-2">Alumno</th>
                <th class="px-3 py-2">Carrera</th>
                <th class="px-3 py-2">Curso(s)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let st of studentsModalStudents; trackBy: trackStudent"
                class="border-t border-slate-100"
              >
                <td class="px-3 py-2 font-mono text-xs">{{ studentCode(st.codigoAlumno) }}</td>
                <td class="px-3 py-2">{{ st.fullName }}</td>
                <td class="px-3 py-2 text-xs">{{ st.careerName }}</td>
                <td class="px-3 py-2 text-xs">
                  {{ st.sectionCourses.length ? st.sectionCourses.join(', ') : '-' }}
                </td>
              </tr>
              <tr *ngIf="studentsModalStudents.length === 0">
                <td class="px-3 py-4 text-slate-500" colspan="4">Sin alumnos</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class AdminLevelingPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  error: string | null = null;
  result: LevelingPlanResponse | null = null;
  selectedFile: File | null = null;
  selectedFileName: string | null = null;
  groupModalityOverrides: Record<string, Modality> = {};
  sectionsDirty = false;
  studentsModalSection: LevelingPlanResponse['sections'][number] | null = null;
  studentsModalStudents: LevelingPlanResponse['sections'][number]['students'] = [];
  programCampusFilter = 'ALL';
  programModalityFilter = 'ALL';
  sectionFacultyFilter = 'ALL';
  sectionSiteModalityFilter = 'ALL';
  sectionCourseFilter = 'ALL';
  runId: string | null = null;
  runDetails: LevelingRunDetailsResponse | null = null;
  runSections: LevelingRunSectionView[] = [];
  runFacultyFilter = 'ALL';
  runCampusFilter = 'ALL';
  runConflictRows: LevelingRunConflictItem[] = [];
  runConflictsFacultyFilter = '';
  runConflictsCampusFilter = '';
  runConflictLoading = false;
  loadingRunSections = false;
  savingCapacityBySectionId = new Set<string>();
  creatingManualSectionCourse = false;
  deletingManualSectionCourseId: string | null = null;
  runningMatriculation = false;
  matriculationResult: LevelingMatriculationResult | null = null;

  savingConfig = false;
  running = false;

  configForm = this.fb.group({
    initialCapacity: [45, [Validators.required, Validators.min(1), Validators.max(1000)]],
    maxExtraCapacity: [0, [Validators.required, Validators.min(0), Validators.max(1000)]],
  });

  manualSectionCourseForm = this.fb.group({
    facultyGroup: ['FICA', [Validators.required]],
    facultyName: [''],
    campusName: ['', [Validators.required]],
    modality: ['PRESENCIAL', [Validators.required]],
    courseName: ['', [Validators.required]],
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

  trackCampusRow(_: number, item: { campusName: string }) {
    return item.campusName;
  }

  trackSummaryRow(_: number, item: { label: string }) {
    return item.label;
  }

  trackGroup(_: number, item: EditableGroupItem) {
    return item.id;
  }

  trackProgramRow(_: number, item: { careerName: string }) {
    return item.careerName;
  }

  trackStudent(
    _: number,
    item: {
      dni: string;
      codigoAlumno: string | null;
      fullName: string;
      careerName: string;
      sectionCourses: string[];
    }
  ) {
    return item.dni;
  }

  trackRunSection(_: number, item: LevelingRunSectionView) {
    return item.sectionId;
  }

  trackRunSectionCourse(
    _: number,
    item: LevelingRunSectionView['sectionCourses'][number]
  ) {
    return item.sectionCourseId;
  }

  trackRunConflict(_: number, item: LevelingRunConflictItem) {
    return `${item.studentId}:${item.blockA.blockId}:${item.blockB.blockId}`;
  }

  dayLabel(dayOfWeek: number) {
    const labels = ['', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
    return labels[Number(dayOfWeek) || 0] ?? String(dayOfWeek);
  }

  studentCode(code: string | null | undefined) {
    const value = String(code ?? '').trim();
    return value || 'SIN CODIGO';
  }

  get courseColumns(): CourseColumn[] {
    const keys = Object.keys(this.result?.needsByCourse ?? {});
    const unique = Array.from(new Set(keys.map((x) => String(x || '').trim()).filter(Boolean)));
    unique.sort((a, b) => {
      const ai = PREFERRED_COURSE_ORDER.indexOf(a);
      const bi = PREFERRED_COURSE_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return unique.map((key) => ({ key, label: key }));
  }

  get sectionFacultyOptions() {
    if (!this.result) return [] as string[];
    return Array.from(
      new Set(this.result.sections.map((s) => String(s.facultyGroup || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  get programCampusOptions() {
    if (!this.result) return [] as string[];
    return this.result.programNeeds.campuses.slice();
  }

  get programModalityOptions() {
    if (!this.result) return [] as string[];
    return this.result.programNeeds.modalities.slice();
  }

  get programRows() {
    if (!this.result) return [] as Array<{
      careerName: string;
      facultyGroup: 'FICA' | 'SALUD';
      needsByCourse: Record<string, number>;
      totalNeeds: number;
    }>;

    let rows = this.result.programNeeds.rows.slice();
    if (this.programCampusFilter !== 'ALL') {
      rows = rows.filter((x) => x.campusName === this.programCampusFilter);
    }
    if (this.programModalityFilter !== 'ALL') {
      rows = rows.filter((x) => x.sourceModality === this.programModalityFilter);
    }

    const byCareer = new Map<
      string,
      {
        careerName: string;
        facultyGroup: 'FICA' | 'SALUD';
        needsByCourse: Record<string, number>;
        totalNeeds: number;
      }
    >();
    for (const row of rows) {
      const key = String(row.careerName || '').trim();
      if (!byCareer.has(key)) {
        const needsByCourse: Record<string, number> = {};
        for (const c of this.courseColumns) {
          needsByCourse[c.key] = 0;
        }
        byCareer.set(key, {
          careerName: row.careerName,
          facultyGroup: row.facultyGroup,
          needsByCourse,
          totalNeeds: 0,
        });
      }
      const acc = byCareer.get(key)!;
      for (const c of this.courseColumns) {
        acc.needsByCourse[c.key] += Number(row.needsByCourse[c.key] || 0);
      }
      acc.totalNeeds += Number(row.totalNeeds || 0);
    }

    return Array.from(byCareer.values()).sort((a, b) =>
      String(a.careerName || '').localeCompare(String(b.careerName || ''))
    );
  }

  get programTotals() {
    const totals: Record<string, number> = {};
    for (const c of this.courseColumns) {
      totals[c.key] = 0;
    }
    totals['TOTAL'] = 0;
    for (const row of this.programRows) {
      for (const c of this.courseColumns) {
        totals[c.key] += Number(row.needsByCourse[c.key] || 0);
      }
      totals['TOTAL'] += Number(row.totalNeeds || 0);
    }
    return totals;
  }

  get sectionSiteModalityOptions() {
    if (!this.result) return [] as string[];
    const options = new Set<string>();
    for (const s of this.result.sections) {
      const mod = String(s.modality || '').toUpperCase();
      if (mod.includes('VIRTUAL')) {
        options.add('VIRTUAL');
      } else {
        options.add(`${s.campusName} - PRESENCIAL`);
      }
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }

  get sectionCourseOptions() {
    if (!this.result) return [] as string[];
    const options = new Set<string>();
    for (const s of this.result.sections) {
      for (const c of s.courses ?? []) {
        const course = String(c || '').trim();
        if (course) options.add(course);
      }
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }

  get filteredSectionRows() {
    if (!this.result)
      return [] as Array<{
        section: LevelingPlanResponse['sections'][number];
        students: LevelingPlanResponse['sections'][number]['students'];
        studentCount: number;
      }>;
    let rows = [...this.result.sections];

    if (this.sectionFacultyFilter !== 'ALL') {
      rows = rows.filter((s) => s.facultyGroup === this.sectionFacultyFilter);
    }
    if (this.sectionSiteModalityFilter !== 'ALL') {
      rows = rows.filter((s) => {
        const isVirtual = String(s.modality || '').toUpperCase().includes('VIRTUAL');
        const key = isVirtual ? 'VIRTUAL' : `${s.campusName} - PRESENCIAL`;
        return key === this.sectionSiteModalityFilter;
      });
    }
    if (this.sectionCourseFilter !== 'ALL') {
      rows = rows.filter((s) => (s.courses ?? []).includes(this.sectionCourseFilter));
    }

    const mapped = rows
      .map((section) => {
        const students = this.filterSectionStudentsByCourse(section);
        return {
          section,
          students,
          studentCount: students.length,
        };
      })
      .filter((row) => (this.sectionCourseFilter === 'ALL' ? true : row.studentCount > 0));

    mapped.sort((a, b) => {
      const fac = String(a.section.facultyGroup || '').localeCompare(
        String(b.section.facultyGroup || '')
      );
      if (fac !== 0) return fac;
      const camp = String(a.section.campusName || '').localeCompare(
        String(b.section.campusName || '')
      );
      if (camp !== 0) return camp;
      const modA = String(a.section.modality || '').toUpperCase().includes('VIRTUAL') ? 1 : 0;
      const modB = String(b.section.modality || '').toUpperCase().includes('VIRTUAL') ? 1 : 0;
      if (modA !== modB) return modA - modB;
      return String(a.section.code || '').localeCompare(String(b.section.code || ''));
    });

    return mapped;
  }

  get runFacultyOptions() {
    return Array.from(
      new Set(
        this.runSections
          .map((s) => String(s.facultyGroup ?? '').trim())
          .filter((value) => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b));
  }

  get runCampusOptions() {
    return Array.from(
      new Set(
        this.runSections
          .map((s) => String(s.campusName ?? '').trim())
          .filter((value) => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b));
  }

  get filteredRunSections() {
    return this.runSections.filter((row) => {
      if (this.runFacultyFilter !== 'ALL') {
        if (String(row.facultyGroup ?? '').trim() !== this.runFacultyFilter) return false;
      }
      if (this.runCampusFilter !== 'ALL') {
        if (String(row.campusName ?? '').trim() !== this.runCampusFilter) return false;
      }
      return true;
    });
  }

  get runSectionCourseCount() {
    return this.runSections.reduce(
      (acc, row) => acc + (row.sectionCourses?.length ?? 0),
      0
    );
  }

  get runAssignedCount() {
    return this.runSections.reduce(
      (acc, row) =>
        acc +
        (row.sectionCourses ?? []).reduce(
          (sectionAcc, sectionCourse) => sectionAcc + Number(sectionCourse.assignedStudents ?? 0),
          0
        ),
      0
    );
  }

  get canMatriculateRun() {
    if (!this.runId || this.runningMatriculation || this.loadingRunSections) return false;
    if (this.runSectionCourseCount === 0) return false;
    return this.runSections.every((row) =>
      (row.sectionCourses ?? []).every(
        (sectionCourse) => Number(sectionCourse.scheduleBlocksCount ?? 0) > 0
      )
    );
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.selectedFile = file;
    this.selectedFileName = file?.name ?? null;
    this.groupModalityOverrides = {};
    this.sectionsDirty = false;
    this.studentsModalSection = null;
    this.studentsModalStudents = [];
    this.programCampusFilter = 'ALL';
    this.programModalityFilter = 'ALL';
    this.sectionCourseFilter = 'ALL';
    this.runId = null;
    this.runDetails = null;
    this.runSections = [];
    this.runConflictRows = [];
    this.matriculationResult = null;
  }

  openStudentsModal(
    section: LevelingPlanResponse['sections'][number],
    students?: LevelingPlanResponse['sections'][number]['students']
  ) {
    this.studentsModalSection = section;
    this.studentsModalStudents = students
      ? students.slice()
      : this.filterSectionStudentsByCourse(section);
  }

  closeStudentsModal() {
    this.studentsModalSection = null;
    this.studentsModalStudents = [];
  }

  toggleGroupModality(item: EditableGroupItem) {
    item.modality = item.modality === 'VIRTUAL' ? 'PRESENCIAL' : 'VIRTUAL';
    this.rebuildGroupModalityOverrides();
    this.sectionsDirty = true;
    this.cdr.detectChanges();
  }

  async previewBase() {
    this.groupModalityOverrides = {};
    this.sectionsDirty = false;
    await this.runPlan(false, false);
  }

  async regenerateSections() {
    await this.runPlan(false, true);
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
      this.manualSectionCourseForm.patchValue({
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

  async runPlan(apply: boolean, useCurrentGroupOverrides: boolean) {
    if (!this.selectedFile) {
      this.error = 'Selecciona un archivo Excel';
      this.cdr.detectChanges();
      return;
    }
    if (apply && this.sectionsDirty) {
      this.error = 'Debes regenerar secciones despues de cambiar grupos.';
      this.cdr.detectChanges();
      return;
    }
    if (apply) {
      const ok = window.confirm(
        'Se aplicara la estructura (usuarios/secciones/seccion-curso) sin matricular alumnos. Deseas continuar?'
      );
      if (!ok) return;
    }

    this.running = true;
    this.error = null;
    try {
      if (!useCurrentGroupOverrides) {
        this.groupModalityOverrides = {};
      }

      const value = this.configForm.getRawValue();
      const formData = new FormData();
      formData.append('file', this.selectedFile);
      formData.append('initialCapacity', String(Number(value.initialCapacity)));
      formData.append('maxExtraCapacity', String(Number(value.maxExtraCapacity)));
      formData.append('apply', apply ? 'true' : 'false');

      const overrideKeys = Object.keys(this.groupModalityOverrides);
      if (overrideKeys.length > 0) {
        formData.append(
          'groupModalityOverrides',
          JSON.stringify(this.groupModalityOverrides)
        );
      }

      this.result = await firstValueFrom(
        this.http.post<LevelingPlanResponse>('/api/admin/leveling/plan', formData)
      );

      this.studentsModalSection = null;
      this.studentsModalStudents = [];
      this.programCampusFilter = 'ALL';
      this.programModalityFilter = 'ALL';
      this.sectionFacultyFilter = 'ALL';
      this.sectionSiteModalityFilter = 'ALL';
      this.sectionCourseFilter = 'ALL';
      this.rebuildGroupModalityOverrides();
      this.sectionsDirty = false;
      this.matriculationResult = null;
      this.runConflictRows = [];
      this.runId = String(this.result.runId ?? '').trim() || null;
      if (this.runId) {
        await this.loadRunContext(this.runId);
      } else {
        this.runDetails = null;
        this.runSections = [];
      }
    } catch (e: any) {
      this.result = null;
      this.error = e?.error?.message ?? 'No se pudo procesar el archivo';
    } finally {
      this.running = false;
      this.cdr.detectChanges();
    }
  }

  async loadRunContext(runId: string) {
    this.loadingRunSections = true;
    this.error = null;
    try {
      const [details, sections] = await Promise.all([
        firstValueFrom(
          this.http.get<LevelingRunDetailsResponse>(
            `/api/admin/leveling/runs/${encodeURIComponent(runId)}`
          )
        ),
        firstValueFrom(
          this.http.get<LevelingRunSectionView[]>(
            `/api/admin/leveling/runs/${encodeURIComponent(runId)}/sections`
          )
        ),
      ]);
      this.runId = runId;
      this.runDetails = details;
      this.runSections = sections;
      if (!this.manualSectionCourseForm.value.campusName && this.runCampusOptions.length > 0) {
        this.manualSectionCourseForm.patchValue({
          campusName: this.runCampusOptions[0],
        });
      }
      if (!this.manualSectionCourseForm.value.courseName) {
        const firstCourse = sections[0]?.sectionCourses?.[0]?.courseName ?? '';
        if (firstCourse) {
          this.manualSectionCourseForm.patchValue({
            courseName: firstCourse,
          });
        }
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo cargar el contexto de matricula';
      this.runDetails = null;
      this.runSections = [];
    } finally {
      this.loadingRunSections = false;
      this.cdr.detectChanges();
    }
  }

  openRunSectionSchedule(sectionId: string, courseName: string) {
    const sid = encodeURIComponent(sectionId);
    const course = encodeURIComponent(courseName);
    window.location.href = `/admin/sections/${sid}/schedule?courseName=${course}`;
  }

  async saveRunSectionCapacity(section: LevelingRunSectionView) {
    const sectionId = String(section.sectionId ?? '').trim();
    if (!sectionId || this.savingCapacityBySectionId.has(sectionId)) return;
    this.savingCapacityBySectionId.add(sectionId);
    this.error = null;
    try {
      await firstValueFrom(
        this.http.patch(`/api/admin/sections/${encodeURIComponent(sectionId)}/capacity`, {
          initialCapacity: Number(section.initialCapacity ?? 45),
          maxExtraCapacity: Number(section.maxExtraCapacity ?? 0),
        })
      );
      if (this.runId) {
        await this.loadRunContext(this.runId);
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo actualizar el aforo';
    } finally {
      this.savingCapacityBySectionId.delete(sectionId);
      this.cdr.detectChanges();
    }
  }

  async createManualSectionCourse() {
    if (!this.runId || this.manualSectionCourseForm.invalid || this.creatingManualSectionCourse) {
      return;
    }
    this.creatingManualSectionCourse = true;
    this.error = null;
    try {
      const value = this.manualSectionCourseForm.getRawValue();
      await firstValueFrom(
        this.http.post<LevelingManualSectionCourseResult>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/manual-section-courses`,
          {
            facultyGroup: String(value.facultyGroup ?? '').trim(),
            facultyName: String(value.facultyName ?? '').trim() || null,
            campusName: String(value.campusName ?? '').trim(),
            modality: String(value.modality ?? '').trim(),
            courseName: String(value.courseName ?? '').trim(),
            initialCapacity: Number(value.initialCapacity ?? 45),
            maxExtraCapacity: Number(value.maxExtraCapacity ?? 0),
          }
        )
      );
      await this.loadRunContext(this.runId);
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear la seccion-curso manual';
    } finally {
      this.creatingManualSectionCourse = false;
      this.cdr.detectChanges();
    }
  }

  async deleteManualSectionCourse(
    section: LevelingRunSectionView,
    sectionCourse: LevelingRunSectionView['sectionCourses'][number]
  ) {
    if (!this.runId) return;
    if (section.isAutoLeveling) return;
    if (Number(sectionCourse.assignedStudents ?? 0) > 0) {
      this.error = 'No se puede eliminar una seccion-curso con alumnos matriculados';
      this.cdr.detectChanges();
      return;
    }
    const ok = window.confirm(
      `Eliminar ${section.code || section.name} - ${sectionCourse.courseName}?`
    );
    if (!ok) return;

    this.deletingManualSectionCourseId = sectionCourse.sectionCourseId;
    this.error = null;
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/admin/leveling/runs/${encodeURIComponent(
            this.runId
          )}/manual-section-courses/${encodeURIComponent(sectionCourse.sectionCourseId)}`
        )
      );
      await this.loadRunContext(this.runId);
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo eliminar la seccion-curso manual';
    } finally {
      this.deletingManualSectionCourseId = null;
      this.cdr.detectChanges();
    }
  }

  async matriculateRun() {
    if (!this.runId || !this.canMatriculateRun || this.runningMatriculation) return;
    const ok = window.confirm(
      'Se ejecutara la matricula automatica schedule-aware. Continuar?'
    );
    if (!ok) return;

    this.runningMatriculation = true;
    this.error = null;
    try {
      this.matriculationResult = await firstValueFrom(
        this.http.post<LevelingMatriculationResult>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate`,
          {}
        )
      );
      await this.loadRunContext(this.runId);
      await this.loadRunConflicts();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo matricular automaticamente';
    } finally {
      this.runningMatriculation = false;
      this.cdr.detectChanges();
    }
  }

  async loadRunConflicts() {
    if (!this.runId) return;
    this.runConflictLoading = true;
    this.error = null;
    try {
      const query = new URLSearchParams();
      const facultyGroup = this.runConflictsFacultyFilter.trim();
      const campusName = this.runConflictsCampusFilter.trim();
      if (facultyGroup) query.set('facultyGroup', facultyGroup);
      if (campusName) query.set('campusName', campusName);
      const suffix = query.toString();
      this.runConflictRows = await firstValueFrom(
        this.http.get<LevelingRunConflictItem[]>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/conflicts${
            suffix ? `?${suffix}` : ''
          }`
        )
      );
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo validar cruces';
      this.runConflictRows = [];
    } finally {
      this.runConflictLoading = false;
      this.cdr.detectChanges();
    }
  }

  private rebuildGroupModalityOverrides() {
    const out: Record<string, Modality> = {};
    if (this.result) {
      for (const fac of this.result.groupPlan.byFaculty) {
        for (const row of fac.rows) {
          for (const c of this.courseColumns) {
            const groups = row.courses[c.key] ?? [];
            for (const g of groups) {
              if (g.modality === 'VIRTUAL') out[g.id] = 'VIRTUAL';
            }
          }
        }
      }
    }
    this.groupModalityOverrides = out;
  }

  private filterSectionStudentsByCourse(
    section: LevelingPlanResponse['sections'][number]
  ): LevelingPlanResponse['sections'][number]['students'] {
    const students = section.students ?? [];
    if (this.sectionCourseFilter === 'ALL') return students.slice();
    return students.filter((st) => (st.sectionCourses ?? []).includes(this.sectionCourseFilter));
  }

}
