import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Reservation, Vehicle } from '../../core/models';
import { ReservationService } from '../../core/services/reservation.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { RevisaoService } from '../../core/services/revisao.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [AppShellComponent, CurrencyPipe],
  template: `
    <app-shell title="Relatórios" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="menu">
      <div class="card">
        <div class="kv"><span>Receita (sem canceladas)</span><b>{{ revenue | currency: 'BRL' }}</b></div>
        <div class="kv"><span>Reservas totais</span><b>{{ reservations.length }}</b></div>
        <div class="kv"><span>Canceladas</span><b>{{ canceledCount }}</b></div>
        <div class="kv"><span>Pagamentos pendentes</span><b>{{ pendingPayments }}</b></div>
        <label style="margin-top: 10px">Ocupação da frota: {{ occupancy }}%</label>
        <div class="bar"><i [style.width.%]="occupancy"></i></div>
      </div>

      <div class="card">
        <b>Reservas por veículo</b>
        @for (item of reservationsByVehicle; track item.vehicle.id) {
          <div class="kv"><span>{{ item.vehicle.name }}</span><b>{{ item.count }}</b></div>
        }
      </div>

      <div class="card">
        <b>Custos de revisões</b>
        @if (revisaoService.loading()) {
          <div class="small muted" role="status">Carregando custos...</div>
        } @else if (revisaoService.error(); as error) {
          <div class="small" role="alert">{{ error }}</div>
          <button class="btn" type="button" (click)="loadRevisionCosts()">Tentar novamente</button>
        } @else {
          <div class="kv"><span>Total geral ({{ revisionCosts.quantidadeGeral }} revisões)</span><b>{{ revisionCosts.totalGeral | currency: 'BRL' }}</b></div>
          @for (item of revisionCostsByVehicle; track item.vehicle.id) {
            <div class="kv"><span>{{ item.vehicle.name }} · {{ item.quantidade }} {{ item.quantidade === 1 ? 'revisão' : 'revisões' }}</span><b>{{ item.total | currency: 'BRL' }}</b></div>
          }
        }
      </div>
    </app-shell>
  `,
})
export class ReportsPage {
  private readonly reservationService = inject(ReservationService);
  private readonly vehicleService = inject(VehicleService);
  readonly revisaoService = inject(RevisaoService);

  constructor() {
    void this.vehicleService.load();
    void this.loadRevisionCosts();
  }

  async loadRevisionCosts(): Promise<void> {
    await this.revisaoService.loadCostsReport();
  }

  get revisionCosts() {
    return this.revisaoService.costs();
  }

  get revisionCostsByVehicle(): { vehicle: Vehicle; quantidade: number; total: number }[] {
    const totals = new Map(this.revisionCosts.porVeiculo.map((item) => [Number(item.carro_id), item]));
    return this.vehicleService.vehicles().map((vehicle) => {
      const report = totals.get(vehicle.id);
      return {
        vehicle,
        quantidade: Number(report?.quantidade) || 0,
        total: Number(report?.total) || 0,
      };
    });
  }

  get reservations(): Reservation[] {
    return this.reservationService.reservations();
  }

  get revenue(): number {
    return this.reservations.filter((reservation) => reservation.status !== 'Cancelada').reduce((sum, r) => sum + r.total, 0);
  }

  get canceledCount(): number {
    return this.reservations.filter((reservation) => reservation.status === 'Cancelada').length;
  }

  get pendingPayments(): number {
    return this.reservations.filter((reservation) => reservation.payment === 'Pendente').length;
  }

  get occupancy(): number {
    const vehicles = this.vehicleService.vehicles();
    if (!vehicles.length) {
      return 0;
    }
    const rented = vehicles.filter((vehicle) => vehicle.status === 'Alugado').length;
    return Math.round((rented / vehicles.length) * 100);
  }

  get reservationsByVehicle(): { vehicle: Vehicle; count: number }[] {
    return this.vehicleService.vehicles().map((vehicle) => ({
      vehicle,
      count: this.reservations.filter((reservation) => reservation.vehicleId === vehicle.id).length,
    }));
  }
}
