import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';

export interface Shop {
  id: number; codigo: string; nome: string; telefone: string; email: string;
  logradouro: string; numero: string; complemento: string | null; bairro: string;
  cidade: string; uf: string; cep: string; ativa: boolean;
  created_at?: string;
  updated_at?: string;
}
export type ShopInput = Omit<Shop, 'id' | 'created_at' | 'updated_at'>;

const SHOP_WRITE_FIELDS: ReadonlyArray<keyof ShopInput> = [
  'codigo', 'nome', 'telefone', 'email', 'logradouro', 'numero', 'complemento',
  'bairro', 'cidade', 'uf', 'cep', 'ativa',
];

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

  async loadActive(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this._shops.set(await firstValueFrom(this.http.get<Shop[]>(`${this.url}/ativas`))); }
    catch (error) { this._shops.set([]); this.error.set(this.errors.message(error, 'Não foi possível carregar as lojas ativas.')); }
    finally { this.loading.set(false); }
  }

  async loadForVehicle(carId: number): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this._shops.set(await firstValueFrom(this.http.get<Shop[]>(`${environment.apiUrl.replace(/\/+$/, '')}/carros/${carId}/lojas`))); }
    catch (error) { this._shops.set([]); this.error.set(this.errors.message(error, 'Não foi possível carregar as lojas disponíveis para este veículo.')); }
    finally { this.loading.set(false); }
  }

  async save(input: Partial<ShopInput>, id?: number): Promise<Shop> {
    // Never forward API response fields (id/audit timestamps) into the strict
    // CreateLojaDto / UpdateLojaDto contract, even if a caller passes a Shop.
    const payload = Object.fromEntries(
      SHOP_WRITE_FIELDS
        .filter((field) => Object.prototype.hasOwnProperty.call(input, field))
        .map((field) => [field, input[field]]),
    ) as Partial<ShopInput>;
    try {
      const result = await firstValueFrom(id
        ? this.http.patch<Shop>(`${this.url}/${id}`, payload)
        : this.http.post<Shop>(this.url, payload));
      this._shops.update((shops) => id ? shops.map((shop) => shop.id === id ? result : shop) : [...shops, result]);
      return result;
    } catch (error) { throw new Error(this.errors.message(error, 'Não foi possível salvar a loja.')); }
  }
}
