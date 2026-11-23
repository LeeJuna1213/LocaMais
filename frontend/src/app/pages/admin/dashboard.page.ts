import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ReservationService } from '../../core/services/reservation.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CurrencyPipe } from '@angular/common';
import { CustomerPaymentService, countPendingPayments } from '../../core/services/customer-payment.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe],
  template: `
    <app-shell title="Painel administrativo" [logo]="true" [showNav]="true" role="admin" activeTab="inicio">
      <div class="st">
        <div class="card" (click)="go('/admin/veiculos')">
          <b>{{ vehicleService.availableCount() }}</b>Disponíveis
        </div>
        <div class="card" (click)="go('/admin/devolucoes')">
          <b>{{ vehicleService.rentedCount() }}</b>Alugados
        </div>
        <div class="card" (click)="go('/admin/veiculos')">
          <b>{{ vehicleService.maintenanceCount() }}</b>Em manutenção
        </div>
        <div class="card" (click)="go('/admin/locacoes')">
          <b>{{ reservationService.pendingPickups() }}</b>Retiradas pendentes
        </div>
      </div>

      <div class="card report-card" style="margin-top: 16px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px">Relatório JPA (Resumo)</h3>
        <div class="kv"><span>Receita (sem canceladas)</span><b>{{ revenue | currency: 'BRL' }}</b></div>
        <div class="kv"><span>Reservas totais</span><b>{{ reservations.length }}</b></div>
        <div class="kv"><span>Canceladas</span><b>{{ canceledCount }}</b></div>
        <div class="kv"><span>Pagamentos pendentes</span><b>{{ pendingPayments }}</b></div>
        <label style="margin-top: 10px">Ocupação da frota: {{ occupancy }}%</label>
        <div class="bar"><i [style.width.%]="occupancy"></i></div>
        <div style="margin-top: 10px">
          <button class="btn" type="button" (click)="go('/admin/relatorios')">Ver relatório completo</button>
        </div>
      </div>
    </app-shell>
  `,
  styles: [`
    .report-card h3 { border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 10px; }
    .kv { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
    .bar { background: #eee; height: 8px; border-radius: 4px; margin-top: 4px; overflow: hidden; }
    .bar i { background: #e86f12; height: 100%; display: block; }
  `],
})
export class DashboardPage {
  private readonly router = inject(Router);
  readonly vehicleService = inject(VehicleService);
  readonly reservationService = inject(ReservationService);
  readonly paymentService = inject(CustomerPaymentService);

  constructor() {
    void this.vehicleService.load();
    void this.reservationService.load();
    void this.paymentService.loadOperational();
  }

  get reservations(): import('../../core/models').Reservation[] {
    return this.reservationService.reservations();
  }

  get revenue(): number {
    return this.reservations.filter((reservation) => reservation.status !== 'Cancelada').reduce((sum, r) => sum + r.total, 0);
  }

  get canceledCount(): number {
    return this.reservations.filter((reservation) => reservation.status === 'Cancelada').length;
  }

  get pendingPayments(): number {
    return countPendingPayments(this.paymentService.items());
  }

  get occupancy(): number {
    const vehicles = this.vehicleService.vehicles();
    if (!vehicles.length) {
      return 0;
    }
    const rented = vehicles.filter((vehicle) => vehicle.status === 'Alugado').length;
    return Math.round((rented / vehicles.length) * 100);
  }

  async go(route: string): Promise<void> {
    await this.router.navigateByUrl(route);
  }
}
