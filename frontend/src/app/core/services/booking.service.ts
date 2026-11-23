import { Injectable, computed, inject, signal } from '@angular/core';
import { addDays, daysBetween, todayISO } from '../data';
import { PaymentMethod, Reservation, Vehicle } from '../models';
import { VehicleService } from './vehicle.service';

const ACTIVE_BOOKING_STORAGE_KEY = 'locamais:active-booking';
interface PersistedBooking {
  vehicleId: number | null;
  start: string;
  end: string;
  location: string;
  pickupShopId: number | null;
  clientName: string;
  clientId: number | null;
  method: PaymentMethod;
  pickupTime: string;
  returnTime: string;
}

function readPersistedBooking(): Partial<PersistedBooking> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const value = JSON.parse(sessionStorage.getItem(ACTIVE_BOOKING_STORAGE_KEY) ?? '{}') as Partial<PersistedBooking>;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly vehicleService = inject(VehicleService);
  private readonly persisted = readPersistedBooking();

  private readonly _vehicleId = signal<number | null>(this.persisted.vehicleId ?? null);
  private readonly _start = signal(this.persisted.start ?? todayISO());
  private readonly _end = signal(this.persisted.end ?? addDays(todayISO(), 3));
  private readonly _location = signal(this.persisted.location ?? '');
  private readonly _pickupShopId = signal<number | null>(this.persisted.pickupShopId ?? null);
  private readonly _clientName = signal(this.persisted.clientName ?? '');
  private readonly _clientId = signal<number | null>(this.persisted.clientId ?? null);
  private readonly _method = signal<PaymentMethod>(this.persisted.method ?? 'PIX');
  private readonly _pickupTime = signal(this.persisted.pickupTime ?? '10:00');
  private readonly _returnTime = signal(this.persisted.returnTime ?? '10:00');
  private readonly _createdReservation = signal<Reservation | null>(null);
  private readonly _quotedServiceFee = signal<number | null>(null);

  readonly vehicleId = this._vehicleId.asReadonly();
  readonly start = this._start.asReadonly();
  readonly end = this._end.asReadonly();
  readonly location = this._location.asReadonly();
  readonly pickupShopId = this._pickupShopId.asReadonly();
  readonly clientName = this._clientName.asReadonly();
  readonly clientId = this._clientId.asReadonly();
  readonly method = this._method.asReadonly();
  readonly pickupTime = this._pickupTime.asReadonly();
  readonly returnTime = this._returnTime.asReadonly();
  readonly createdReservation = this._createdReservation.asReadonly();
  readonly quotedServiceFee = this._quotedServiceFee.asReadonly();

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
    this.persist();
  }

  setDates(start: string, end: string): void {
    this._quotedServiceFee.set(null);
    this._start.set(start);
    if (end <= start) {
      this._end.set(addDays(start, 1));
    } else {
      this._end.set(end);
    }
    this.persist();
  }

  setLocation(location: string): void {
    this._location.set(location);
    this.persist();
  }

  setPickupShop(id: number | null, location: string): void { this._pickupShopId.set(id); this._location.set(location); this.persist(); }

  setTimes(pickup: string, returned: string): void {
    this._pickupTime.set(pickup);
    this._returnTime.set(returned);
    this.persist();
  }

  setCreatedReservation(reservation: Reservation): void { this._createdReservation.set(reservation); }
  setQuotedServiceFee(fee: number | null): void { this._quotedServiceFee.set(fee); }

  setClientName(name: string): void {
    this._clientName.set(name);
    this.persist();
  }

  setClient(id: number | null, name: string): void {
    this._clientId.set(id);
    this._clientName.set(name);
    this.persist();
  }

  setMethod(method: PaymentMethod): void {
    this._method.set(method);
    this.persist();
  }

  reset(): void {
    this._vehicleId.set(null);
    this._start.set(todayISO());
    this._end.set(addDays(todayISO(), 3));
    this._location.set('');
    this._pickupShopId.set(null);
    this._clientName.set('');
    this._clientId.set(null);
    this._method.set('PIX');
    this._pickupTime.set('10:00');
    this._returnTime.set('10:00');
    this._createdReservation.set(null);
    this._quotedServiceFee.set(null);
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ACTIVE_BOOKING_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }

  private persist(): void {
    try {
      if (typeof sessionStorage === 'undefined') return;
      const value: PersistedBooking = {
        vehicleId: this._vehicleId(), start: this._start(), end: this._end(),
        location: this._location(), pickupShopId: this._pickupShopId(),
        clientName: this._clientName(), clientId: this._clientId(), method: this._method(),
        pickupTime: this._pickupTime(), returnTime: this._returnTime(),
      };
      sessionStorage.setItem(ACTIVE_BOOKING_STORAGE_KEY, JSON.stringify(value));
    } catch { /* Storage may be unavailable; booking remains usable in memory. */ }
  }
}
