import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ReservationService } from '../../core/services/reservation.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AdminMenuComponent } from '../../shared/components/admin-menu.component';
import { AppShellComponent } from '../../shared/components/app-shell.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AppShellComponent, AdminMenuComponent],
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

      <app-admin-menu />
    </app-shell>
  `,
})
export class DashboardPage {
  private readonly router = inject(Router);
  readonly vehicleService = inject(VehicleService);
  readonly reservationService = inject(ReservationService);

  async go(route: string): Promise<void> {
    await this.router.navigateByUrl(route);
  }
}
