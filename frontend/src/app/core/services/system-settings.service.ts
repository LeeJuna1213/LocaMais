import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorService } from './api-error.service';

@Injectable({ providedIn: 'root' })
export class SystemSettingsService {
  private readonly http = inject(HttpClient);
  private readonly errors = inject(ApiErrorService);
  readonly serviceFee = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private get url(): string { return `${environment.apiUrl.replace(/\/+$/, '')}/configuracoes/taxa-servico`; }

  async load(): Promise<number> {
    this.loading.set(true); this.error.set(null);
    try { const { valor } = await firstValueFrom(this.http.get<{ valor: number }>(this.url)); this.serviceFee.set(Number(valor)); return Number(valor); }
    catch (error) { const message = this.errors.message(error, 'Não foi possível carregar a taxa de serviço.'); this.error.set(message); throw new Error(message); }
    finally { this.loading.set(false); }
  }

  async save(valor: number): Promise<number> {
    try { const result = await firstValueFrom(this.http.patch<{ valor: number }>(this.url, { valor })); this.serviceFee.set(Number(result.valor)); return Number(result.valor); }
    catch (error) { throw new Error(this.errors.message(error, 'Não foi possível salvar a taxa de serviço.')); }
  }
}
