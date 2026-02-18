import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Always validate token against backend before entering protected routes.
  if (auth.token) {
    const me = await auth.loadMe();
    if (auth.token && me) return true;
  }

  return router.createUrlTree(['/login']);
};
