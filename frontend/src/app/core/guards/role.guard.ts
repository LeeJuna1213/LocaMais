import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models';
import { AuthService } from '../services/auth.service';

export const roleGuard = (role: UserRole): CanActivateFn => async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restoreSession();
  if (auth.role() === role) return true;
  return auth.isLoggedIn() ? router.parseUrl(auth.home()) : router.parseUrl('/login');
};

/**
 * Permite acesso para ambos os papéis operacionais: admin e funcionário.
 * Clientes são redirecionados para sua área.
 */
export const staffGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.restoreSession();
  const role = auth.role();
  if (role === 'admin' || role === 'funcionario') return true;
  return auth.isLoggedIn() ? router.parseUrl(auth.home()) : router.parseUrl('/login');
};

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return await auth.restoreSession() ? true : router.parseUrl('/login');
};
