import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';

export interface VehicleCategory { id: number; nome: string; }

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly errors = inject(ApiErrorService);
  private readonly _categories = signal<VehicleCategory[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly categories = this._categories.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private get url(): string { return `${environment.apiUrl.replace(/\/+$/, '')}/categorias`; }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const categories = await firstValueFrom(this.http.get<VehicleCategory[]>(this.url));
      this._categories.set(this.sorted(categories));
    } catch (error) {
      const message = this.errors.message(error, 'Não foi possível carregar as categorias.');
      this._error.set(message);
      throw new Error(message);
    } finally { this._loading.set(false); }
  }

  async create(nome: string): Promise<VehicleCategory> {
    const normalized = nome.trim().replace(/\s+/g, ' ');
    if (!normalized) throw new Error('Informe um nome de categoria.');
    try {
      const category = await firstValueFrom(this.http.post<VehicleCategory>(this.url, { nome: normalized }));
      this._categories.update((categories) => this.sorted([...categories.filter((item) => item.id !== category.id), category]));
      this._error.set(null);
      return category;
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível cadastrar a categoria.'));
    }
  }

  private sorted(categories: VehicleCategory[]): VehicleCategory[] {
    return [...categories].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
