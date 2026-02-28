import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import type { Role } from '@uai/shared';
import { AuthService } from './auth.service';

export const roleGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const roles = (route.data['roles'] as Role[] | undefined) ?? [];
  if (roles.length === 0) return true;

  if (!auth.user && auth.token) {
    await auth.loadMe();
  }

  const role = auth.user?.role;
  if (role && roles.includes(role as Role)) return true;

  return router.createUrlTree(['/login']);
};
