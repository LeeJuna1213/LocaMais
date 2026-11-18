import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiSessionStore } from './api-session.store';

/** Marca explicitamente requisições públicas que não devem receber Bearer. */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

const PUBLIC_ENDPOINTS = ['/autenticacao/login', '/autenticacao/register'];

export const jwtInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(ApiSessionStore);
  const router = inject(Router);
  const apiBase = environment.apiUrl.replace(/\/+$/, '');
  const isApiRequest = request.url === apiBase || request.url.startsWith(`${apiBase}/`);
  const isPublicEndpoint = PUBLIC_ENDPOINTS.some((endpoint) => request.url.split('?')[0].endsWith(endpoint));
  const skipAuth = request.context.get(SKIP_AUTH) || isPublicEndpoint || !isApiRequest;
  const token = session.token();
  const outgoing = !skipAuth && token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (isApiRequest && !skipAuth && token && (error as { status?: number })?.status === 401) {
        const returnUrl = router.url;
        session.clear();
        if (returnUrl !== '/login') {
          void router.navigate(['/login'], { queryParams: { returnUrl } });
        }
      }
      return throwError(() => error);
    }),
  );
};
