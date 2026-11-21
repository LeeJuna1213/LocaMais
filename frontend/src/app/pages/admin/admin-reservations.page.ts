import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { AdminReservationTab, ReservationService } from '../../core/services/reservation.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ReservationCardComponent } from '../../shared/components/reservation-card.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-admin-reservations',
  standalone: true,
  imports: [AppShellComponent, ReservationCardComponent, SegmentTabsComponent],
  template: `
    <app-shell title="Reservas" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="reservas">
      <app-segment-tabs variant="tabs" [options]="tabs" [active]="tab" (activeChange)="setTab($event)" />

      @if (reservationService.loading()) {
        <div class="card empty" role="status">Carregando reservas...</div>
      } @else if (reservationService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="load()">Tentar novamente</button>
      } @else {
        @for (reservation of reservations; track reservation.id) {
          <app-reservation-card
            [reservation]="reservation"
            [vehicle]="vehicleOf(reservation)"
            (selected)="open($event)"
          />
        } @empty {
          <div class="card empty">Nenhuma reserva</div>
        }
      }

      <button class="btn" type="button" (click)="newReservation()">Nova reserva</button>
    </app-shell>
  `,
})
export class AdminReservationsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly reservationService = inject(ReservationService);

  readonly tabs: AdminReservationTab[] = ['Todas', 'Pendentes', 'Em andamento'];
  tab: AdminReservationTab = 'Todas';

  constructor() {
    void this.reservationService.load();

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const value = params.get('tab');
      if (value === 'Todas' || value === 'Pendentes' || value === 'Em andamento') {
        this.tab = value;
      }
    });
  }

  async load(): Promise<void> {
    await this.reservationService.load();
  }

  get reservations(): Reservation[] {
    return this.reservationService.adminList(this.tab);
  }

  vehicleOf(reservation: Reservation): Vehicle | undefined {
    return this.reservationService.vehicleOf(reservation);
  }

  async setTab(tab: string): Promise<void> {
    this.tab = tab as AdminReservationTab;
    await this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  async open(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/admin/reservas', reservation.id]);
  }

  async newReservation(): Promise<void> {
    await this.router.navigateByUrl('/admin/reserva');
  }
}
