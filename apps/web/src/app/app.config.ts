import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { appRoutes } from './app.routes';
import { AuthInterceptor } from './core/auth/auth.interceptor';
import { AdminPeriodInterceptor } from './core/workflow/admin-period.interceptor';
import { ApiBaseUrlInterceptor } from './core/http/api-base-url.interceptor';
import { LazyChunkRecoveryService } from './core/navigation/lazy-chunk-recovery.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      appRoutes,
      withNavigationErrorHandler((navigationError) => {
        const lazyChunkRecovery = inject(LazyChunkRecoveryService);
        if (
          lazyChunkRecovery.isRecoverableChunkError(navigationError.error) &&
          lazyChunkRecovery.recoverFromChunkError()
        ) {
          return;
        }

        throw navigationError;
      })
    ),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiBaseUrlInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AdminPeriodInterceptor,
      multi: true,
    },
  ]
};
