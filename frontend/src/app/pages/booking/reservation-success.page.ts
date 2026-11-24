import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-reservation-success',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe, DatePipe],
  template: `
    <app-shell>
      @if (booking.vehicle(); as vehicle) {
        <div class="ok">✓</div>
        <h2 style="text-align: center">Reserva registrada</h2>
        <p style="text-align: center; font-size: 13px">A reserva foi persistida pela API e aguarda confirmação operacional.</p>

        <div class="card">
          <b>{{ vehicle.name }}</b>
          @if (booking.createdReservation(); as reservation) {
            <div class="kv"><span>Reserva</span><b>{{ friendlyCode(reservation.publicCode) }}</b></div>
            <div class="kv"><span>Status</span><b>{{ reservation.status }}</b></div>
            <div class="kv"><span>Subtotal</span><b>{{ reservation.subtotal | currency: 'BRL' }}</b></div>
            <div class="kv"><span>Taxa de serviço</span><b>{{ reservation.serviceFee | currency: 'BRL' }}</b></div>
            <div class="kv"><span>Valor total</span><b>{{ reservation.total | currency: 'BRL' }}</b></div>
          }
          <div style="font-size: 12px; color: #7a5a40">{{ vehicle.version }}</div>
          <div class="kv"><span>Cliente</span><b>{{ clientName }}</b></div>
          <div class="kv">
            <span>Período</span>
            <b>{{ booking.start() | date: 'dd/MM/yyyy' }} {{ booking.pickupTime() }} - {{ booking.end() | date: 'dd/MM/yyyy' }} {{ booking.returnTime() }}</b>
          </div>
        </div>

        <button class="btn" type="button" (click)="goToReservations()">
          {{ isStaff ? 'Ver reservas' : 'Ver minhas reservas' }}
        </button>
        <button class="lnk" type="button" (click)="goHome()">Voltar ao início</button>
      } @else {
        <div class="card empty">Nenhuma reserva confirmada</div>
      }
    </app-shell>
  `,
})
export class ReservationSuccessPage implements OnInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly booking = inject(BookingService);

  readonly isStaff = this.auth.role() === 'admin' || this.auth.role() === 'funcionario';

  get clientName(): string {
    return this.isStaff ? this.booking.clientName() : this.auth.profile().name;
  }

  friendlyCode(code?: string | null): string {
    return code ?? '—';
  }

  ngOnInit(): void {
    if (!this.booking.vehicle()) {
      void this.router.navigateByUrl(this.auth.home());
    }
  }

  async goToReservations(): Promise<void> {
    this.booking.reset();
    if (this.isStaff) {
      await this.router.navigate(['/admin/reservas'], { queryParams: { tab: 'Todas' } });
    } else {
      await this.router.navigate(['/client/minhas'], { queryParams: { tab: 'Futuras' } });
    }
  }

  async goHome(): Promise<void> {
    this.booking.reset();
    await this.router.navigateByUrl(this.auth.home());
  }
}
