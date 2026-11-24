import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CustomerPaymentApi, PaymentReceipt } from '../models';
import { ApiErrorService } from './api-error.service';
import { environment } from '../../../environments/environment';

export type OperationalPaymentTab = 'Todos' | 'Pendentes' | 'Realizados';
export type PaymentStatusFilter = CustomerPaymentApi['status'] | '';
export interface PaymentFilters { status?: PaymentStatusFilter; de?: string; ate?: string }

export function filterPayments(payments: CustomerPaymentApi[], filters: PaymentFilters = {}): CustomerPaymentApi[] {
  return payments.filter((payment) => {
    if (filters.status && payment.status !== filters.status) return false;
    const paymentDay = new Date(payment.data);
    if (Number.isNaN(paymentDay.getTime())) return false;
    const day = paymentDay.toISOString().slice(0, 10);
    if (filters.de && day < filters.de) return false;
    if (filters.ate && day > filters.ate) return false;
    return true;
  });
}

export function isPendingPayment(payment: CustomerPaymentApi): boolean {
  return payment.status === 'pendente';
}

export function filterOperationalPayments(
  payments: CustomerPaymentApi[],
  tab: OperationalPaymentTab,
): CustomerPaymentApi[] {
  return payments.filter((payment) => {
    if (tab === 'Pendentes') return isPendingPayment(payment);
    if (tab === 'Realizados') return payment.status === 'aprovado';
    return true;
  });
}

export function countPendingPayments(payments: CustomerPaymentApi[]): number {
  return payments.filter(isPendingPayment).length;
}

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

  async initiate(reservationId: string, metodo: string): Promise<CustomerPaymentApi> {
    try {
      return await firstValueFrom(this.http.post<CustomerPaymentApi>(`${this.apiUrl}/pagamentos/meus`, {
        reservation_id: reservationId,
        metodo,
      }));
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível iniciar o pagamento.'));
    }
  }

  async load(filters: PaymentFilters = {}): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._items.set(await firstValueFrom(this.http.get<CustomerPaymentApi[]>(`${this.apiUrl}/pagamentos/meus`, { params: this.toParams(filters) })));
    } catch (error) {
      this._items.set([]);
      this._error.set(this.errors.message(error, 'Não foi possível carregar seus pagamentos.'));
    } finally {
      this._loading.set(false);
    }
  }

  async loadOperational(filters: PaymentFilters = {}): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      this._items.set(await firstValueFrom(this.http.get<CustomerPaymentApi[]>(`${this.apiUrl}/pagamentos`, { params: this.toParams(filters) })));
    } catch (error) {
      this._items.set([]);
      this._error.set(this.errors.message(error, 'Não foi possível carregar os pagamentos.'));
    } finally {
      this._loading.set(false);
    }
  }

  async confirm(paymentId: string): Promise<CustomerPaymentApi> {
    try {
      return await firstValueFrom(this.http.patch<CustomerPaymentApi>(`${this.apiUrl}/pagamentos/${encodeURIComponent(paymentId)}/confirmar`, {}));
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível processar o pagamento.'));
    }
  }

  async receipt(paymentId: string): Promise<PaymentReceipt> {
    try {
      return await firstValueFrom(this.http.get<PaymentReceipt>(`${this.apiUrl}/pagamentos/${encodeURIComponent(paymentId)}/comprovante`));
    } catch (error) {
      throw new Error(this.errors.message(error, 'Não foi possível consultar o comprovante.'));
    }
  }

  private toParams(filters: PaymentFilters) {
    const entries = Object.entries(filters).filter(([, value]) => typeof value === 'string' && value.length > 0);
    return entries.reduce((query, [key, value]) => query.set(key, value as string), new HttpParams());
  }
}
