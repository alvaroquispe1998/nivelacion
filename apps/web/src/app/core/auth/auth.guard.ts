import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.token && auth.user) return true;

  // Try to hydrate user from /auth/me if token exists
  await auth.loadMe();
  if (auth.token && auth.user) return true;

  return router.createUrlTree(['/login']);
};

