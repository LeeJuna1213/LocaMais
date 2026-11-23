import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { VehicleService } from '../../core/services/vehicle.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';
import { Vehicle } from '../../core/models';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [AppShellComponent, VehicleCardComponent],
  template: `
    <app-shell title="Favoritos" [showNav]="true" role="client" activeTab="perfil">
      @if (loading) { <div class="card empty" role="status">Carregando favoritos...</div> }
      @else if (error) { <div class="card empty" role="alert">{{ error }}</div><button class="btn" type="button" (click)="load()">Tentar novamente</button> }
      @else {
        @for (vehicle of vehicles.favoriteVehicles(); track vehicle.id) {
          <div class="favorite-row"><app-vehicle-card [vehicle]="vehicle" (selected)="open($event)" /><button type="button" class="remove" (click)="remove(vehicle)" [attr.aria-label]="'Remover ' + vehicle.name + ' dos favoritos'">Remover</button></div>
        } @empty { <div class="card empty">Você ainda não adicionou veículos aos favoritos.</div> }
      }
    </app-shell>
  `,
  styles: [`.favorite-row{position:relative}.remove{position:absolute;right:16px;bottom:18px;border:0;background:transparent;color:#b42318;font:inherit;font-size:12px;cursor:pointer}`],
})
export class FavoritesPage {
  readonly vehicles = inject(VehicleService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  loading = true;
  error: string | null = null;
  constructor() { void this.load(); }
  async load(): Promise<void> {
    this.loading = true; this.error = null;
    try { await this.vehicles.loadFavorites(); }
    catch (error) { this.error = error instanceof Error ? error.message : 'Não foi possível carregar favoritos.'; }
    finally { this.loading = false; }
  }
  async remove(vehicle: Vehicle): Promise<void> {
    try { await this.vehicles.toggleFavorite(vehicle.id); await this.toast.show('Veículo removido dos favoritos.'); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível remover o favorito.'); }
  }
  async open(vehicle: Vehicle): Promise<void> { await this.router.navigate(['/booking/vehicle', vehicle.id]); }
}
