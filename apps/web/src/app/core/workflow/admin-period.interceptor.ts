import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminPeriodContextService } from './admin-period-context.service';

@Injectable()
export class AdminPeriodInterceptor implements HttpInterceptor {
  constructor(private readonly adminPeriodContext: AdminPeriodContextService) {}

  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    if (!this.isAdminApiRequest(req.url)) {
      return next.handle(req);
    }

    const periodId = this.adminPeriodContext.getSelectedPeriodId();
    if (!periodId) {
      return next.handle(req);
    }

    return next.handle(
      req.clone({
        setHeaders: {
          'x-admin-period-id': periodId,
        },
      })
    );
  }

  private isAdminApiRequest(url: string): boolean {
    const value = String(url ?? '').trim().toLowerCase();
    return value.startsWith('/api/admin/');
  }
}

