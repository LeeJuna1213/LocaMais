import { CurrencyPipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { ellipsisVerticalOutline } from 'ionicons/icons';
import { Vehicle } from '../../core/models';
import { ImageUrlService } from '../../core/services/image-url.service';
import { BadgeComponent } from './badge.component';
import { CarComponent } from './car.component';

@Component({
  selector: 'app-vehicle-card',
  standalone: true,
  imports: [BadgeComponent, CarComponent, CurrencyPipe, IonIcon],
  styles: [`
    .vehicle-image { width: 96px; height: 68px; object-fit: cover; border-radius: 10px; flex: none; }
    .vehicle-menu { border: 0; background: transparent; color: #69513f; padding: 8px; border-radius: 8px; cursor: pointer; }
    .vehicle-menu ion-icon { font-size: 20px; }
    .vehicle-menu:focus-visible { outline: 2px solid #e86f12; outline-offset: 2px; }
    .inspection-pending { display:inline-block; margin-top:5px; padding:3px 8px; border-radius:999px; background:#fff0e2; color:#9a3f06; font-size:11px; font-weight:700; }
  `],
  template: `
    <div class="card row card-click" (click)="selected.emit(vehicle)">
      @if (photoUrl && !photoFailed) {
        <img class="vehicle-image" [src]="photoUrl" alt="Foto do veículo" (error)="photoFailed = true" />
      } @else {
        <app-car [color]="vehicle.color" />
      }
      <div style="flex: 1">
        <div style="font-size: 11px"><app-badge [status]="vehicle.status" /></div>
        <b style="font-size: 14px">{{ vehicle.name }}</b>
        <div style="font-size: 12px; color: #7a5a40">{{ vehicle.category }}{{ vehicle.plate ? ' · ' + vehicle.plate : '' }}</div>
        @if (adminActions && vehicle.inspectionDue) { <span class="inspection-pending">Vistoria pendente</span> }
        <div class="pr" style="font-size: 13px">{{ vehicle.pricePerDay | currency: 'BRL' }} / diária</div>
      </div>
      @if (adminActions) {
        <button class="vehicle-menu" type="button" aria-label="Ações do veículo" [disabled]="actionsDisabled" (click)="openActions($event)" (keydown)="$event.stopPropagation()">
          <ion-icon name="ellipsis-vertical-outline" aria-hidden="true"></ion-icon>
        </button>
      }
      <span class="chev">›</span>
    </div>
  `,
})
export class VehicleCardComponent implements OnChanges {
  private readonly imageUrls = inject(ImageUrlService);

  @Input({ required: true }) vehicle!: Vehicle;
  @Input() adminActions = false;
  @Input() actionsDisabled = false;
  @Output() selected = new EventEmitter<Vehicle>();
  @Output() manage = new EventEmitter<Vehicle>();

  photoFailed = false;

  constructor() {
    addIcons({ ellipsisVerticalOutline });
  }

  get photoUrl(): string | null {
    return this.imageUrls.resolve(this.vehicle?.photo);
  }

  ngOnChanges(): void {
    this.photoFailed = false;
  }

  openActions(event: MouseEvent): void {
    event.stopPropagation();
    this.manage.emit(this.vehicle);
  }
}
