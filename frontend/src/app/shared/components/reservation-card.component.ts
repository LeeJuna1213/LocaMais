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
            <b>Reserva {{ friendlyCode }}</b>
            <app-badge [status]="reservation.status" />
            @if (reservation.rentalStatus === 'cancelada') { <app-badge status="Locação cancelada" /> }
          </div>
          <div class="small muted">Cliente: {{ reservation.clientName || '—' }}</div>
          <div style="font-size: 12px; color: #7a5a40">
            {{ vehicle?.name }} · {{ reservation.start | date: 'dd/MM/yyyy' }} - {{ reservation.end | date: 'dd/MM/yyyy' }}
          </div>
          @if (reservation.actualReturnDate) {
            <div class="small muted">Devolução efetiva: {{ reservation.actualReturnDate | date: 'dd/MM/yyyy HH:mm' }}</div>
          }
        </div>
      </div>
      <div class="pr" style="font-size: 13px">{{ reservation.total | currency: 'BRL' }}</div>
      <div class="small muted">Pagamento: <b>{{ reservation.payment }}</b></div>
      @if (!adminActions && reservation.status === 'Aguardando pagamento' && reservation.payment === 'Pendente') {
        <button class="btn" type="button" (click)="$event.stopPropagation(); payRequested.emit(reservation)">Pagar agora</button>
      }
      @if (adminActions && (reservation.status === 'Aguardando pagamento' || reservation.status === 'Aguardando confirmação')) {
        <div class="form-actions" (click)="$event.stopPropagation()">
          @if (reservation.status === 'Aguardando confirmação' && reservation.payment === 'Pago') { <button class="btn" type="button" (click)="confirmRequested.emit(reservation)">Confirmar reserva</button> }
          <button class="lnk dark" type="button" (click)="cancelRequested.emit(reservation)">Cancelar reserva</button>
        </div>
      }
    </div>
  `,
})
export class ReservationCardComponent {
  private readonly imageUrls = inject(ImageUrlService);

  @Input({ required: true }) reservation!: Reservation;
  @Input() vehicle: Vehicle | undefined;
  @Input() adminActions = false;
  @Output() selected = new EventEmitter<Reservation>();
  @Output() confirmRequested = new EventEmitter<Reservation>();
  @Output() cancelRequested = new EventEmitter<Reservation>();
  @Output() payRequested = new EventEmitter<Reservation>();

  photoFailed = false;

  get photoUrl(): string | null {
    return this.imageUrls.resolve(this.vehicle?.photo);
  }

  get friendlyCode(): string {
    return this.reservation.publicCode ?? '—';
  }
}
