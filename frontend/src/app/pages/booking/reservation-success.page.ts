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
        <h2 style="text-align: center">Reserva confirmada!</h2>
        <p style="text-align: center; font-size: 13px">Seu veículo foi reservado com sucesso.</p>

        <div class="card">
          <b>{{ vehicle.name }}</b>
          <div style="font-size: 12px; color: #7a5a40">{{ vehicle.version }}</div>
          <div class="kv"><span>Cliente</span><b>{{ clientName }}</b></div>
          <div class="kv">
            <span>Período</span>
            <b>{{ booking.start() | date: 'dd/MM/yyyy' }} - {{ booking.end() | date: 'dd/MM/yyyy' }}</b>
          </div>
          <div class="kv"><span>Valor total</span><b>{{ booking.total() | currency: 'BRL' }}</b></div>
        </div>

        <button class="btn" type="button" (click)="goToReservations()">
          {{ isAdmin ? 'Ver reservas' : 'Ver minhas reservas' }}
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

  readonly isAdmin = this.auth.role() === 'admin';

  get clientName(): string {
    return this.isAdmin ? this.booking.clientName() : this.auth.profile().name;
  }

  ngOnInit(): void {
    if (!this.booking.vehicle()) {
      void this.router.navigateByUrl(this.auth.home());
    }
  }

  async goToReservations(): Promise<void> {
    this.booking.reset();
    if (this.isAdmin) {
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
