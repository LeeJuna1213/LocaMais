import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { ReservationQuote, ReservationService } from '../../core/services/reservation.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';
import { ConfirmReservationPage } from './confirm-reservation.page';

describe('ConfirmReservationPage financial summary', () => {
  let fixture: ComponentFixture<ConfirmReservationPage>;
  const quote: ReservationQuote = {
    valorDiaria: 250, diarias: 3, valorSubtotal: 750, taxaServico: 30, valorTotal: 780,
  };
  const quoteRequest = vi.fn(async () => quote);
  const loadVehicle = vi.fn(async () => booking.vehicle());
  const markForCheck = vi.fn();
  const setQuotedServiceFee = vi.fn();
  const router = { navigateByUrl: vi.fn(async () => true), navigate: vi.fn(async () => true) };
  const booking = {
    vehicle: signal<Vehicle | undefined>({ id: 12, name: 'Veículo teste', version: 'Modelo', color: '#000', photo: null } as Vehicle),
    vehicleId: signal(12), start: signal('2026-12-01'), end: signal('2026-12-04'),
    pickupTime: signal('10:00'), returnTime: signal('10:00'), location: signal('Loja Centro'),
    clientName: signal('Cliente'), setQuotedServiceFee,
  };

  beforeEach(async () => {
    quoteRequest.mockClear();
    loadVehicle.mockClear();
    setQuotedServiceFee.mockClear();
    markForCheck.mockClear();
    router.navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [ConfirmReservationPage],
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { role: () => 'cliente', profile: () => ({ name: 'Cliente' }), home: () => '/client' } },
        { provide: BookingService, useValue: booking },
        { provide: ImageUrlService, useValue: { resolve: () => null } },
        { provide: ReservationService, useValue: { quote: quoteRequest } },
        { provide: VehicleService, useValue: { loadOne: loadVehicle } },
      ],
    });
    TestBed.overrideComponent(ConfirmReservationPage, {
      remove: { imports: [AppShellComponent, CarComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ConfirmReservationPage);
    fixture.componentInstance.quote = quote;
    fixture.componentInstance.quoteLoading = false;
    vi.spyOn(fixture.componentInstance, 'loadFee').mockResolvedValue();
    vi.spyOn((fixture.componentInstance as any).changeDetector as ChangeDetectorRef, 'markForCheck').mockImplementation(markForCheck);
    fixture.detectChanges();
    markForCheck.mockClear();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('shows the server quote with the reservation period and clear financial labels', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('01/12/2026 a 04/12/2026');
    expect(text).toContain('3 diárias');
    expect(text).toContain('R$');
    expect(text).toContain('750,00');
    expect(text).toContain('30,00');
    expect(text).toContain('780,00');
  });

  it('requests a fresh backend quote for the selected vehicle, dates and times', async () => {
    const page = fixture.componentInstance;
    vi.spyOn(page, 'loadFee').mockRestore();
    await page.loadFee();
    expect(quoteRequest).toHaveBeenCalledWith({
      vehicleId: 12, start: '2026-12-01', end: '2026-12-04', pickupTime: '10:00', returnTime: '10:00',
    });
    expect(page.quote).toEqual(quote);
    expect(setQuotedServiceFee).toHaveBeenCalledWith(30);
    expect(markForCheck).toHaveBeenCalled();
  });

  it('reloads a missing vehicle from the API before quoting after a page refresh', async () => {
    const page = fixture.componentInstance;
    vi.spyOn(page, 'loadFee').mockRestore();
    booking.vehicle.set(undefined);

    await page.loadFee();

    expect(loadVehicle).toHaveBeenCalledWith(12);
    expect(quoteRequest).toHaveBeenCalledWith({
      vehicleId: 12, start: '2026-12-01', end: '2026-12-04', pickupTime: '10:00', returnTime: '10:00',
    });
    booking.vehicle.set({ id: 12, name: 'Veículo teste', version: 'Modelo', color: '#000', photo: null } as Vehicle);
  });

});
