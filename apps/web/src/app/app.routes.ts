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
