import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { WorkflowStateService } from '../core/workflow/workflow-state.service';
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
  origin?: 'EXISTING_FREE' | 'NEW_REQUIRED';
  sectionCourseId?: string;
  availableSeats?: number;
  hasExistingVirtual?: boolean;
  sectionCode?: string;
  sectionCampusName?: string;
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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
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
              Aforo por seccion
              <input
                type="number"
                min="1"
                class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                formControlName="initialCapacity"
              />
            </label>
            <div class="hidden"><label class="block text-xs text-slate-700">Maximo extra por seccion (0 = sin extra)<input type="number" min="0" class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" formControlName="maxExtraCapacity"/></label></div>
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
            *ngIf="result.applied || result.appendPreview"
            class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
          >
            <div class="flex items-center gap-2 mb-3">
              <div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <div class="font-semibold text-sm">
                {{ result.applied ? 'Estructura Generada Exitosamente' : 'Previsualizacion incremental (sin aplicar)' }}
              </div>
            </div>
            
                        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 text-xs">
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Secciones</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? (result.applied.sectionsCreated + result.applied.sectionsUpdated) : result.sections.length }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Cursos-Seccion</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? result.applied.sectionCoursesCreated : 0 }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Demandas Alumnos</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? result.applied.demandsCreated : (result.appendPreview?.demandsCreated || 0) }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Pendientes evaluados</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? result.applied.pendingDemandsEvaluated : (result.appendPreview?.pendingDemandsEvaluated || 0) }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Cupos existentes</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.appendPreview?.existingFreeSeatsDetected || 0 }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Nuevos requeridos</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.appendPreview?.newRequiredSeats || 0 }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Grupos en virtual</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.appendPreview?.groupsConvertedToVirtual || 0 }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Oferta reutilizada</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? result.applied.offersReused : (result.appendPreview?.offersReused || 0) }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Secciones por expansion</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? result.applied.sectionsCreatedByExpansion : (result.appendPreview?.sectionsCreatedByExpansion || 0) }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Cursos-seccion por expansion</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? result.applied.sectionCoursesCreatedByExpansion : (result.appendPreview?.sectionCoursesCreatedByExpansion || 0) }}
                </div>
              </div>
              <div class="bg-white/60 rounded-lg p-2 border border-emerald-100/50">
                <div class="text-emerald-700/70 font-medium">Omitidos</div>
                <div class="text-lg font-bold text-emerald-800">
                  {{ result.applied ? (result.applied.sectionCoursesOmitted + result.applied.demandsOmitted) : (result.appendPreview?.demandsOmitted || 0) }}
                </div>
              </div>
            </div>

            <div class="mt-3 rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-xs text-emerald-800">
              {{ result.applied
                ? 'Se amplio oferta automaticamente para pendientes de matricula en este periodo.'
                : 'Estimacion de expansion automatica para pendientes de matricula (aun sin aplicar cambios).' }}
            </div>

            <div class="mt-4" *ngIf="result.applied">
              <div class="flex justify-between text-[10px] font-medium text-emerald-700 mb-1">
                <span>Proceso completado</span>
                <span>100%</span>
              </div>
              <div class="h-2 w-full rounded-full bg-emerald-200 overflow-hidden">
                <div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 w-full animate-pulse"></div>
              </div>
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
                      class="rounded-md px-2 py-1 text-[11px] font-semibold border flex items-center gap-1"
                      [ngClass]="
                        g.modality === 'VIRTUAL'
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-300 bg-slate-50 text-slate-800'
                      "
                      (click)="toggleGroupModality(g)"
                    >
                      <span>{{ g.size }} {{ g.modality === 'VIRTUAL' ? 'V' : 'P' }}</span>
                      <span
                        *ngIf="isGroupExisting(g)"
                        class="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-800"
                      >
                        Existente
                      </span>
                      <span
                        *ngIf="!isGroupExisting(g) && g.origin === 'NEW_REQUIRED'"
                        class="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800"
                      >
                        Nuevo
                      </span>
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

    <div *ngIf="result && result.summary.byFaculty.length > 0 && lastPlanMode !== 'APPEND'" class="mt-5 space-y-4">
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
                <th class="px-4 py-3">Cursos</th>
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
                <td class="px-4 py-3 text-xs text-slate-600">
                  {{ (sectionCourseFilter !== 'ALL' ? [sectionCourseFilter] : row.section.courses).join(', ') || '-' }}
                </td>
              </tr>
              <tr *ngIf="filteredSectionRows.length === 0" class="border-t border-slate-100">
                <td colspan="5" class="px-4 py-4 text-sm text-slate-500">
                  Sin secciones para el filtro seleccionado.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    <div *ngIf="runId && result.applied" class="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div class="flex items-center gap-2">
        <svg class="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="text-sm font-semibold text-emerald-800">Estructura aplicada</div>
      </div>
      <div class="mt-2 text-xs text-emerald-700 leading-relaxed">
        Los pasos siguientes son:
        <ol class="mt-1 list-decimal list-inside space-y-1">
          <li>Ve a <a routerLink="/admin/sections" class="underline font-semibold cursor-pointer">Horarios y Docentes</a> para asignar horarios y docentes a cada secciÃ³n-curso.</li>
          <li>Una vez listos todos los horarios, regresa aquÃ­ para <b>Ejecutar MatrÃ­cula</b>.</li>
        </ol>
      </div>

      <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div class="flex flex-col gap-1">
          <button
            class="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            [ngClass]="canMatriculateFICA ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-400'"
            [disabled]="!canMatriculateFICA || runningMatriculation"
            (click)="matriculateRun('FICA')"
          >
            Matricular FICA
          </button>
          <div *ngIf="!canMatriculateFICA" class="text-[10px] text-red-600 font-medium">
            Faltan horarios en FICA
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <button
            class="rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             [ngClass]="canMatriculateSALUD ? 'bg-pink-600 hover:bg-pink-700' : 'bg-slate-400'"
            [disabled]="!canMatriculateSALUD || runningMatriculation"
            (click)="matriculateRun('SALUD')"
          >
            Matricular SALUD
          </button>
          <div *ngIf="!canMatriculateSALUD" class="text-[10px] text-red-600 font-medium">
             Faltan horarios en SALUD
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div *ngIf="confirmState.isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transform transition-all">
        <h3 class="text-lg font-semibold text-slate-900">{{ confirmState.title }}</h3>
        <p class="mt-2 text-sm text-slate-600 leading-relaxed">{{ confirmState.message }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            (click)="confirmState.isOpen = false"
          >
            Cancelar
          </button>
          <button
            class="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
            (click)="confirmState.onConfirm()"
          >
            {{ confirmState.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminLevelingPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly workflowState = inject(WorkflowStateService);

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
  lastPlanMode: 'REPLACE' | 'APPEND' | null = null;
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

  confirmState = {
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirmar',
    onConfirm: () => { },
  };

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
    this.checkActiveRun();
  }

  askConfirmation(title: string, message: string, onConfirm: () => void) {
    this.confirmState = {
      isOpen: true,
      title,
      message,
      confirmLabel: 'Continuar',
      onConfirm: () => {
        this.confirmState.isOpen = false;
        onConfirm();
      },
    };
  }

  async checkActiveRun() {
    try {
      const s = await firstValueFrom(this.http.get<any>('/api/admin/leveling/active-run-summary'));
      if (s?.run?.id) {
        await this.loadRunContext(s.run.id);
      }
    } catch { }
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
    return `${item.studentId}:${item.blockA.blockId}:${item.blockB.blockId} `;
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
    const planKeys: string[] = [];
    if (this.result) {
      for (const fac of this.result.groupPlan.byFaculty ?? []) {
        for (const row of fac.rows ?? []) {
          planKeys.push(...Object.keys(row.courses ?? {}));
        }
      }
    }
    const unique = Array.from(
      new Set([...keys, ...planKeys].map((x) => String(x || '').trim()).filter(Boolean))
    );
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
    const mode: 'REPLACE' | 'APPEND' = this.runId ? 'APPEND' : 'REPLACE';
    if (apply) {
      this.askConfirmation(
        mode === 'APPEND' ? 'Confirmar carga incremental' : 'Confirmar aplicacion de estructura',
        mode === 'APPEND'
          ? 'Se agregaran alumnos y demandas al proceso activo, sin borrar matriculas actuales. Deseas continuar?'
          : 'Se aplicara la estructura (usuarios/secciones/seccion-curso) sin matricular alumnos. Deseas continuar?',
        () => this.executeRunPlan(apply, useCurrentGroupOverrides, mode)
      );
      return;
    }
    this.executeRunPlan(apply, useCurrentGroupOverrides, mode);
  }

  async executeRunPlan(
    apply: boolean,
    useCurrentGroupOverrides: boolean,
    mode: 'REPLACE' | 'APPEND'
  ) {
    this.running = true;
    this.error = null;
    this.lastPlanMode = mode;
    const currentRunId = this.runId;
    try {
      if (!useCurrentGroupOverrides) {
        this.groupModalityOverrides = {};
      }

      const value = this.configForm.getRawValue();
      const formData = new FormData();
      formData.append('file', this.selectedFile!);
      formData.append('initialCapacity', String(Number(value.initialCapacity)));
      formData.append('maxExtraCapacity', String(Number(value.maxExtraCapacity)));
      formData.append('apply', apply ? 'true' : 'false');
      formData.append('mode', mode);

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
      const responseRunId = String(this.result.runId ?? '').trim();
      this.runId = responseRunId || (mode === 'APPEND' ? currentRunId : null);
      if (this.runId) {
        await this.loadRunContext(this.runId);
      } else {
        this.runDetails = null;
        this.runSections = [];
      }
      if (apply) {
        await this.syncWorkflowMenuAfterApply();
      }
    } catch (e: any) {
      this.result = null;
      this.error = e?.error?.message ?? 'No se pudo procesar el archivo';
    } finally {
      this.running = false;
      this.cdr.detectChanges();
    }
  }

  private async syncWorkflowMenuAfterApply() {
    this.workflowState.notifyWorkflowChanged();
    let synced = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const summary = await firstValueFrom(
          this.http.get<any>(`/api/admin/leveling/active-run-summary?t=${Date.now()}`)
        );
        const hasActivePeriod = Boolean(summary?.activePeriod);
        const hasRun = Boolean(summary?.run);
        this.workflowState.notifyWorkflowChanged();
        if (hasActivePeriod && hasRun) {
          synced = true;
          break;
        }
      } catch {
        // ignore transient errors and continue retries
      }
      await this.sleep(450);
    }
    if (!synced) {
      window.location.reload();
    }
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
    this.router.navigate(['/admin/sections', sectionId, 'schedule'], {
      queryParams: { courseName },
    });
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

    this.askConfirmation(
      'Eliminar seccion manual',
      `Eliminar ${section.code || section.name} - ${sectionCourse.courseName}?`,
      () => this.executeDeleteManualSectionCourse(sectionCourse)
    );
  }

  async executeDeleteManualSectionCourse(
    sectionCourse: LevelingRunSectionView['sectionCourses'][number]
  ) {
    if (!this.runId) return;
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

  get canMatriculateFICA() {
    if (!this.runId || this.runSections.length === 0) return false;
    const ficaSections = this.runSections.filter((s) => s.facultyGroup === 'FICA');
    if (ficaSections.length === 0) return false;
    return ficaSections.every((s) =>
      s.sectionCourses.every((sc) => sc.hasSchedule && Boolean(sc.hasTeacher))
    );
  }

  get canMatriculateSALUD() {
    if (!this.runId || this.runSections.length === 0) return false;
    const saludSections = this.runSections.filter((s) => s.facultyGroup === 'SALUD');
    if (saludSections.length === 0) return false;
    return saludSections.every((s) =>
      s.sectionCourses.every((sc) => sc.hasSchedule && Boolean(sc.hasTeacher))
    );
  }

  async matriculateRun(facultyGroup?: string) {
    if (!this.runId || this.runningMatriculation) return;

    if (facultyGroup === 'FICA' && !this.canMatriculateFICA) return;
    if (facultyGroup === 'SALUD' && !this.canMatriculateSALUD) return;
    if (!facultyGroup && (!this.canMatriculateFICA || !this.canMatriculateSALUD)) return;

    const label = facultyGroup ? `Matricula ${facultyGroup}` : 'Matricula COMPLETA';

    this.askConfirmation(
      `Ejecutar ${label}`,
      `Se ejecutara la matricula automatica schedule-aware para ${facultyGroup ?? 'TODAS las facultades'}. Continuar?`,
      () => this.executeMatriculateRun(facultyGroup)
    );
  }

  async executeMatriculateRun(facultyGroup?: string) {
    if (!this.runId) return;
    this.runningMatriculation = true;
    this.error = null;
    try {
      this.matriculationResult = await firstValueFrom(
        this.http.post<LevelingMatriculationResult>(
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/matriculate`,
          { facultyGroup }
        )
      );
      await this.loadRunContext(this.runId);
      await this.loadRunConflicts();
      this.workflowState.notifyWorkflowChanged();
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
          `/api/admin/leveling/runs/${encodeURIComponent(this.runId)}/conflicts${suffix ? `?${suffix}` : ''
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

  isGroupExisting(group: EditableGroupItem) {
    if (group.origin === 'EXISTING_FREE') return true;
    if (group.modality === 'VIRTUAL' && Boolean(group.hasExistingVirtual)) return true;
    return false;
  }

  private filterSectionStudentsByCourse(
    section: LevelingPlanResponse['sections'][number]
  ): LevelingPlanResponse['sections'][number]['students'] {
    const students = section.students ?? [];
    if (this.sectionCourseFilter === 'ALL') return students.slice();
    return students.filter((st) => (st.sectionCourses ?? []).includes(this.sectionCourseFilter));
  }
}


