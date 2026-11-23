import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Reservation, Vehicle } from '../../core/models';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { countPendingPayments } from '../../core/services/customer-payment.service';
import { AdminReservationTab, filterAdminReservations, ReservationService } from '../../core/services/reservation.service';
import { RevisaoService } from '../../core/services/revisao.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { RevisionCostByVehicleApi } from '../../core/models';
import { VehicleInspectionCostByVehicleApi } from '../../core/models';
import { VehicleInspectionService } from '../../core/services/vehicle-inspection.service';
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

export function buildInspectionCostsByVehicle(rows: VehicleInspectionCostByVehicleApi[]): VehicleInspectionCostByVehicleApi[] {
  return rows.filter((row) => Number(row.quantidade) > 0)
    .map((row) => ({ ...row, quantidade: Number(row.quantidade), total: Number(row.total), vistorias: row.vistorias.map((item) => ({ ...item, valor: Number(item.valor) })) }));
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe, FormsModule],
  styles: [`.report-link{width:100%;border:0;background:transparent;text-align:left;font:inherit;color:inherit;cursor:pointer;padding:8px 0}.report-link:hover span{text-decoration:underline;color:#b84c09}.report-date-filter{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end;margin:12px 0}.report-date-filter .btn{grid-column:1/-1;margin:0}`],
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
      <div class="card">
        <b>Custos de vistorias</b>
        <div class="report-date-filter">
          <div><label for="inspection-cost-from">De</label><input id="inspection-cost-from" type="date" [(ngModel)]="inspectionCostFrom" /></div>
          <div><label for="inspection-cost-to">Até</label><input id="inspection-cost-to" type="date" [(ngModel)]="inspectionCostTo" /></div>
          <button class="btn" type="button" [disabled]="inspectionCostsLoading" (click)="loadInspectionCosts()">{{ inspectionCostsLoading ? 'Carregando...' : 'Aplicar período' }}</button>
        </div>
        @if (inspectionCostsError) { <div class="small" role="alert">{{ inspectionCostsError }}</div> }
        @else if (inspectionCostsLoading) { <div class="small muted" role="status">Carregando custos das vistorias...</div> }
        @else {
          <div class="kv"><span>Total de vistorias no período ({{ inspectionCosts.quantidadeGeral }})</span><b>{{ inspectionCosts.totalGeral | currency:'BRL' }}</b></div>
          @for (vehicle of inspectionCostsByVehicle; track vehicle.carro_id) {
            <article class="card">
              <b>{{ vehicle.modelo }} · {{ vehicle.placa }}</b>
              <div class="kv"><span>{{ vehicle.quantidade }} {{ vehicle.quantidade === 1 ? 'vistoria' : 'vistorias' }}</span><b>Total: {{ vehicle.total | currency:'BRL' }}</b></div>
              <div class="kv"><span>Total de manutenção neste veículo (revisões + vistorias)</span><b>{{ maintenanceTotalFor(vehicle.carro_id) | currency:'BRL' }}</b></div>
              @for (inspection of vehicle.vistorias; track inspection.id) {
                <div class="kv"><span>{{ formatInspectionDate(inspection.data) }} · {{ inspection.descricao }} · {{ inspection.km }} km</span><b>Vistoria: {{ inspection.valor | currency:'BRL' }}</b></div>
              }
            </article>
          } @empty { <div class="small muted">Nenhuma vistoria concluída neste período.</div> }
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
  private readonly inspectionService = inject(VehicleInspectionService);
  inspectionCostFrom = '';
  inspectionCostTo = '';
  inspectionCostsLoading = false;
  inspectionCostsError: string | null = null;
  inspectionCosts: { porVeiculo: VehicleInspectionCostByVehicleApi[]; totalGeral: number; quantidadeGeral: number } = { porVeiculo: [], totalGeral: 0, quantidadeGeral: 0 };

  constructor() {
    void this.vehicleService.load();
    void this.reservationService.load();
    void this.paymentService.loadOperational();
    void this.loadRevisionCosts();
    void this.loadInspectionCosts();
  }

  async loadRevisionCosts(): Promise<void> { await this.revisaoService.loadCostsReport(); }
  get revisionCosts() { return this.revisaoService.costs(); }

  get revisionCostsByVehicle(): { vehicle: Vehicle; quantidade: number; total: number }[] {
    return buildRevisionCostsByVehicle(this.vehicleService.vehicles(), this.revisionCosts.porVeiculo);
  }

  get inspectionCostsByVehicle(): VehicleInspectionCostByVehicleApi[] {
    return buildInspectionCostsByVehicle(this.inspectionCosts.porVeiculo);
  }

  async loadInspectionCosts(): Promise<void> {
    if (this.inspectionCostFrom && this.inspectionCostTo && this.inspectionCostFrom > this.inspectionCostTo) {
      this.inspectionCostsError = 'A data inicial não pode ser posterior à data final.';
      return;
    }
    this.inspectionCostsLoading = true;
    this.inspectionCostsError = null;
    try {
      const report = await this.inspectionService.loadCosts({ de: this.inspectionCostFrom || undefined, ate: this.inspectionCostTo || undefined });
      this.inspectionCosts = { ...report, totalGeral: Number(report.totalGeral) || 0, quantidadeGeral: Number(report.quantidadeGeral) || 0 };
    } catch (error) {
      this.inspectionCostsError = error instanceof Error ? error.message : 'Não foi possível carregar os custos das vistorias.';
    } finally { this.inspectionCostsLoading = false; }
  }

  maintenanceTotalFor(vehicleId: number): number {
    const revisions = this.revisionCostsByVehicle.find((item) => item.vehicle.id === vehicleId)?.total ?? 0;
    const inspections = this.inspectionCostsByVehicle.find((item) => item.carro_id === vehicleId)?.total ?? 0;
    return revisions + Number(inspections);
  }

  formatInspectionDate(value: string): string {
    const date = value.slice(0, 10);
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}/${month}/${year}` : value;
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
