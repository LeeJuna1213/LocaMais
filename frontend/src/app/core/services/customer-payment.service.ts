import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CustomerPaymentApi, PaymentReceipt } from '../models';
import { ApiErrorService } from './api-error.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomerPaymentService {
  private readonly http = inject(HttpClient);
  private readonly errors = inject(ApiErrorService);
  private readonly _items = signal<CustomerPaymentApi[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  private get apiUrl(): string { return environment.apiUrl.replace(/\/+$/, ''); }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._items.set(await firstValueFrom(this.http.get<CustomerPaymentApi[]>(`${this.apiUrl}/pagamentos/meus`)));
    } catch (error) {
      this._items.set([]);
      this._error.set(this.errors.message(error, 'Não foi possível carregar seus pagamentos.'));
    } finally {
      this._loading.set(false);
    }
  }

  async receipt(paymentId: string): Promise<PaymentReceipt> {
    try {
      return await firstValueFrom(this.http.get<PaymentReceipt>(`${this.apiUrl}/pagamentos/${encodeURIComponent(paymentId)}/comprovante`));
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível consultar o comprovante.'));
    }
  }
}
