import { Injectable, computed, inject } from '@angular/core';
import { PaymentMethod, Reservation } from '../models';
import { ReservationService } from './reservation.service';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly reservationService = inject(ReservationService);

  readonly methods: PaymentMethod[] = ['PIX', 'Cartão de crédito', 'Cartão de débito'];
  readonly pending = computed(() => this.reservationService.reservations().filter((reservation) => reservation.payment === 'Pendente'));
  readonly pendingCount = computed(() => this.pending().length);

  filter(tab: 'Todos' | 'Pendentes' | 'Pagos'): Reservation[] {
    return this.reservationService.reservations().filter((reservation) => {
      if (tab === 'Todos') {
        return true;
      }
      return tab === 'Pendentes' ? reservation.payment === 'Pendente' : reservation.payment === 'Pago';
    });
  }

  async receive(id: string): Promise<void> {
    await this.reservationService.receivePayment(id);
  }
}
