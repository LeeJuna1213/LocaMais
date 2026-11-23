import { CurrencyPipe } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { heart, heartOutline } from 'ionicons/icons';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { BadgeComponent } from '../../shared/components/badge.component';
import { CarComponent } from '../../shared/components/car.component';

@Component({
  selector: 'app-vehicle-details',
  standalone: true,
  imports: [AppShellComponent, BadgeComponent, CarComponent, CurrencyPipe, IonIcon],
  styles: [`
    .detail-photo { display: block; width: 100%; height: 100%; min-height: 180px; object-fit: cover; border-radius: 14px; }
  `],
  template: `
    <app-shell
      title="Detalhes"
      [back]="true"
      [defaultHref]="backHref"
      [showNav]="!isStaff"
      [role]="isStaff ? null : 'client'"
      activeTab="inicio"
    >
      @if (!isStaff) { <button slot="right" type="button" (click)="toggleFavorite()" [attr.aria-label]="vehicle?.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'"><ion-icon [name]="vehicle?.favorite ? 'heart' : 'heart-outline'" aria-hidden="true"></ion-icon></button> }

      @if (vehicle; as v) {
        <div class="card">
          <div class="big">
            @if (photoUrl && failedPhotoUrl !== photoUrl) {
              <img class="detail-photo" [src]="photoUrl" [alt]="'Foto de ' + v.name" (error)="failedPhotoUrl = photoUrl" />
            } @else {
              <app-car [color]="v.color" [fluid]="true" />
            }
          </div>
          <h2 style="margin-top: 10px">{{ v.name }}</h2>
          <div style="font-size: 13px; color: #7a5a40">{{ v.version }} · <app-badge [status]="v.status" /></div>
          <div class="pr" style="font-size: 18px; margin: 6px 0">{{ v.pricePerDay | currency: 'BRL' }} / diária</div>
          <div style="font-size: 12px; margin-bottom: 8px">{{ v.transmission || 'Câmbio não informado' }} · {{ v.category }} · {{ v.lugares ?? 'Lugares não informados' }} lugares</div>
          <b style="font-size: 13px">Descrição</b>
          <p style="font-size: 12px; margin: 4px 0">{{ v.descricao || 'Sem descrição cadastrada.' }}</p>

          @if (v.status !== 'Em manutenção') {
            <button class="btn" type="button" (click)="startReservation(v)">Eu quero!</button>
          } @else {
            <button class="btn dis" type="button" (click)="unavailable()">Em manutenção</button>
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
  private readonly imageUrls = inject(ImageUrlService);

  private readonly id = Number(this.route.snapshot.paramMap.get('id'));
  readonly isStaff = this.auth.role() === 'admin' || this.auth.role() === 'funcionario';
  readonly backHref = this.isStaff ? '/admin/reserva' : '/client/veiculos';
  failedPhotoUrl: string | null = null;

  constructor() {
    addIcons({ heart, heartOutline });
    if (!this.isStaff) void this.vehicleService.loadFavorites().catch(async (error: unknown) => this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar favoritos.'));
    if (this.id > 0 && !this.vehicleService.getById(this.id)) {
      void this.vehicleService.loadOne(this.id).catch(async (error: unknown) => {
        await this.toast.show(error instanceof Error ? error.message : 'Não foi possível carregar o veículo');
      });
    }
  }

  get vehicle(): Vehicle | undefined {
    return this.vehicleService.getById(this.id);
  }

  get photoUrl(): string | null {
    return this.imageUrls.resolve(this.vehicle?.photo);
  }

  async toggleFavorite(): Promise<void> {
    try { const favorite = await this.vehicleService.toggleFavorite(this.id); await this.toast.show(favorite ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.'); }
    catch (error) { await this.toast.show(error instanceof Error ? error.message : 'Não foi possível atualizar favoritos.'); }
  }

  async unavailable(): Promise<void> {
    await this.toast.show('Veículo indisponível no momento');
  }

  async startReservation(vehicle: Vehicle): Promise<void> {
    this.booking.selectVehicle(vehicle.id);
    await this.router.navigate(['/booking/reservar', vehicle.id]);
  }
}
