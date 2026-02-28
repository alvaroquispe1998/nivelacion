import { Route } from '@angular/router';
import { Role } from '@uai/shared';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { workflowStepGuard } from './core/auth/workflow-step.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/home-redirect.page').then((m) => m.HomeRedirectPage),
      },
      {
        path: 'student/schedule',
        canActivate: [roleGuard],
        data: { roles: [Role.ALUMNO] },
        loadComponent: () =>
          import('./pages/student-schedule.page').then(
            (m) => m.StudentSchedulePage
          ),
      },
      {
        path: 'student/attendance',
        canActivate: [roleGuard],
        data: { roles: [Role.ALUMNO] },
        loadComponent: () =>
          import('./pages/student-attendance.page').then(
            (m) => m.StudentAttendancePage
          ),
      },
      {
        path: 'student/grades',
        canActivate: [roleGuard],
        data: { roles: [Role.ALUMNO] },
        loadComponent: () =>
          import('./pages/student-grades.page').then(
            (m) => m.StudentGradesPage
          ),
      },
      {
        path: 'teacher/schedule',
        canActivate: [roleGuard],
        data: { roles: [Role.DOCENTE] },
        loadComponent: () =>
          import('./pages/teacher-schedule.page').then(
            (m) => m.TeacherSchedulePage
          ),
      },
      {
        path: 'teacher/attendance',
        canActivate: [roleGuard],
        data: { roles: [Role.DOCENTE] },
        loadComponent: () =>
          import('./pages/teacher-attendance.page').then(
            (m) => m.TeacherAttendancePage
          ),
      },
      {
        path: 'teacher/attendance/:sectionCourseId',
        canActivate: [roleGuard],
        data: { roles: [Role.DOCENTE] },
        loadComponent: () =>
          import('./pages/teacher-section-attendance.page').then(
            (m) => m.TeacherSectionAttendancePage
          ),
      },
      {
        path: 'teacher/grades',
        canActivate: [roleGuard],
        data: { roles: [Role.DOCENTE] },
        loadComponent: () =>
          import('./pages/teacher-grades.page').then(
            (m) => m.TeacherGradesPage
          ),
      },
      {
        path: 'teacher/grades/:sectionCourseId',
        canActivate: [roleGuard],
        data: { roles: [Role.DOCENTE] },
        loadComponent: () =>
          import('./pages/teacher-section-grades.page').then(
            (m) => m.TeacherSectionGradesPage
          ),
      },
      {
        path: 'admin/dashboard',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-dashboard.page').then(
            (m) => m.AdminDashboardPage
          ),
      },
      {
        // Step 1a - no extra requirement beyond being admin
        path: 'admin/periods',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-periods.page').then(
            (m) => m.AdminPeriodsPage
          ),
      },
      {
        // Step 1b - requires active period
        path: 'admin/leveling',
        canActivate: [roleGuard, workflowStepGuard],
        data: { roles: [Role.ADMIN], workflowStep: 'leveling' },
        loadComponent: () =>
          import('./pages/admin-leveling.page').then(
            (m) => m.AdminLevelingPage
          ),
      },
      {
        // Step 2 - requires leveling run to exist (applied)
        path: 'admin/sections',
        canActivate: [roleGuard, workflowStepGuard],
        data: { roles: [Role.ADMIN], workflowStep: 'sections' },
        loadComponent: () =>
          import('./pages/admin-sections.page').then(
            (m) => m.AdminSectionsPage
          ),
      },
      {
        path: 'admin/teachers',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-teachers.page').then(
            (m) => m.AdminTeachersPage
          ),
      },
      {
        path: 'admin/classrooms',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-classrooms.page').then(
            (m) => m.AdminClassroomsPage
          ),
      },
      {
        // Step 3 - preview/execute matricula by faculty
        path: 'admin/matricula',
        canActivate: [roleGuard, workflowStepGuard],
        data: { roles: [Role.ADMIN], workflowStep: 'matricula' },
        loadComponent: () =>
          import('./pages/admin-matricula.page').then(
            (m) => m.AdminMatriculaPage
          ),
      },
      {
        // Step 4a - requires assigned students > 0
        path: 'admin/export',
        canActivate: [roleGuard, workflowStepGuard],
        data: { roles: [Role.ADMIN], workflowStep: 'export' },
        loadComponent: () =>
          import('./pages/admin-export-assigned.page').then(
            (m) => m.AdminExportAssignedPage
          ),
      },
      {
        path: 'admin/sections/:id/schedule',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-section-schedule.page').then(
            (m) => m.AdminSectionSchedulePage
          ),
      },
      {
        path: 'admin/reports/program',
        canActivate: [roleGuard, workflowStepGuard],
        data: { roles: [Role.ADMIN], workflowStep: 'reports-program' },
        loadComponent: () =>
          import('./pages/admin-reports-program.page').then(
            (m) => m.AdminReportsProgramPage
          ),
      },
      {
        path: 'admin/reports/summary',
        canActivate: [roleGuard, workflowStepGuard],
        data: { roles: [Role.ADMIN], workflowStep: 'reports-summary' },
        loadComponent: () =>
          import('./pages/admin-reports-summary.page').then(
            (m) => m.AdminReportsSummaryPage
          ),
      },
      {
        path: 'admin/grades/config',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-grade-config.page').then(
            (m) => m.AdminGradeConfigPage
          ),
      },
      {
        path: 'admin/grades/reports/student',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-student-report.page').then(
            (m) => m.AdminStudentReportPage
          ),
      },
      {
        path: 'admin/grades/reports',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-grades-reports.page').then(
            (m) => m.AdminGradesReportsPage
          ),
      },
      {
        path: 'admin/grades',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-grades.page').then(
            (m) => m.AdminGradesPage
          ),
      },
      {
        path: 'admin/sections/:id/attendance',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-section-attendance.page').then(
            (m) => m.AdminSectionAttendancePage
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
