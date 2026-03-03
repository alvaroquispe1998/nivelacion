import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = this.auth.token;
    const request = token
      ? req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`,
          },
        })
      : req;

    return next.handle(request).pipe(
      catchError((err: HttpErrorResponse) => {
        // Forzamos cierre de sesión si el backend responde 401 con un token presente
        // para evitar quedar en un estado inconsistente con token expirado/invalidado.
        if (err.status === 401 && this.auth.token) {
          this.auth.logout();
          void this.router.navigate(['/login']);
        }
        return throwError(() => err);
      })
    );
  }
}
