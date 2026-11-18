import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { ApiSessionStore } from './api-session.store';
import { jwtInterceptor, SKIP_AUTH } from './api.interceptor';

describe('jwtInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let session: ApiSessionStore;
  let router: { url: string; navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { url: '/client/veiculos', navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        ApiSessionStore,
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    session = TestBed.inject(ApiSessionStore);
  });

  afterEach(() => httpTesting.verify());

  it('anexa o Bearer Token somente às requisições da API', () => {
    session.setSession('jwt-test', {
      id: 8,
      name: 'Cliente',
      email: 'cliente@example.test',
      active: true,
      type: 'cliente',
      client: null,
    });

    http.get(`${environment.apiUrl}/carros`).subscribe();

    const request = httpTesting.expectOne(`${environment.apiUrl}/carros`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt-test');
    request.flush([]);

    http.get('https://static.example.test/data').subscribe();
    const externalRequest = httpTesting.expectOne('https://static.example.test/data');
    expect(externalRequest.request.headers.has('Authorization')).toBe(false);
    externalRequest.flush({});
  });

  it('não anexa token aos endpoints públicos de autenticação', () => {
    session.setSession('existing-token', {
      id: 8,
      name: 'Cliente',
      email: 'cliente@example.test',
      active: true,
      type: 'cliente',
      client: null,
    });

    http.post(`${environment.apiUrl}/autenticacao/login`, {}, {
      context: new HttpContext().set(SKIP_AUTH, true),
    }).subscribe();

    const request = httpTesting.expectOne(`${environment.apiUrl}/autenticacao/login`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('limpa a sessão e redireciona para login em 401 protegido', () => {
    session.setSession('expired-token', {
      id: 8,
      name: 'Cliente',
      email: 'cliente@example.test',
      active: true,
      type: 'cliente',
      client: null,
    });

    http.get(`${environment.apiUrl}/autenticacao/me`).subscribe({ error: () => undefined });
    httpTesting.expectOne(`${environment.apiUrl}/autenticacao/me`).flush(
      { message: 'unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(session.token()).toBeNull();
    expect(session.user()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/client/veiculos' } });
  });
});
