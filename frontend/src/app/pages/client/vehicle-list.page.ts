import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline } from 'ionicons/icons';
import { Router } from '@angular/router';
import { Transmission, Vehicle, VehicleFilters, VehicleStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';

@Component({
  selector: 'app-vehicle-list',
  standalone: true,
  imports: [FormsModule, IonIcon, AppShellComponent, VehicleCardComponent],
  styles: [`
    .fl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .fl > div { min-width: 0; }
    .filter-panel { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .22s ease, opacity .22s ease; }
    .filter-panel.expanded { grid-template-rows: 1fr; opacity: 1; }
    .filter-panel-inner { min-height: 0; overflow: hidden; }
    .filter-toggle { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; margin: 2px 0 8px; }
    .filter-toggle ion-icon { transition: transform .22s ease; }
    .filter-toggle[aria-expanded="true"] ion-icon { transform: rotate(180deg); }
    .clear-filters { margin: 0 0 10px; text-align: right; }
    @media (prefers-reduced-motion: reduce) { .filter-panel, .filter-toggle ion-icon { transition: none; } }
  `],
  template: `
    <app-shell
      [title]="isStaff ? 'Nova reserva' : ''"
      [logo]="!isStaff"
      [back]="isStaff"
      defaultHref="/admin/menu"
      [showNav]="!isStaff"
      [role]="isStaff ? null : 'client'"
      activeTab="inicio"
    >
      <input placeholder="Buscar veículos..." [ngModel]="query" (ngModelChange)="query = $event" autocomplete="off" />

      <div class="fl">
        <div>
          <label>Categoria</label>
          <select [ngModel]="category" (ngModelChange)="category = $event">
            @for (option of categoryOptions; track option) { <option [value]="option">{{ option }}</option> }
          </select>
        </div>
        <div>
          <label>Marca</label>
          <select [ngModel]="make" (ngModelChange)="make = $event; model = ''">
            <option value="">Todas</option>
            @for (option of makes; track option) { <option [value]="option">{{ option }}</option> }
          </select>
        </div>
      </div>

      <button class="lnk dark filter-toggle" type="button" [attr.aria-expanded]="showMoreFilters" (click)="showMoreFilters = !showMoreFilters">
        <ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon>
        {{ showMoreFilters ? 'Ver menos filtros' : 'Ver mais filtros' }}
      </button>
      <div class="filter-panel" [class.expanded]="showMoreFilters" [attr.aria-hidden]="!showMoreFilters" [attr.inert]="showMoreFilters ? null : ''">
        <div class="filter-panel-inner">
          <div class="fl">
            <div>
              <label>Modelo</label>
              <select [ngModel]="model" (ngModelChange)="model = $event">
                <option value="">Todos</option>
                @for (option of models; track option) { <option [value]="option">{{ option }}</option> }
              </select>
            </div>
            <div>
              <label>Faixa de preço</label>
              <select [ngModel]="priceRange" (ngModelChange)="priceRange = $event">
                <option value="">Qualquer preço</option>
                @for (range of priceRanges; track range.key) { <option [value]="range.key">{{ range.label }}</option> }
              </select>
            </div>
            <div>
              <label>Câmbio</label>
              <select [ngModel]="transmission" (ngModelChange)="transmission = $event">
                @for (option of transmissionOptions; track option) { <option [value]="option">{{ option }}</option> }
              </select>
            </div>
            <div>
              <label>Disponibilidade</label>
              <select [ngModel]="status" (ngModelChange)="status = $event">
                @for (option of statusOptions; track option) { <option [value]="option">{{ option }}</option> }
              </select>
            </div>
          </div>
        </div>
      </div>
      <button class="lnk dark clear-filters" type="button" (click)="clearFilters()">Limpar filtros</button>

      @if (vehicleService.loading()) {
        <div class="card empty" role="status">Carregando veículos...</div>
      } @else if (vehicleService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="vehicleService.load()">Tentar novamente</button>
      } @else {
        @for (vehicle of filteredVehicles; track vehicle.id) {
          <app-vehicle-card [vehicle]="vehicle" (selected)="open($event)" />
        } @empty {
          <div class="card empty">Nenhum veículo corresponde aos filtros selecionados.</div>
        }
      }
    </app-shell>
  `,
})
export class VehicleListPage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly vehicleService = inject(VehicleService);

  readonly isStaff = this.auth.role() === 'admin' || this.auth.role() === 'funcionario';
  readonly statusOptions: Array<'Todos' | VehicleStatus> = ['Todos', 'Disponível', 'Alugado', 'Em manutenção'];

  constructor() {
    addIcons({ chevronDownOutline });
    void this.vehicleService.load();
  }

  query = '';
  category: VehicleFilters['category'] = 'Todas';
  transmission: VehicleFilters['transmission'] = 'Todas';
  make = '';
  model = '';
  status: 'Todos' | VehicleStatus = 'Todos';
  priceRange = '';
  showMoreFilters = false;

  get categories(): string[] {
    return [...new Set(this.vehicleService.vehicles().map((vehicle) => vehicle.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  get categoryOptions(): string[] { return ['Todas', ...this.categories]; }

  get makes(): string[] {
    return [...new Set(this.vehicleService.vehicles().map((vehicle) => vehicle.make?.trim()).filter((value): value is string => !!value))]
      .sort((a, b) => a.localeCompare(b));
  }

  get models(): string[] {
    const vehicles = this.vehicleService.vehicles().filter((vehicle) => !this.make || vehicle.make?.toLocaleLowerCase() === this.make.toLocaleLowerCase());
    return [...new Set(vehicles.map((vehicle) => vehicle.model?.trim()).filter((value): value is string => !!value))]
      .sort((a, b) => a.localeCompare(b));
  }

  get transmissionOptions(): Array<'Todas' | Transmission> {
    const values = [...new Set(this.vehicleService.vehicles().map((vehicle) => vehicle.transmission).filter((value): value is Transmission => !!value))]
      .sort((a, b) => a.localeCompare(b));
    return ['Todas', ...values];
  }

  get priceRanges(): Array<{ key: string; label: string; min: number; max: number | null }> {
    const prices = this.vehicleService.vehicles().map((vehicle) => vehicle.pricePerDay).filter(Number.isFinite);
    if (!prices.length) return [];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const ranges: Array<{ key: string; label: string; min: number; max: number | null }> = [];
    for (let floor = Math.floor(minPrice / 100) * 100; floor <= maxPrice; floor += 100) {
      const ceiling = floor + 100;
      const containsVehicles = prices.some((price) => price >= floor && price < ceiling)
        || (maxPrice === ceiling && prices.some((price) => price === ceiling));
      if (!containsVehicles) continue;
      ranges.push({
        key: `${floor}-${ceiling}`,
        label: `De R$ ${floor},00 a R$ ${ceiling},00`,
        min: floor,
        max: ceiling,
      });
    }
    const last = Math.ceil(maxPrice / 100) * 100;
    if (last <= maxPrice) ranges.push({ key: `${last}+`, label: `Acima de R$ ${last},00`, min: last, max: null });
    return ranges;
  }

  clearFilters(): void {
    this.query = '';
    this.category = 'Todas';
    this.transmission = 'Todas';
    this.make = '';
    this.model = '';
    this.status = 'Todos';
    this.priceRange = '';
  }

  get filteredVehicles(): Vehicle[] {
    const query = this.query.trim().toLocaleLowerCase();
    const range = this.priceRanges.find((item) => item.key === this.priceRange);
    return this.vehicleService.vehicles().filter((vehicle) => {
      const matchesQuery = vehicle.name.toLocaleLowerCase().includes(query);
      const matchesCategory = this.category === 'Todas' || vehicle.category === this.category;
      const matchesTransmission = this.transmission === 'Todas' || vehicle.transmission === this.transmission;
      const matchesMake = !this.make || vehicle.make?.toLocaleLowerCase() === this.make.toLocaleLowerCase();
      const matchesModel = !this.model || vehicle.model?.toLocaleLowerCase() === this.model.toLocaleLowerCase();
      const matchesStatus = this.status === 'Todos' || vehicle.status === this.status;
      const matchesPrice = !range || (vehicle.pricePerDay >= range.min
        && (range.max === null || vehicle.pricePerDay <= range.max));
      return matchesQuery && matchesCategory && matchesTransmission && matchesMake && matchesModel && matchesStatus && matchesPrice;
    });
  }

  async open(vehicle: Vehicle): Promise<void> {
    await this.router.navigate(['/booking/vehicle', vehicle.id]);
  }
}
