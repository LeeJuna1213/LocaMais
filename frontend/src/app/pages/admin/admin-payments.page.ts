import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Reservation } from '../../core/models';
import { PaymentService } from '../../core/services/payment.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { BadgeComponent } from '../../shared/components/badge.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [AppShellComponent, BadgeComponent, SegmentTabsComponent, CurrencyPipe],
  template: `
    <app-shell title="Pagamentos" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <app-segment-tabs variant="tabs" [options]="tabs" [active]="tab" (activeChange)="setTab($event)" />

      @if (reservationService.loading()) {
        <div class="card empty" role="status">Carregando pagamentos...</div>
      } @else if (reservationService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else {
        @for (reservation of reservations; track reservation.id) {
          <div class="card row card-click" (click)="receive(reservation)">
            <div>
              <b>#{{ reservation.id }} - {{ reservation.clientName }}</b>
              <div class="pr">{{ reservation.total | currency: 'BRL' }}</div>
              @if (reservation.payment === 'Pendente') {
                <div style="font-size: 11px; color: #7a5a40">Toque para receber</div>
              }
            </div>
            <app-badge [status]="reservation.payment" />
          </div>
        } @empty {
          <div class="card empty">Nada por aqui</div>
        }
      }
    </app-shell>
  `,
})
export class AdminPaymentsPage {
  private readonly router = inject(Router);
  readonly paymentService = inject(PaymentService);
  readonly reservationService = inject(ReservationService);
  private readonly toast = inject(ToastService);

  readonly tabs = ['Todos', 'Pendentes', 'Pagos'];
  tab: 'Todos' | 'Pendentes' | 'Pagos' = 'Todos';

  constructor() {
    void this.reservationService.load();
  }

  async load(): Promise<void> {
    await this.reservationService.load();
  }

  get reservations(): Reservation[] {
    return this.paymentService.filter(this.tab);
  }

  async setTab(tab: string): Promise<void> {
    this.tab = tab as 'Todos' | 'Pendentes' | 'Pagos';
    await this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  async receive(reservation: Reservation): Promise<void> {
    if (reservation.payment !== 'Pendente') {
      return;
    }
    await this.paymentService.receive(reservation.id);
    await this.toast.show('Pagamento recebido');
  }
}
