import { Injectable, computed, inject, signal } from '@angular/core';
import { addDays, daysBetween, todayISO } from '../data';
import { PaymentMethod, Vehicle } from '../models';
import { VehicleService } from './vehicle.service';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly vehicleService = inject(VehicleService);

  private readonly _vehicleId = signal<number | null>(null);
  private readonly _start = signal(todayISO());
  private readonly _end = signal(addDays(todayISO(), 3));
  private readonly _location = signal('Loja Centro - Belford Roxo');
  private readonly _clientName = signal('');
  private readonly _method = signal<PaymentMethod>('PIX');

  readonly vehicleId = this._vehicleId.asReadonly();
  readonly start = this._start.asReadonly();
  readonly end = this._end.asReadonly();
  readonly location = this._location.asReadonly();
  readonly clientName = this._clientName.asReadonly();
  readonly method = this._method.asReadonly();

  readonly vehicle = computed<Vehicle | undefined>(() => {
    const id = this._vehicleId();
    return id === null ? undefined : this.vehicleService.getById(id);
  });

  readonly days = computed(() => daysBetween(this._start(), this._end()));
  readonly total = computed(() => this.days() * (this.vehicle()?.pricePerDay ?? 0));

  selectVehicle(id: number): void {
    this._vehicleId.set(id);
    this._start.set(todayISO());
    this._end.set(addDays(todayISO(), 3));
  }

  setDates(start: string, end: string): void {
    this._start.set(start);
    if (end <= start) {
      this._end.set(addDays(start, 1));
    } else {
      this._end.set(end);
    }
  }

  setLocation(location: string): void {
    this._location.set(location);
  }

  setClientName(name: string): void {
    this._clientName.set(name);
  }

  setMethod(method: PaymentMethod): void {
    this._method.set(method);
  }

  reset(): void {
    this._vehicleId.set(null);
    this._start.set(todayISO());
    this._end.set(addDays(todayISO(), 3));
    this._location.set('Loja Centro - Belford Roxo');
    this._clientName.set('');
    this._method.set('PIX');
  }
}
