import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable()
export class ApiBaseUrlInterceptor implements HttpInterceptor {
  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const base = environment.apiBaseUrl;
    if (!base || !req.url.startsWith('/api/')) {
      return next.handle(req);
    }
    return next.handle(req.clone({ url: `${base}${req.url}` }));
  }
}
