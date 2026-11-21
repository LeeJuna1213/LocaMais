import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';

export interface Shop {
  id: number; codigo: string; nome: string; telefone: string; email: string;
  logradouro: string; numero: string; complemento: string | null; bairro: string;
  cidade: string; uf: string; cep: string; ativa: boolean;
}
export type ShopInput = Omit<Shop, 'id'>;

@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly errors = inject(ApiErrorService);
  private readonly _shops = signal<Shop[]>([]);
  readonly shops = this._shops.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private get url(): string { return `${environment.apiUrl.replace(/\/+$/, '')}/lojas`; }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this._shops.set(await firstValueFrom(this.http.get<Shop[]>(this.url))); }
    catch (error) { this._shops.set([]); this.error.set(this.errors.message(error, 'Não foi possível carregar as lojas.')); }
    finally { this.loading.set(false); }
  }

  async save(input: Partial<ShopInput>, id?: number): Promise<Shop> {
    try {
      const result = await firstValueFrom(id
        ? this.http.patch<Shop>(`${this.url}/${id}`, input)
        : this.http.post<Shop>(this.url, input));
      this._shops.update((shops) => id ? shops.map((shop) => shop.id === id ? result : shop) : [...shops, result]);
      return result;
    } catch (error) { throw new Error(this.errors.message(error, 'Não foi possível salvar a loja.')); }
  }
}
