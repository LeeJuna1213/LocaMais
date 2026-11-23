import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PaymentMethod } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { ClientService } from '../../core/services/client.service';
import { PaymentService } from '../../core/services/payment.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiSessionStore } from '../../core/services/api-session.store';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe],
  template: `
    <app-shell title="Pagamento" [back]="true" defaultHref="/booking/confirmar">
      @if (booking.vehicle(); as vehicle) {
        <div class="card">
          <b style="font-size: 13px">Forma de pagamento prevista</b>
          <div style="margin-top: 8px">
            @for (method of paymentService.methods; track method) {
              <div class="rd" [class.on]="booking.method() === method" (click)="select(method)">
                {{ booking.method() === method ? '●' : '○' }} {{ method }}
              </div>
            }
          </div>

          <div class="kv"><span>Subtotal de diárias</span><b>{{ booking.total() | currency: 'BRL' }}</b></div>
          <div class="small muted">A taxa vigente será calculada pelo servidor e registrada na reserva. Esta tela ainda não processa cobrança.</div>

          <button class="btn" type="button" [disabled]="saving" (click)="pay()">
            {{ saving ? 'Confirmando...' : 'Confirmar reserva' }}
          </button>
          <div style="text-align: center; font-size: 11px; color: #7a5a40; margin-top: 8px">
            O processamento de pagamento disponível é demonstrativo e ocorre após a confirmação operacional.
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
  private readonly clientService = inject(ClientService);
  private readonly session = inject(ApiSessionStore);
  readonly booking = inject(BookingService);
  readonly paymentService = inject(PaymentService);
  private readonly reservationService = inject(ReservationService);
  private readonly toast = inject(ToastService);

  readonly isStaff = this.auth.role() === 'admin' || this.auth.role() === 'funcionario';
  saving = false;

  ngOnInit(): void {
    if (!this.booking.vehicle()) {
      void this.router.navigateByUrl(this.auth.home());
    }
  }

  select(method: PaymentMethod): void {
    this.booking.setMethod(method);
  }

  private async resolveClientId(): Promise<number> {
    if (this.isStaff) {
      const clientId = this.booking.clientId();
      if (clientId && this.clientService.activeClients().some((client) => client.id === clientId)) return clientId;
      throw new Error('Selecione um cliente ativo para a reserva.');
    }
    const sessionUser = this.session.user();
    const clientId = sessionUser?.client?.id;
    if (clientId) return clientId;
    throw new Error('Não foi possível identificar o cliente logado.');
  }

  async pay(): Promise<void> {
    if (this.saving) return;
    const vehicle = this.booking.vehicle();
    if (!vehicle) {
      await this.router.navigateByUrl(this.auth.home());
      return;
    }
    if (vehicle.status === 'Em manutenção') {
      await this.toast.show('Este veículo não está mais disponível');
      return;
    }
    const pickupShopId = this.booking.pickupShopId();
    if (!pickupShopId) {
      await this.toast.show('Selecione uma loja ativa para retirada.');
      return;
    }

    try {
      const clientId = await this.resolveClientId();
      this.saving = true;
          const reservation = await this.reservationService.create({
        clientId,
        vehicleId: vehicle.id,
        start: this.booking.start(),
        end: this.booking.end(),
        pickupTime: this.booking.pickupTime(),
        returnTime: this.booking.returnTime(),
        pickupShopId,
        quotedServiceFee: this.booking.quotedServiceFee(),
      });
      this.booking.setCreatedReservation(reservation);
      await this.router.navigateByUrl('/booking/sucesso');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível criar a reserva.');
    } finally {
      this.saving = false;
    }
  }
}
