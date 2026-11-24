import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { ClientReservationTab, ReservationService } from '../../core/services/reservation.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ReservationCardComponent } from '../../shared/components/reservation-card.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';

@Component({
  selector: 'app-my-reservations',
  standalone: true,
  imports: [AppShellComponent, ReservationCardComponent, SegmentTabsComponent],
  template: `
    <app-shell title="Minhas reservas" [showNav]="true" role="client" [activeTab]="activeTab">
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
            (payRequested)="pay($event)"
          />
        } @empty {
          <div class="card empty">
            Nenhuma reserva aqui.
            <button class="btn" type="button" (click)="newReservation()">Reservar um veículo</button>
          </div>
        }
      }
    </app-shell>
  `,
})
export class MyReservationsPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly reservationService = inject(ReservationService);

  readonly tabs: ClientReservationTab[] = ['Futuras', 'Em andamento', 'Histórico'];
  tab: ClientReservationTab = 'Futuras';

  constructor() {
    void this.reservationService.load();

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const value = params.get('tab');
      if (value === 'Futuras' || value === 'Em andamento' || value === 'Histórico') {
        this.tab = value;
      }
    });
  }

  async load(): Promise<void> {
    await this.reservationService.load();
  }

  get reservations(): Reservation[] {
    return this.reservationService.mine(this.tab);
  }

  get activeTab(): string {
    return this.tab === 'Histórico' ? 'historico' : 'reservas';
  }

  vehicleOf(reservation: Reservation): Vehicle | undefined {
    return this.reservationService.vehicleOf(reservation);
  }

  async setTab(tab: string): Promise<void> {
    this.tab = tab as ClientReservationTab;
    await this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  async open(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/client/reservas', reservation.id]);
  }

  async pay(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/booking/pagamento'], { queryParams: { id: reservation.id } });
  }

  async newReservation(): Promise<void> {
    await this.router.navigateByUrl('/client/veiculos');
  }
}
