import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Reservation, UserRole, Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { BadgeComponent } from '../../shared/components/badge.component';

@Component({
  selector: 'app-reservation-details',
  standalone: true,
  imports: [AppShellComponent, BadgeComponent, CurrencyPipe, DatePipe],
  template: `
    <app-shell
      [title]="'Reserva #' + id"
      [back]="true"
      [defaultHref]="backHref"
      [showNav]="true"
      [role]="role"
      activeTab="reservas"
    >
      @if (reservation; as r) {
        <div class="card">
          <div class="row">
            <b>{{ vehicle?.name }}</b>
            <app-badge [status]="r.status" />
          </div>
          <div class="kv"><span>Cliente</span><b>{{ r.clientName }}</b></div>
          <div class="kv">
            <span>Período</span><b>{{ r.start | date: 'dd/MM/yyyy' }} - {{ r.end | date: 'dd/MM/yyyy' }}</b>
          </div>
          <div class="kv"><span>Valor</span><b>{{ r.total | currency: 'BRL' }}</b></div>
          <div class="kv"><span>Pagamento</span><b>{{ r.payment }}</b></div>

          @if (isAdmin && r.status === 'Confirmada') {
            <button class="btn" type="button" (click)="registerPickup(r)">Registrar retirada</button>
          }
          @if (isAdmin && r.status === 'Em andamento') {
            <button class="btn" type="button" (click)="registerReturn(r)">Registrar devolução</button>
          }
          @if (r.status === 'Confirmada') {
            <button class="btn red" type="button" (click)="cancel(r)">
              {{ confirmCancel ? 'Toque de novo para confirmar' : 'Cancelar reserva' }}
            </button>
          }
        </div>
      } @else {
        <div class="card empty">Reserva não encontrada</div>
      }
    </app-shell>
  `,
})
export class ReservationDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly reservationService = inject(ReservationService);
  private readonly toast = inject(ToastService);

  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  readonly isAdmin = this.auth.role() === 'admin';
  confirmCancel = false;

  get role(): UserRole {
    return this.isAdmin ? 'admin' : 'client';
  }

  get backHref(): string {
    return this.isAdmin ? '/admin/reservas' : '/client/minhas';
  }

  get reservation(): Reservation | undefined {
    return this.reservationService.getById(this.id);
  }

  get vehicle(): Vehicle | undefined {
    const reservation = this.reservation;
    return reservation ? this.reservationService.vehicleOf(reservation) : undefined;
  }

  async cancel(reservation: Reservation): Promise<void> {
    if (!this.confirmCancel) {
      this.confirmCancel = true;
      return;
    }
    await this.reservationService.cancel(reservation.id);
    this.confirmCancel = false;
    await this.toast.show('Reserva cancelada');
  }

  async registerPickup(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/admin/retirada', reservation.id]);
  }

  async registerReturn(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/admin/devolucao', reservation.id]);
  }
}
