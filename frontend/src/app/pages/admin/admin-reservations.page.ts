import { Component, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { AdminReservationTab, ReservationService } from '../../core/services/reservation.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ReservationCardComponent } from '../../shared/components/reservation-card.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-admin-reservations',
  standalone: true,
  imports: [AppShellComponent, ReservationCardComponent, SegmentTabsComponent],
  template: `
    <app-shell title="Reservas" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="reservas">
      <app-segment-tabs variant="tabs" [options]="tabs" [active]="tab" (activeChange)="setTab($event)" />
      @if (vehicleFilter !== null) { <div class="card">Filtro por veículo #{{ vehicleFilter }} <button class="lnk dark" type="button" (click)="clearVehicleFilter()">Limpar filtro</button></div> }

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
            [adminActions]="true"
            (selected)="open($event)"
            (confirmRequested)="confirm($event)"
            (cancelRequested)="cancel($event)"
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
  private readonly alerts = inject(AlertController);
  private readonly toast = inject(ToastService);

  readonly tabs: AdminReservationTab[] = ['Todas', 'Pendentes', 'Confirmadas', 'Em andamento', 'Concluídas', 'Canceladas'];
  tab: AdminReservationTab = 'Todas';
  vehicleFilter: number | null = null;

  constructor() {
    void this.reservationService.load();

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const value = params.get('tab');
      if (this.tabs.includes(value as AdminReservationTab)) {
        this.tab = value as AdminReservationTab;
      }
      const carId = Number(params.get('carId'));
      this.vehicleFilter = Number.isInteger(carId) && carId > 0 ? carId : null;
    });
  }

  async load(): Promise<void> {
    await this.reservationService.load();
  }

  get reservations(): Reservation[] {
    const items = this.reservationService.adminList(this.tab);
    return this.vehicleFilter === null ? items : items.filter((item) => item.vehicleId === this.vehicleFilter);
  }

  vehicleOf(reservation: Reservation): Vehicle | undefined {
    return this.reservationService.vehicleOf(reservation);
  }

  async setTab(tab: string): Promise<void> {
    this.tab = tab as AdminReservationTab;
    await this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge' });
  }

  async clearVehicleFilter(): Promise<void> {
    this.vehicleFilter = null;
    await this.router.navigate([], { queryParams: { carId: null }, queryParamsHandling: 'merge' });
  }

  async open(reservation: Reservation): Promise<void> {
    await this.router.navigate(['/admin/reservas', reservation.id]);
  }

  async confirm(reservation: Reservation): Promise<void> {
    try {
      await this.reservationService.setStatus(reservation.id, 'confirmada');
      await this.toast.show('Reserva confirmada.');
    } catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível confirmar a reserva.'); }
  }

  async cancel(reservation: Reservation): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Cancelar reserva?', message: `Deseja cancelar a Reserva ${reservation.publicCode ?? reservation.id}?`,
      buttons: [
        { text: 'Voltar', role: 'cancel' },
        { text: 'Cancelar reserva', role: 'destructive', handler: () => { void this.cancelConfirmed(reservation); } },
      ],
    });
    await alert.present();
  }

  private async cancelConfirmed(reservation: Reservation): Promise<void> {
    try { await this.reservationService.cancel(reservation.id); await this.toast.show('Reserva cancelada.'); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível cancelar a reserva.'); }
  }

  async newReservation(): Promise<void> {
    await this.router.navigateByUrl('/admin/reserva');
  }
}
