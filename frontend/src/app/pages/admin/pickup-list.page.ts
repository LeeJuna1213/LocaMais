import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { ReservationService } from '../../core/services/reservation.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ReservationCardComponent } from '../../shared/components/reservation-card.component';

@Component({
  selector: 'app-pickup-list',
  standalone: true,
  imports: [AppShellComponent, ReservationCardComponent],
  template: `
    <app-shell
      title="Locações (retirada)"
      [back]="true"
      defaultHref="/admin/menu"
      [showNav]="true"
      role="admin"
      activeTab="reservas"
    >
      @for (reservation of reservations; track reservation.id) {
        <app-reservation-card
          [reservation]="reservation"
          [vehicle]="vehicleOf(reservation)"
          (selected)="open($event)"
        />
      } @empty {
        <div class="card empty">Nenhuma reserva aguardando retirada</div>
      }
    </app-shell>
  `,
})
export class PickupListPage {
  private readonly router = inject(Router);
  private readonly reservationService = inject(ReservationService);

  get reservations(): Reservation[] {
    return this.reservationService.byStatus('Confirmada');
  }

  vehicleOf(reservation: Reservation): Vehicle | undefined {
    return this.reservationService.vehicleOf(reservation);
  }

  async open(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/admin/retirada', reservation.id]);
  }
}
