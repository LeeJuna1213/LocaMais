import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Vehicle, VehicleCategory, VehicleFilters } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [FormsModule, AppShellComponent, VehicleCardComponent],
  template: `
    <app-shell
      [title]="isAdmin ? 'Nova reserva' : ''"
      [logo]="!isAdmin"
      [back]="isAdmin"
      defaultHref="/admin/menu"
      [showNav]="!isAdmin"
      [role]="isAdmin ? null : 'client'"
      activeTab="inicio"
    >
      <input
        placeholder="Buscar veículos..."
        [ngModel]="query"
        (ngModelChange)="query = $event"
        autocomplete="off"
      />

      <div class="fl">
        <div>
          <label>Categoria</label>
          <select [ngModel]="category" (ngModelChange)="category = $event">
            @for (option of categories; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </div>
        <div>
          <label>Preço</label>
          <select [ngModel]="price" (ngModelChange)="price = $event">
            @for (option of prices; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </div>
        <div>
          <label>Câmbio</label>
          <select [ngModel]="transmission" (ngModelChange)="transmission = $event">
            @for (option of transmissions; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </div>
      </div>

      @if (vehicleService.loading()) {
        <div class="card empty" role="status">Carregando veículos...</div>
      } @else if (vehicleService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="vehicleService.load()">Tentar novamente</button>
      } @else {
      @for (vehicle of filteredVehicles; track vehicle.id) {
        <app-vehicle-card [vehicle]="vehicle" (selected)="open($event)" />
      } @empty {
        <div class="card empty">Nenhum veículo encontrado</div>
      }
      }
    </app-shell>
  `,
})
export class VehicleListPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly vehicleService = inject(VehicleService);

  readonly isAdmin = this.auth.role() === 'admin';
  readonly categories = ['Todas', 'SUV', 'Hatch', 'Picape'];
  readonly prices = ['Todos', 'Até R$ 100', 'R$ 100–200', 'Acima de R$ 200'];
  readonly transmissions = ['Todas', 'Automático', 'Manual'];

  constructor() { void this.vehicleService.load(); }

  query = '';
  category: VehicleFilters['category'] = 'Todas';
  price: VehicleFilters['price'] = 'Todos';
  transmission: VehicleFilters['transmission'] = 'Todas';

  get filteredVehicles(): Vehicle[] {
    const query = this.query.trim().toLowerCase();
    return this.vehicleService.vehicles().filter((vehicle) => {
      const matchesQuery = vehicle.name.toLowerCase().includes(query);
      const matchesCategory = this.category === 'Todas' || vehicle.category === (this.category as VehicleCategory);
      const matchesTransmission = this.transmission === 'Todas' || vehicle.transmission === this.transmission;
      const matchesPrice =
        this.price === 'Todos' ||
        (this.price === 'Até R$ 100' && vehicle.pricePerDay <= 100) ||
        (this.price === 'R$ 100–200' && vehicle.pricePerDay > 100 && vehicle.pricePerDay <= 200) ||
        (this.price === 'Acima de R$ 200' && vehicle.pricePerDay > 200);
      return matchesQuery && matchesCategory && matchesTransmission && matchesPrice;
    });
  }

  async open(vehicle: Vehicle): Promise<void> {
    await this.router.navigate(['/booking/vehicle', vehicle.id]);
  }
}
