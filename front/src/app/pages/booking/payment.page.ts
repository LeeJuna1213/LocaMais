import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PaymentMethod } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { PaymentService } from '../../core/services/payment.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe],
  template: `
    <app-shell title="Pagamento" [back]="true" defaultHref="/booking/confirmar">
      @if (booking.vehicle(); as vehicle) {
        <div class="card">
          <b style="font-size: 13px">Forma de pagamento</b>
          <div style="margin-top: 8px">
            @for (method of paymentService.methods; track method) {
              <div class="rd" [class.on]="booking.method() === method" (click)="select(method)">
                {{ booking.method() === method ? '●' : '○' }} {{ method }}
              </div>
            }
          </div>

          <div class="kv"><span>Valor da locação</span><b>{{ booking.total() | currency: 'BRL' }}</b></div>
          <div class="kv"><span>Taxa de serviço</span><b>{{ 0 | currency: 'BRL' }}</b></div>
          <div class="kv"><span>Total</span><b>{{ booking.total() | currency: 'BRL' }}</b></div>

          <button class="btn" type="button" (click)="pay()">
            Pagar {{ booking.total() | currency: 'BRL' }}
          </button>
          <div style="text-align: center; font-size: 11px; color: #7a5a40; margin-top: 8px">
            Pagamento seguro via gateway
          </div>
        </div>
      } @else {
        <div class="card empty">Nenhum pagamento em andamento</div>
      }
    </app-shell>
  `,
})
export class PaymentPage implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly reservationService = inject(ReservationService);
  readonly booking = inject(BookingService);
  readonly paymentService = inject(PaymentService);
  private readonly toast = inject(ToastService);

  readonly isAdmin = this.auth.role() === 'admin';

  ngOnInit(): void {
    if (!this.booking.vehicle()) {
      void this.router.navigateByUrl(this.auth.home());
    }
  }

  select(method: PaymentMethod): void {
    this.booking.setMethod(method);
  }

  async pay(): Promise<void> {
    const vehicle = this.booking.vehicle();
    if (!vehicle) {
      await this.router.navigateByUrl(this.auth.home());
      return;
    }
    if (vehicle.status !== 'Disponível') {
      await this.toast.show('Este veículo não está mais disponível');
      return;
    }

    await this.reservationService.create({
      clientName: this.isAdmin ? this.booking.clientName() : this.auth.profile().name,
      mine: !this.isAdmin,
      vehicleId: vehicle.id,
      start: this.booking.start(),
      end: this.booking.end(),
      total: this.booking.total(),
      paymentMethod: this.booking.method(),
    });

    await this.router.navigateByUrl('/booking/sucesso');
  }
}
