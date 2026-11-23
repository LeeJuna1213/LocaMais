import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VehicleService } from './vehicle.service';
import { BookingService } from './booking.service';

describe('BookingService session restoration', () => {
  beforeEach(() => {
    sessionStorage.removeItem('locamais:active-booking');
    TestBed.configureTestingModule({
      providers: [BookingService, { provide: VehicleService, useValue: { getById: () => undefined } }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('restores the selected vehicle, period and times after a page reload', () => {
    const booking = TestBed.inject(BookingService);
    booking.selectVehicle(42);
    booking.setDates('2026-12-01', '2026-12-04');
    booking.setTimes('09:30', '11:00');
    booking.setPickupShop(8, 'Loja Centro');
    booking.setClient(15, 'Cliente de teste');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [BookingService, { provide: VehicleService, useValue: { getById: () => undefined } }],
    });
    const restored = TestBed.inject(BookingService);

    expect(restored.vehicleId()).toBe(42);
    expect(restored.start()).toBe('2026-12-01');
    expect(restored.end()).toBe('2026-12-04');
    expect(restored.pickupTime()).toBe('09:30');
    expect(restored.returnTime()).toBe('11:00');
    expect(restored.pickupShopId()).toBe(8);
    expect(restored.clientId()).toBe(15);
  });

  it('clears the in-progress reservation from the session when reset', () => {
    const booking = TestBed.inject(BookingService);
    booking.selectVehicle(42);
    expect(sessionStorage.getItem('locamais:active-booking')).not.toBeNull();

    booking.reset();

    expect(sessionStorage.getItem('locamais:active-booking')).toBeNull();
  });
});
