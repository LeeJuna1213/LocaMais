import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Reservation, Vehicle } from '../../core/models';
import { BadgeComponent } from './badge.component';

@Component({
  selector: 'app-reservation-card',
  standalone: true,
  imports: [BadgeComponent, CurrencyPipe, DatePipe],
  template: `
    <div class="card card-click" (click)="selected.emit(reservation)">
      <div class="row">
        <b>#{{ reservation.id }} · {{ reservation.clientName }}</b>
        <app-badge [status]="reservation.status" />
      </div>
      <div style="font-size: 12px; color: #7a5a40">
        {{ vehicle?.name }} · {{ reservation.start | date: 'dd/MM/yyyy' }} - {{ reservation.end | date: 'dd/MM/yyyy' }}
      </div>
      <div class="pr" style="font-size: 13px">{{ reservation.total | currency: 'BRL' }}</div>
    </div>
  `,
})
export class ReservationCardComponent {
  @Input({ required: true }) reservation!: Reservation;
  @Input() vehicle: Vehicle | undefined;
  @Output() selected = new EventEmitter<Reservation>();
}
