import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { BadgeComponent } from '../../shared/components/badge.component';
import { CarComponent } from '../../shared/components/car.component';

@Component({
  selector: 'app-vehicle-details',
  standalone: true,
  imports: [AppShellComponent, BadgeComponent, CarComponent, CurrencyPipe],
  template: `
    <app-shell
      title="Detalhes"
      [back]="true"
      [defaultHref]="backHref"
      [showNav]="!isAdmin"
      [role]="isAdmin ? null : 'client'"
      activeTab="inicio"
    >
      <button slot="right" type="button" (click)="toggleFavorite()" [attr.aria-label]="'Favoritar'">
        {{ vehicle?.favorite ? '♥' : '♡' }}
      </button>

      @if (vehicle; as v) {
        <div class="card">
          <div class="big"><app-car [color]="v.color" [fluid]="true" /></div>
          <h2 style="margin-top: 10px">{{ v.name }}</h2>
          <div style="font-size: 13px; color: #7a5a40">{{ v.version }} · <app-badge [status]="v.status" /></div>
          <div class="pr" style="font-size: 18px; margin: 6px 0">{{ v.pricePerDay | currency: 'BRL' }} / diária</div>
          <div style="font-size: 12px; margin-bottom: 8px">{{ v.transmission }} · {{ v.category }} · 5 lugares</div>
          <b style="font-size: 13px">Descrição</b>
          <p style="font-size: 12px; margin: 4px 0">Conforto, tecnologia e segurança para viagens na cidade e na estrada.</p>

          @if (v.status === 'Disponível') {
            <button class="btn" type="button" (click)="startReservation(v)">Eu quero!</button>
          } @else {
            <button class="btn dis" type="button" (click)="unavailable()">Indisponível</button>
          }
        </div>
      } @else {
        <div class="card empty">Veículo não encontrado</div>
      }
    </app-shell>
  `,
})
export class VehicleDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly vehicleService = inject(VehicleService);
  private readonly booking = inject(BookingService);
  private readonly toast = inject(ToastService);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  readonly isAdmin = this.auth.role() === 'admin';
  readonly backHref = this.isAdmin ? '/admin/reserva' : '/client/veiculos';

  constructor() {
    if (this.id > 0 && !this.vehicleService.getById(this.id)) {
      void this.vehicleService.loadOne(this.id).catch(async (error: unknown) => {
        await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o veículo');
      });
    }
  }

  get vehicle(): Vehicle | undefined {
    return this.vehicleService.getById(this.id);
  }

  async toggleFavorite(): Promise<void> {
    await this.vehicleService.toggleFavorite(this.id);
  }

  async unavailable(): Promise<void> {
    await this.toast.show('Veículo indisponível no momento');
  }

  async startReservation(vehicle: Vehicle): Promise<void> {
    this.booking.selectVehicle(vehicle.id);
    await this.router.navigate(['/booking/reservar', vehicle.id]);
  }
}
