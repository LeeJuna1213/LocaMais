import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { countPendingPayments } from '../../core/services/customer-payment.service';
import { AdminReservationTab, filterAdminReservations, ReservationService } from '../../core/services/reservation.service';
import { RevisaoService } from '../../core/services/revisao.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { RevisionCostByVehicleApi } from '../../core/models';
import { AppShellComponent } from '../../shared/components/app-shell.component';

export interface ReservationReportCategory {
  tab: AdminReservationTab;
  label: string;
  reservations: Reservation[];
}

export function buildRevisionCostsByVehicle(
  vehicles: Vehicle[],
  rows: RevisionCostByVehicleApi[],
): { vehicle: Vehicle; quantidade: number; total: number }[] {
  const totals = new Map(rows.map((item) => [Number(item.carro_id), item]));
  return vehicles.flatMap((vehicle) => {
    const report = totals.get(vehicle.id);
    const quantidade = Number(report?.quantidade) || 0;
    return report && quantidade > 0
      ? [{ vehicle, quantidade, total: Number(report.total) || 0 }]
      : [];
  });
}

export function buildReservationReportCategories(reservations: Reservation[]): ReservationReportCategory[] {
  return [
    { tab: 'Pendentes', label: 'Reservas Pendentes', reservations: filterAdminReservations(reservations, 'Pendentes') },
    { tab: 'Confirmadas', label: 'Reservas Confirmadas', reservations: filterAdminReservations(reservations, 'Confirmadas') },
    { tab: 'Efetivadas', label: 'Reservas Efetivadas', reservations: filterAdminReservations(reservations, 'Efetivadas') },
    { tab: 'Canceladas', label: 'Reservas Canceladas', reservations: filterAdminReservations(reservations, 'Canceladas') },
  ];
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe],
  styles: [`.report-link{width:100%;border:0;background:transparent;text-align:left;font:inherit;color:inherit;cursor:pointer;padding:8px 0}.report-link:hover span{text-decoration:underline;color:#b84c09}`],
  template: `
    <app-shell title="Relatórios" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <div class="card">
        <div class="kv"><span>Receita (sem canceladas)</span><b>{{ revenue | currency: 'BRL' }}</b></div>
        <button class="kv report-link" type="button" (click)="openAllReservations()"><span>Reservas totais</span><b>{{ reservations.length }}</b></button>
        <button class="kv report-link" type="button" (click)="openCanceled()"><span>Reservas canceladas</span><b>{{ canceledCount }}</b></button>
        <button class="kv report-link" type="button" (click)="openPendingPayments()"><span>Pagamentos pendentes</span><b>{{ pendingPayments }}</b></button>
        <label style="margin-top: 10px">Ocupação da frota: {{ occupancy }}%</label><div class="bar"><i [style.width.%]="occupancy"></i></div>
      </div>
      <div class="card">
        <b>Reservas por situação</b>
        @for (category of reservationCategories; track category.tab) {
          <button class="kv report-link" type="button" (click)="openReservationCategory(category.tab)">
            <span>{{ category.label }}</span><b>{{ category.reservations.length }}</b>
          </button>
        }
      </div>
      <div class="card">
        <b>Reservas por veículo</b>
        @for (item of reservationsByVehicle; track item.vehicle.id) {
          <button class="kv report-link" type="button" (click)="openReservationsForVehicle(item.vehicle.id)"><span>{{ item.vehicle.name }}</span><b>{{ item.count }}</b></button>
        }
      </div>
      <div class="card">
        <b>Custos de revisões</b>
        @if (revisaoService.loading()) { <div class="small muted" role="status">Carregando custos...</div> }
        @else if (revisaoService.error(); as error) { <div class="small" role="alert">{{ error }}</div><button class="btn" type="button" (click)="loadRevisionCosts()">Tentar novamente</button> }
        @else {
          <div class="kv"><span>Total geral ({{ revisionCosts.quantidadeGeral }} revisões)</span><b>{{ revisionCosts.totalGeral | currency: 'BRL' }}</b></div>
          @for (item of revisionCostsByVehicle; track item.vehicle.id) {
            <button class="kv report-link" type="button" (click)="openRevisionsForVehicle(item.vehicle.id)"><span>{{ item.vehicle.name }} · {{ item.quantidade }} {{ item.quantidade === 1 ? 'revisão' : 'revisões' }}</span><b>{{ item.total | currency: 'BRL' }}</b></button>
          }
        }
      </div>
    </app-shell>
  `,
})
export class ReportsPage {
  private readonly router = inject(Router);
  private readonly reservationService = inject(ReservationService);
  private readonly vehicleService = inject(VehicleService);
  readonly revisaoService = inject(RevisaoService);
  private readonly paymentService = inject(CustomerPaymentService);

  constructor() {
    void this.vehicleService.load();
    void this.reservationService.load();
    void this.paymentService.loadOperational();
    void this.loadRevisionCosts();
  }

  async loadRevisionCosts(): Promise<void> { await this.revisaoService.loadCostsReport(); }
  get revisionCosts() { return this.revisaoService.costs(); }

  get revisionCostsByVehicle(): { vehicle: Vehicle; quantidade: number; total: number }[] {
    return buildRevisionCostsByVehicle(this.vehicleService.vehicles(), this.revisionCosts.porVeiculo);
  }

  get reservations(): Reservation[] { return this.reservationService.reservations(); }
  get reservationCategories(): ReservationReportCategory[] { return buildReservationReportCategories(this.reservations); }
  get revenue(): number { return this.reservations.filter((r) => r.status !== 'Cancelada').reduce((sum, r) => sum + r.total, 0); }
  get canceledCount(): number { return this.reservations.filter((r) => r.status === 'Cancelada').length; }
  get pendingPayments(): number { return countPendingPayments(this.paymentService.items()); }
  get occupancy(): number {
    const vehicles = this.vehicleService.vehicles();
    return vehicles.length ? Math.round(vehicles.filter((v) => v.status === 'Alugado').length / vehicles.length * 100) : 0;
  }
  get reservationsByVehicle(): { vehicle: Vehicle; count: number }[] {
    return this.vehicleService.vehicles().map((vehicle) => ({ vehicle, count: this.reservations.filter((r) => r.vehicleId === vehicle.id).length }));
  }

  async openReservationCategory(tab: AdminReservationTab): Promise<void> {
    await this.router.navigate(['/admin/reservas'], { queryParams: { carId: null, tab } });
  }

  async openRevisionsForVehicle(carId: number): Promise<void> { await this.router.navigate(['/admin/veiculos', carId, 'revisoes']); }
  async openReservationsForVehicle(carId: number): Promise<void> { await this.router.navigate(['/admin/reservas'], { queryParams: { carId, tab: 'Todas' } }); }
  async openAllReservations(): Promise<void> { await this.router.navigate(['/admin/reservas'], { queryParams: { carId: null, tab: 'Todas' } }); }
  async openCanceled(): Promise<void> { await this.router.navigate(['/admin/reservas'], { queryParams: { carId: null, tab: 'Canceladas' } }); }
  async openPendingPayments(): Promise<void> { await this.router.navigate(['/admin/pagamentos'], { queryParams: { status: 'pendente', tab: 'Pendentes' } }); }
}
