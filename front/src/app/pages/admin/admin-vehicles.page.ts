import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Vehicle } from '../../core/models';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';

@Component({
  selector: 'app-admin-vehicles',
  standalone: true,
  imports: [AppShellComponent, VehicleCardComponent],
  template: `
    <app-shell title="Veículos" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="veiculos">
      @for (vehicle of vehicleService.vehicles(); track vehicle.id) {
        <app-vehicle-card [vehicle]="vehicle" (selected)="open($event)" />
      } @empty {
        <div class="card empty">Nenhum veículo cadastrado</div>
      }

      <button class="btn" type="button" (click)="newVehicle()">Cadastrar veículo</button>
    </app-shell>
  `,
})
export class AdminVehiclesPage {
  private readonly router = inject(Router);
  readonly vehicleService = inject(VehicleService);

  async open(vehicle: Vehicle): Promise<void> {
    await this.router.navigate(['/admin/veiculos', vehicle.id, 'revisoes']);
  }

  async newVehicle(): Promise<void> {
    await this.router.navigateByUrl('/admin/veiculos/novo');
  }
}
