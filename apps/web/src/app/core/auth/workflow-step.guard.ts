/**
 * workflow-step.guard.ts
 *
 * Enforces the admin sequential workflow:
 *
 *   1. Periodos       → needs: active period              (always accessible if admin)
 *   2. Nivelación     → needs: active period              → redirect /admin/periods
 *   3. Horarios       → needs: leveling run applied       → redirect /admin/leveling
 *   4. Matrícula      → needs: run status = MATRICULATED  → redirect /admin/sections
 *   5. Exportar       → needs: assigned students > 0      → redirect /admin/matricula
 *   6. Alumnos/Sección→ needs: assigned students > 0      → redirect /admin/matricula
 *
 * Uses GET /api/admin/leveling/active-run-summary which returns:
 *   { activePeriod, run: { id, status }, metrics: { assigned, … } }
 */

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

// ─── Shape of the summary endpoint ───────────────────────────────────────────

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
    } | null;
}

// ─── Step requirements (keyed by the route path fragment) ─────────────────────

type StepKey = 'leveling' | 'sections' | 'matricula' | 'export' | 'sections-report';

interface StepRequirement {
    /** Human-readable description shown in the redirect state */
    description: string;
    /** Returns the redirect path if the requirement is NOT met, null if OK */
    blockedRedirectTo: (summary: RunSummary) => string | null;
}

const STEP_REQUIREMENTS: Record<StepKey, StepRequirement> = {
    /** Step 1b – Nivelación: needs an active period */
    leveling: {
        description: 'Debe haber un periodo activo antes de ejecutar la nivelación.',
        blockedRedirectTo: (s) => (s.activePeriod ? null : '/admin/periods'),
    },

    /** Step 2 – Horarios y Docentes: needs a leveling run that was applied */
    sections: {
        description: 'Debe ejecutar y aplicar la nivelación antes de acceder a Horarios y Docentes.',
        blockedRedirectTo: (s) => {
            if (!s.activePeriod) return '/admin/periods';
            if (!s.run) return '/admin/leveling';
            return null;
        },
    },

    /** Step 3 – Matrícula: needs run to be in MATRICULATED status */
    matricula: {
        description: 'Debe ejecutar la matrícula desde la página de Nivelación primero.',
        blockedRedirectTo: (s) => {
            if (!s.activePeriod) return '/admin/periods';
            if (!s.run) return '/admin/leveling';
            if (s.run.status !== 'MATRICULATED') return '/admin/leveling';
            return null;
        },
    },

    /** Step 4a – Exportar: needs students assigned (matriculated) */
    export: {
        description: 'No hay datos de matrícula para exportar. Complete la matrícula primero.',
        blockedRedirectTo: (s) => {
            if (!s.activePeriod) return '/admin/periods';
            if (!s.run) return '/admin/leveling';
            if (s.run.status !== 'MATRICULATED') return '/admin/leveling';
            if (!s.metrics || s.metrics.assigned === 0) return '/admin/matricula';
            return null;
        },
    },

    /** Step 4b – Alumnos por Sección: same as export */
    'sections-report': {
        description: 'No hay alumnos asignados todavía. Complete la matrícula primero.',
        blockedRedirectTo: (s) => {
            if (!s.activePeriod) return '/admin/periods';
            if (!s.run) return '/admin/leveling';
            if (s.run.status !== 'MATRICULATED') return '/admin/leveling';
            if (!s.metrics || s.metrics.assigned === 0) return '/admin/matricula';
            return null;
        },
    },
};

// ─── Guard factory ───────────────────────────────────────────────────────────

/**
 * Usage in routes:
 *   canActivate: [roleGuard, workflowStepGuard],
 *   data: { roles: [Role.ADMIN], workflowStep: 'sections' }
 */
export const workflowStepGuard: CanActivateFn = async (
    route: ActivatedRouteSnapshot
) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const http = inject(HttpClient);

    // Only applies to admins; non-admins are handled by roleGuard
    if (auth.user?.role !== Role.ADMIN) return true;

    const step = route.data['workflowStep'] as StepKey | undefined;
    if (!step || !(step in STEP_REQUIREMENTS)) return true; // no restriction defined

    let summary: RunSummary;
    try {
        summary = await firstValueFrom(
            http.get<RunSummary>('/api/admin/leveling/active-run-summary')
        );
    } catch {
        // If the API is unreachable, let the route through (don't block user silently)
        console.warn('[workflowStepGuard] Could not reach active-run-summary, skipping guard.');
        return true;
    }

    const requirement = STEP_REQUIREMENTS[step];
    const redirectTo = requirement.blockedRedirectTo(summary);

    if (redirectTo) {
        return router.createUrlTree([redirectTo], {
            queryParams: { blocked: step, reason: requirement.description },
        });
    }

    return true;
};
