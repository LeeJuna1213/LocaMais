import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { ApiSessionStore } from '../services/api-session.store';
import { authGuard, roleGuard } from './role.guard';

describe('auth guards', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), ApiSessionStore] });
  });

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/admin/painel' } as RouterStateSnapshot;

  it('envia visitante à página de login', async () => {
    const guard = TestBed.runInInjectionContext(() => authGuard(route, state));
    const result = await guard;
    expect(result instanceof Object).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>)).toContain('/login');
  });

  it('permite funcionário na área administrativa usando o tipo real', async () => {
    TestBed.inject(ApiSessionStore).setSession('staff-token', {
      id: 9,
      name: 'Funcionário',
      email: 'staff@example.test',
      active: true,
      type: 'funcionario',
      client: null,
    });
    const guard = TestBed.runInInjectionContext(() => roleGuard('admin')(route, state));
    await expect(guard).resolves.toBe(true);
  });

  it('redireciona cliente que tenta entrar na área administrativa', async () => {
    TestBed.inject(ApiSessionStore).setSession('client-token', {
      id: 2,
      name: 'Cliente',
      email: 'client@example.test',
      active: true,
      type: 'cliente',
      client: null,
    });
    const guard = TestBed.runInInjectionContext(() => roleGuard('admin')(route, state));
    const result = await guard;
    expect(TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>)).toContain('/client/veiculos');
  });
});
