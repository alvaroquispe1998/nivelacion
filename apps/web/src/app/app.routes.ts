import { Route } from '@angular/router';
import { Role } from '@uai/shared';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

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
        path: 'admin/sections',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-sections.page').then(
            (m) => m.AdminSectionsPage
          ),
      },
      {
        path: 'admin/leveling',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-leveling.page').then(
            (m) => m.AdminLevelingPage
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
        path: 'admin/periods',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () =>
          import('./pages/admin-periods.page').then(
            (m) => m.AdminPeriodsPage
          ),
      },
      {
        path: 'admin/export',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
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
