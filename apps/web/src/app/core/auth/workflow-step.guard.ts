import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
} from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { Role } from '@uai/shared';

interface RunSummary {
  activePeriod: { id: string; code: string; name: string } | null;
  run: { id: string; status: string } | null;
  metrics: {
    sections: number;
    sectionCourses: number;
    assigned: number;
    demands: number;
    schedules: { withSchedule: number; withoutSchedule: number; allComplete: boolean };
    teachers: { withTeacher: number; withoutTeacher: number; allComplete: boolean };
    readyFaculties?: number;
    assignedInPeriod?: number;
  } | null;
}

type StepKey =
  | 'leveling'
  | 'sections'
  | 'matricula'
  | 'export'
  | 'reports-program'
  | 'reports-summary';

interface StepRequirement {
  description: string;
  blockedRedirectTo: (summary: RunSummary, route: ActivatedRouteSnapshot) => string | null;
}

const STEP_REQUIREMENTS: Record<StepKey, StepRequirement> = {
  leveling: {
    description: 'Debe haber un periodo activo antes de ejecutar la nivelacion.',
    blockedRedirectTo: (s) => (s.activePeriod ? null : '/admin/periods'),
  },

  sections: {
    description: 'Debes completar los pasos previos del proceso antes de acceder a esta vista.',
    blockedRedirectTo: (s, route) => {
      if (!s.activePeriod) return '/admin/periods';
      if (!s.run) return '/admin/leveling';

      const view = String(route.queryParamMap.get('view') ?? 'schedule')
        .trim()
        .toLowerCase();

      if (view === 'students') {
        const assigned = Number(s.metrics?.assignedInPeriod ?? s.metrics?.assigned ?? 0);
        if (assigned <= 0) return '/admin/matricula';
      }

      return null;
    },
  },

  matricula: {
    description:
      'Debes tener al menos una facultad lista (horarios y docentes completos) antes de acceder a Matricula.',
    blockedRedirectTo: (s) => {
      if (!s.activePeriod) return '/admin/periods';
      if (!s.run) return '/admin/leveling';
      const readyFaculties = Number(s.metrics?.readyFaculties ?? 0);
      if (readyFaculties <= 0) return '/admin/sections';
      return null;
    },
  },

  export: {
    description:
      'Debes tener al menos una facultad lista (horarios y docentes completos) antes de exportar.',
    blockedRedirectTo: (s) => {
      if (!s.activePeriod) return '/admin/periods';
      if (!s.run) return '/admin/leveling';
      const assigned = Number(s.metrics?.assignedInPeriod ?? s.metrics?.assigned ?? 0);
      const readyFaculties = Number(s.metrics?.readyFaculties ?? 0);
      if (readyFaculties <= 0 && assigned <= 0) return '/admin/sections';
      return null;
    },
  },

  'reports-program': {
    description: 'Debes aplicar estructura de nivelacion antes de ver este reporte.',
    blockedRedirectTo: (s) => {
      if (!s.activePeriod) return '/admin/periods';
      if (!s.run) return '/admin/leveling';
      return null;
    },
  },

  'reports-summary': {
    description: 'Debes aplicar estructura de nivelacion antes de ver este reporte.',
    blockedRedirectTo: (s) => {
      if (!s.activePeriod) return '/admin/periods';
      if (!s.run) return '/admin/leveling';
      return null;
    },
  },
};

export const workflowStepGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot
) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const http = inject(HttpClient);

  if (auth.user?.role !== Role.ADMIN) return true;

  const step = route.data['workflowStep'] as StepKey | undefined;
  if (!step || !(step in STEP_REQUIREMENTS)) return true;

  let summary: RunSummary;
  try {
    summary = await firstValueFrom(
      http.get<RunSummary>('/api/admin/leveling/active-run-summary')
    );
  } catch {
    console.warn('[workflowStepGuard] Could not reach active-run-summary, skipping guard.');
    return true;
  }

  const requirement = STEP_REQUIREMENTS[step];
  const redirectTo = requirement.blockedRedirectTo(summary, route);

  if (redirectTo) {
    return router.createUrlTree([redirectTo], {
      queryParams: { blocked: step, reason: requirement.description },
    });
  }

  return true;
};
