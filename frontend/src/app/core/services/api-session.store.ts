import { Injectable, computed, inject, signal } from '@angular/core';

import type { UsuarioApi } from '../models/api.models';
import { TokenStorageService } from './token-storage.service';

/** Estado de sessão compartilhado entre autenticação, guard e interceptor. */
@Injectable({ providedIn: 'root' })
export class ApiSessionStore {
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly _token = signal<string | null>(this.tokenStorage.get());
  private readonly _user = signal<UsuarioApi | null>(null);
  private readonly _initialized = signal(false);

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null && this._user() !== null);

  setSession(token: string, user: UsuarioApi): void {
    this.tokenStorage.set(token);
    this._token.set(token);
    this._user.set(user);
    this._initialized.set(true);
  }

  setUser(user: UsuarioApi): void {
    this._user.set(user);
    this._initialized.set(true);
  }

  markInitialized(): void {
    this._initialized.set(true);
  }

  clear(): void {
    this.tokenStorage.clear();
    this._token.set(null);
    this._user.set(null);
    this._initialized.set(true);
  }
}
