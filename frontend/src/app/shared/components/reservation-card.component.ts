import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { IonImg } from '@ionic/angular';
import { Reservation, Vehicle } from '../../core/models';
import { BadgeComponent } from './badge.component';
import { CarComponent } from './car.component';
import { ImageUrlService } from '../../core/services/image-url.service';

@Component({
  selector: 'app-reservation-card',
  standalone: true,
  imports: [BadgeComponent, CurrencyPipe, DatePipe, IonImg, CarComponent],
  styles: [
    `
      .reservation-photo {
        width: 64px;
        height: 64px;
        border-radius: 10px;
        object-fit: cover;
        flex: none;
      }
    `,
  ],
  template: `
    <div class="card card-click" (click)="selected.emit(reservation)">
      <div class="photo-row">
        @if (photoUrl && !photoFailed) {
          <ion-img class="reservation-photo" [src]="photoUrl" alt="Foto do veículo" (error)="photoFailed = true" />
        } @else {
          <app-car [color]="vehicle?.color ?? '#4a6fa5'" />
        }
        <div class="info">
          <div class="row">
            <b>#{{ reservation.id }} · {{ reservation.clientName }}</b>
            <app-badge [status]="reservation.status" />
          </div>
          <div style="font-size: 12px; color: #7a5a40">
            {{ vehicle?.name }} · {{ reservation.start | date: 'dd/MM/yyyy' }} - {{ reservation.end | date: 'dd/MM/yyyy' }}
          </div>
        </div>
      </div>
      <div class="pr" style="font-size: 13px">{{ reservation.total | currency: 'BRL' }}</div>
    </div>
  `,
})
export class ReservationCardComponent {
  private readonly imageUrls = inject(ImageUrlService);

  @Input({ required: true }) reservation!: Reservation;
  @Input() vehicle: Vehicle | undefined;
  @Output() selected = new EventEmitter<Reservation>();

  photoFailed = false;

  get photoUrl(): string | null {
    return this.imageUrls.resolve(this.vehicle?.photo);
  }
}
