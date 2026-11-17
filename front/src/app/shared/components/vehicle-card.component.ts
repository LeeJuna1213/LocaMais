import { CurrencyPipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Vehicle } from '../../core/models';
import { BadgeComponent } from './badge.component';
import { CarComponent } from './car.component';

@Component({
  selector: 'app-vehicle-card',
  standalone: true,
  imports: [BadgeComponent, CarComponent, CurrencyPipe],
  template: `
    <div class="card row card-click" (click)="selected.emit(vehicle)">
      <app-car [color]="vehicle.color" />
      <div style="flex: 1">
        <div style="font-size: 11px"><app-badge [status]="vehicle.status" /></div>
        <b style="font-size: 14px">{{ vehicle.name }}</b>
        <div style="font-size: 12px; color: #7a5a40">{{ vehicle.version }}</div>
        <div class="pr" style="font-size: 13px">{{ vehicle.pricePerDay | currency: 'BRL' }} / diária</div>
      </div>
      <span class="chev">›</span>
    </div>
  `,
})
export class VehicleCardComponent {
  @Input({ required: true }) vehicle!: Vehicle;
  @Output() selected = new EventEmitter<Vehicle>();
}
