import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

// ─── Types ───────────────────────────────────────────────────────────────────

type StageStatus = 'complete' | 'in-progress' | 'blocked' | 'pending';

interface StageInfo {
    id: string;
    step: number;
    title: string;
    description: string;
    status: StageStatus;
    metric: string | null;
    metricLabel: string | null;
    route: string;
    cta: string;
    blockReason: string | null;
    blockRoute: string | null;
    blockCta: string | null;
}

interface DashboardData {
    activePeriod: { id: string; code: string; name: string } | null;
    nivelacion: {
        applied: boolean;
        sectionsCount: number;
        sectionCoursesCount: number;
        studentsCount: number;
        runId: string | null;
    };
    schedules: {
        totalSectionCourses: number;
        withSchedule: number;
        withoutSchedule: number;
        allComplete: boolean;
    };
    teachers: {
        totalSectionCourses: number;
        withTeacher: number;
        withoutTeacher: number;
        allComplete: boolean;
    };
    matricula: {
        runStatus: string | null;
        assignedCount: number | null;
        conflictsCount: number | null;
        done: boolean;
    };
}

// ─── Component ───────────────────────────────────────────────────────────────

@Component({
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-2xl">🎓</span>
            <h1 class="text-2xl font-bold text-slate-900">Panel de Proceso Académico</h1>
          </div>
          <p class="text-slate-500 text-sm">
            Sigue el orden de pasos para completar el proceso de nivelación correctamente.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <!-- Periodo activo badge -->
          <div
            *ngIf="data?.activePeriod"
            class="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
          >
            <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-xs font-semibold text-emerald-700">
              {{ data!.activePeriod!.code }} — {{ data!.activePeriod!.name }}
            </span>
          </div>
          <div
            *ngIf="!data?.activePeriod && !loading"
            class="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
          >
            <span class="h-2 w-2 rounded-full bg-amber-500"></span>
            <span class="text-xs font-semibold text-amber-700">Sin periodo activo</span>
          </div>

          <button
            class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60"
            [disabled]="loading"
            (click)="load()"
          >
            {{ loading ? 'Actualizando...' : '↻ Refrescar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Error global -->
    <div
      *ngIf="error"
      class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <!-- Loading skeleton -->
    <div *ngIf="loading" class="space-y-3">
      <div *ngFor="let i of [1,2,3,4,5]" class="h-28 rounded-2xl border border-slate-200 bg-white animate-pulse"></div>
    </div>

    <!-- Stages checklist -->
    <div *ngIf="!loading && data" class="space-y-3">

      <div
        *ngFor="let stage of stages; let i = index; let last = last"
        class="relative rounded-2xl border transition-all duration-200"
        [ngClass]="{
          'border-emerald-200 bg-emerald-50/40': stage.status === 'complete',
          'border-blue-200 bg-blue-50/40 shadow-sm': stage.status === 'in-progress',
          'border-red-200 bg-red-50/30': stage.status === 'blocked',
          'border-slate-200 bg-white': stage.status === 'pending'
        }"
      >
        <!-- Connector line between steps -->
        <div
          *ngIf="!last"
          class="absolute left-7 top-full w-0.5 h-3 z-10"
          [ngClass]="{
            'bg-emerald-300': stage.status === 'complete',
            'bg-blue-300': stage.status === 'in-progress',
            'bg-slate-200': stage.status === 'blocked' || stage.status === 'pending'
          }"
        ></div>

        <div class="flex items-start gap-4 p-5">
          <!-- Step indicator -->
          <div
            class="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold border-2 mt-0.5"
            [ngClass]="{
              'border-emerald-400 bg-emerald-100 text-emerald-700': stage.status === 'complete',
              'border-blue-400 bg-blue-100 text-blue-700': stage.status === 'in-progress',
              'border-red-300 bg-red-50 text-red-500': stage.status === 'blocked',
              'border-slate-300 bg-slate-100 text-slate-500': stage.status === 'pending'
            }"
          >
            <span *ngIf="stage.status === 'complete'">✓</span>
            <span *ngIf="stage.status !== 'complete'">{{ stage.step }}</span>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-3 flex-wrap">
                  <span class="font-semibold text-slate-900">{{ stage.title }}</span>

                  <!-- Status badge -->
                  <span
                    class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    [ngClass]="{
                      'bg-emerald-100 text-emerald-700': stage.status === 'complete',
                      'bg-blue-100 text-blue-700': stage.status === 'in-progress',
                      'bg-red-100 text-red-700': stage.status === 'blocked',
                      'bg-slate-100 text-slate-600': stage.status === 'pending'
                    }"
                  >
                    <span *ngIf="stage.status === 'complete'">✓ Completado</span>
                    <span *ngIf="stage.status === 'in-progress'">⏳ En progreso</span>
                    <span *ngIf="stage.status === 'blocked'">⛔ Bloqueado</span>
                    <span *ngIf="stage.status === 'pending'">○ Pendiente</span>
                  </span>

                  <!-- Metric -->
                  <span
                    *ngIf="stage.metric !== null"
                    class="text-xs text-slate-500"
                  >
                    {{ stage.metricLabel }}: <b class="text-slate-700">{{ stage.metric }}</b>
                  </span>
                </div>

                <p class="mt-1 text-sm text-slate-500">{{ stage.description }}</p>

                <!-- Block reason alert -->
                <div
                  *ngIf="stage.blockReason"
                  class="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
                >
                  <span class="text-amber-500 text-sm flex-shrink-0">⚠</span>
                  <div class="flex-1 min-w-0 flex items-center justify-between gap-3 flex-wrap">
                    <span class="text-xs text-amber-800">{{ stage.blockReason }}</span>
                    <a
                      *ngIf="stage.blockRoute"
                      [routerLink]="stage.blockRoute"
                      class="flex-shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 transition-colors"
                    >
                      {{ stage.blockCta }}
                    </a>
                  </div>
                </div>
              </div>

              <!-- CTA button -->
              <a
                [routerLink]="stage.route"
                class="flex-shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150"
                [ngClass]="{
                  'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50': stage.status === 'complete',
                  'bg-blue-600 text-white shadow-sm hover:bg-blue-700': stage.status === 'in-progress',
                  'bg-white border border-slate-300 text-slate-500 hover:bg-slate-50': stage.status === 'blocked' || stage.status === 'pending'
                }"
              >
                {{ stage.status === 'complete' ? 'Revisar' : stage.cta }}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Next Step CTA -->
    <div
      *ngIf="!loading && nextStage"
      class="mt-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white shadow-lg"
    >
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-blue-200 mb-1">
            → Siguiente paso recomendado
          </div>
          <div class="text-lg font-bold">{{ nextStage.title }}</div>
          <div class="text-sm text-blue-200 mt-0.5">{{ nextStage.description }}</div>
        </div>
        <a
          [routerLink]="nextStage.route"
          class="flex-shrink-0 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50 transition-colors shadow-sm"
        >
          {{ nextStage.cta }} →
        </a>
      </div>
    </div>

    <!-- All done banner -->
    <div
      *ngIf="!loading && data && allDone"
      class="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-5"
    >
      <div class="flex items-center gap-3">
        <span class="text-3xl">🎉</span>
        <div>
          <div class="font-bold text-emerald-800">¡Proceso completado!</div>
          <div class="text-sm text-emerald-700 mt-0.5">
            Todos los pasos están completos. Puedes exportar y consultar los reportes finales.
          </div>
        </div>
        <a
          routerLink="/admin/export"
          class="ml-auto flex-shrink-0 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          Ver reportes →
        </a>
      </div>
    </div>

    <!-- Quick access cards -->
    <div *ngIf="!loading && data" class="mt-8">
      <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Acceso rápido</div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <a
          *ngFor="let card of quickCards"
          [routerLink]="card.route"
          class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-sm transition-all duration-150"
        >
          <span class="text-xl">{{ card.icon }}</span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-slate-800 truncate">{{ card.label }}</div>
            <div class="text-[11px] text-slate-500 truncate">{{ card.sub }}</div>
          </div>
        </a>
      </div>
    </div>
  `,
})
export class AdminDashboardPage implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly cdr = inject(ChangeDetectorRef);

    loading = true;
    error: string | null = null;
    data: DashboardData | null = null;
    stages: StageInfo[] = [];
    nextStage: StageInfo | null = null;
    allDone = false;

    readonly quickCards = [
        { icon: '📅', label: 'Periodos', sub: 'Definir periodo activo', route: '/admin/periods' },
        { icon: '📊', label: 'Nivelación', sub: 'Estructura y distribución', route: '/admin/leveling' },
        { icon: '🗓', label: 'Horarios', sub: 'Configurar secciones', route: '/admin/sections' },
        { icon: '📤', label: 'Exportar', sub: 'Reportes y resultados', route: '/admin/export' },
    ];

    ngOnInit() {
        void this.load();
    }

    async load() {
        this.loading = true;
        this.error = null;
        this.cdr.detectChanges();
        try {
            this.data = await this.fetchDashboardData();
            this.stages = this.buildStages(this.data);
            this.nextStage = this.stages.find(s => s.status === 'in-progress' || s.status === 'blocked') ?? null;
            this.allDone = this.stages.every(s => s.status === 'complete');
        } catch (e: any) {
            this.error = e?.error?.message ?? 'No se pudo cargar el estado del proceso';
        } finally {
            this.loading = false;
            this.cdr.detectChanges();
        }
    }

    // ─── Data fetching ────────────────────────────────────────────────────────

    private async fetchDashboardData(): Promise<DashboardData> {
        type SummaryResponse = {
            activePeriod: { id: string; code: string; name: string } | null;
            run: { id: string; status: string } | null;
            metrics: {
                sections: number;
                sectionCourses: number;
                demands: number;
                assigned: number;
                schedules: { withSchedule: number; withoutSchedule: number; allComplete: boolean };
                teachers: { withTeacher: number; withoutTeacher: number; allComplete: boolean };
            } | null;
        };

        const summary = await firstValueFrom(
            this.http.get<SummaryResponse>('/api/admin/leveling/active-run-summary')
        );

        const hasRun = !!summary.run;
        const m = summary.metrics;
        const runStatus = summary.run?.status ?? null;
        const matriculaDone = runStatus === 'MATRICULATED' || runStatus === 'DONE';

        return {
            activePeriod: summary.activePeriod,
            nivelacion: {
                applied: hasRun,
                sectionsCount: m?.sections ?? 0,
                sectionCoursesCount: m?.sectionCourses ?? 0,
                studentsCount: m?.demands ?? 0,
                runId: summary.run?.id ?? null,
            },
            schedules: {
                totalSectionCourses: m?.sectionCourses ?? 0,
                withSchedule: m?.schedules.withSchedule ?? 0,
                withoutSchedule: m?.schedules.withoutSchedule ?? 0,
                allComplete: m?.schedules.allComplete ?? false,
            },
            teachers: {
                totalSectionCourses: m?.sectionCourses ?? 0,
                withTeacher: m?.teachers.withTeacher ?? 0,
                withoutTeacher: m?.teachers.withoutTeacher ?? 0,
                allComplete: m?.teachers.allComplete ?? false,
            },
            matricula: {
                runStatus,
                assignedCount: m?.assigned ?? null,
                conflictsCount: null, // resolved lazily only if needed; dashboard shows status only
                done: matriculaDone,
            },
        };
    }

    // ─── Stage builder ────────────────────────────────────────────────────────

    private buildStages(d: DashboardData): StageInfo[] {
        const hasPeriod = !!d.activePeriod;
        const hasNivelacion = d.nivelacion.applied;
        const hasAllSchedules = d.schedules.allComplete;
        const hasAllTeachers = d.teachers.allComplete;
        const matriculaDone = d.matricula.done;

        // Step 1 — Período
        const step1: StageInfo = {
            id: 'periodo',
            step: 1,
            title: 'Definir Periodo activo',
            description: 'Crea y activa el periodo académico de nivelación. Todo el proceso se aplica al periodo activo.',
            status: hasPeriod ? 'complete' : 'in-progress',
            metric: hasPeriod ? `${d.activePeriod!.code}` : null,
            metricLabel: hasPeriod ? 'Periodo' : null,
            route: '/admin/periods',
            cta: 'Gestionar Periodos',
            blockReason: null,
            blockRoute: null,
            blockCta: null,
        };

        // Step 2 — Nivelación
        const step2: StageInfo = {
            id: 'nivelacion',
            step: 2,
            title: 'Aplicar estructura de Nivelación',
            description: 'Sube el Excel, configura grupos y aplica la estructura (alumnos + secciones + secciones-curso).',
            status: !hasPeriod
                ? 'blocked'
                : hasNivelacion
                    ? 'complete'
                    : 'in-progress',
            metric: hasNivelacion ? String(d.nivelacion.sectionCoursesCount) : null,
            metricLabel: hasNivelacion ? 'Secciones-curso' : null,
            route: '/admin/leveling',
            cta: 'Aplicar Estructura',
            blockReason: !hasPeriod ? 'Activa un periodo académico antes de poder aplicar la estructura.' : null,
            blockRoute: !hasPeriod ? '/admin/periods' : null,
            blockCta: !hasPeriod ? 'Ir a Periodos →' : null,
        };

        // Step 3 — Horarios
        const schedPending = hasNivelacion && !hasAllSchedules;
        const schedDone = hasNivelacion && hasAllSchedules;
        const step3: StageInfo = {
            id: 'horarios',
            step: 3,
            title: 'Configurar horarios por sección-curso',
            description: 'Asigna franjas horarias a cada sección-curso. Es obligatorio completar TODAS antes de matricular.',
            status: !hasNivelacion
                ? 'blocked'
                : schedDone
                    ? 'complete'
                    : schedPending
                        ? 'in-progress'
                        : 'pending',
            metric: hasNivelacion
                ? `${d.schedules.withSchedule} / ${d.schedules.totalSectionCourses}`
                : null,
            metricLabel: hasNivelacion ? 'Con horario' : null,
            route: '/admin/sections',
            cta: 'Configurar Horarios',
            blockReason: !hasNivelacion
                ? 'Primero debes aplicar la estructura de nivelación (Paso 2).'
                : schedPending
                    ? `Faltan ${d.schedules.withoutSchedule} sección(es)-curso sin horario. La matrícula no se puede ejecutar hasta completarlas.`
                    : null,
            blockRoute: !hasNivelacion ? '/admin/leveling' : null,
            blockCta: !hasNivelacion ? 'Ir a Nivelación →' : null,
        };

        // Step 4 — Docentes
        const teachPending = hasNivelacion && !hasAllTeachers;
        const teachDone = hasNivelacion && hasAllTeachers;
        const step4: StageInfo = {
            id: 'docentes',
            step: 4,
            title: 'Asignar docentes por sección-curso',
            description: 'Asocia un docente a cada sección-curso para completar la programación.',
            status: !hasNivelacion
                ? 'blocked'
                : teachDone
                    ? 'complete'
                    : teachPending
                        ? 'in-progress'
                        : 'pending',
            metric: hasNivelacion
                ? `${d.teachers.withTeacher} / ${d.teachers.totalSectionCourses}`
                : null,
            metricLabel: hasNivelacion ? 'Con docente' : null,
            route: '/admin/sections',
            cta: 'Asignar Docentes',
            blockReason: !hasNivelacion
                ? 'Primero debes aplicar la estructura de nivelación (Paso 2).'
                : null,
            blockRoute: !hasNivelacion ? '/admin/leveling' : null,
            blockCta: !hasNivelacion ? 'Ir a Nivelación →' : null,
        };

        // Step 5 — Matrícula
        const canMatricular = hasAllSchedules && hasNivelacion;
        const step5: StageInfo = {
            id: 'matricula',
            step: 5,
            title: 'Ejecutar Matrícula automática',
            description: 'Ejecuta la matrícula schedule-aware: asigna alumnos a secciones sin cruces de horario.',
            status: !canMatricular
                ? 'blocked'
                : matriculaDone
                    ? 'complete'
                    : 'in-progress',
            metric: d.matricula.assignedCount !== null ? String(d.matricula.assignedCount) : null,
            metricLabel: 'Alumnos matriculados',
            route: '/admin/leveling',
            cta: 'Ejecutar Matrícula',
            blockReason: !hasNivelacion
                ? 'Debes aplicar la estructura y configurar todos los horarios antes de matricular.'
                : !hasAllSchedules
                    ? `Faltan ${d.schedules.withoutSchedule} sección(es)-curso sin horario. Completa los horarios para desbloquear la matrícula.`
                    : d.matricula.conflictsCount !== null && d.matricula.conflictsCount > 0
                        ? `Se detectaron ${d.matricula.conflictsCount} cruces de horario tras la matrícula. Revisa los resultados.`
                        : null,
            blockRoute: !hasNivelacion
                ? '/admin/leveling'
                : !hasAllSchedules
                    ? '/admin/sections'
                    : null,
            blockCta: !hasNivelacion
                ? 'Ir a Nivelación →'
                : !hasAllSchedules
                    ? 'Completar Horarios →'
                    : null,
        };

        // Step 6 — Reportes
        const step6: StageInfo = {
            id: 'reportes',
            step: 6,
            title: 'Exportar y consultar resultados',
            description: 'Exporta el archivo final y consulta alumnos por sección para validar la configuración.',
            status: matriculaDone ? 'complete' : canMatricular ? 'in-progress' : 'pending',
            metric: null,
            metricLabel: null,
            route: '/admin/export',
            cta: 'Ver Reportes',
            blockReason: !matriculaDone && !canMatricular
                ? 'Completa el proceso de matrícula para acceder a los reportes finales.'
                : !matriculaDone && canMatricular
                    ? 'Los reportes están disponibles, pero la matrícula aún no ha sido ejecutada.'
                    : null,
            blockRoute: null,
            blockCta: null,
        };

        return [step1, step2, step3, step4, step5, step6];
    }
}
