import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';
import { Usuario, ApiUserType } from '../models';

export interface CreateUsuarioInput {
  name: string;
  email: string;
  password: string;
  type: 'admin' | 'funcionario';
}

export interface UpdateUsuarioInput {
  name?: string;
  email?: string;
  password?: string;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly http = inject(HttpClient);
  private readonly apiErrors = inject(ApiErrorService);
  private readonly _usuarios = signal<Usuario[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly usuarios = this._usuarios.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private get apiUrl(): string {
    return environment.apiUrl.replace(/\/+$/, '');
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const items = await firstValueFrom<Usuario[]>(
        this.http.get<Usuario[]>(`${this.apiUrl}/usuarios`),
      );
      this._usuarios.set(items);
    } catch (error) {
      this._usuarios.set([]);
      this._error.set(this.apiErrors.message(error, 'Não foi possível carregar os funcionários.'));
    } finally {
      this._loading.set(false);
    }
  }

  async create(input: CreateUsuarioInput): Promise<Usuario> {
    try {
      const usuario = await firstValueFrom<Usuario>(
        this.http.post<Usuario>(`${this.apiUrl}/usuarios`, {
          name: input.name,
          email: input.email,
          password: input.password,
          type: input.type,
        }),
      );
      this._usuarios.update((list) => [...list, usuario]);
      return usuario;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível cadastrar o funcionário.'));
    }
  }

  async update(id: number, input: UpdateUsuarioInput): Promise<Usuario> {
    try {
      const usuario = await firstValueFrom<Usuario>(
        this.http.patch<Usuario>(`${this.apiUrl}/usuarios/${id}`, input),
      );
      this._usuarios.update((list) =>
        list.map((u) => (u.id === id ? usuario : u)),
      );
      return usuario;
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível atualizar o funcionário.'));
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await firstValueFrom<void>(
        this.http.delete<void>(`${this.apiUrl}/usuarios/${id}`),
      );
      this._usuarios.update((list) => list.filter((u) => u.id !== id));
    } catch (error) {
      throw new Error(this.apiErrors.message(error, 'Não foi possível desativar o funcionário.'));
    }
  }
}
