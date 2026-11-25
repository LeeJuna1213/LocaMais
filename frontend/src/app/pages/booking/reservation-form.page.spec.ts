import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { BookingService } from '../../core/services/booking.service';
import { ClientService } from '../../core/services/client.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { ReservationService } from '../../core/services/reservation.service';
import { ShopService } from '../../core/services/shop.service';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AlertController } from '@ionic/angular';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';
import { ReservationFormPage } from './reservation-form.page';

describe('ReservationFormPage pickup shop selection', () => {
  let fixture: ComponentFixture<ReservationFormPage>;
  const firstShop = { id: 11, nome: 'Loja Centro', cidade: 'Niterói', uf: 'RJ', logradouro: 'Rua A', numero: '1', ativa: true };
  const secondShop = { id: 12, nome: 'Loja Norte', cidade: 'São Gonçalo', uf: 'RJ', logradouro: 'Rua B', numero: '2', ativa: true };
  const setPickupShop = vi.fn();
  const loadForVehicle = vi.fn(async () => undefined);

  afterEach(() => {
    fixture?.destroy();
    vi.clearAllMocks();
  });

  it('renders a single-choice checkbox list and persists checking and unchecking the selected shop', async () => {
    const shops = signal([firstShop, secondShop]);
    const booking = {
      vehicleId: () => 3,
      vehicle: () => ({ id: 3, name: 'Toyota Corolla', status: 'Disponível', photo: null, pricePerDay: 100, color: '#000' }),
      start: () => '2026-12-10', end: () => '2026-12-11', pickupTime: () => '10:00', returnTime: () => '10:00',
      location: () => '', pickupShopId: () => null, clientName: () => '', clientId: () => null,
      setPickupShop,
    };
    const shopService = { shops: shops.asReadonly(), loading: signal(false).asReadonly(), error: signal<string | null>(null).asReadonly(), loadForVehicle };
    TestBed.configureTestingModule({
      imports: [ReservationFormPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '3' } }, paramMap: of(convertToParamMap({ id: '3' })) } },
        { provide: Router, useValue: { navigateByUrl: vi.fn(), navigate: vi.fn() } },
        { provide: AuthService, useValue: { role: () => 'client', profile: () => ({ name: 'Cliente' }), home: () => '/client/veiculos' } },
        { provide: BookingService, useValue: booking },
        { provide: ClientService, useValue: { activeClients: () => [], loading: () => false, error: () => null } },
        { provide: VehicleService, useValue: { getById: () => booking.vehicle(), loadOne: vi.fn() } },
        { provide: ToastService, useValue: { show: vi.fn() } },
        { provide: AlertController, useValue: {} },
        { provide: ReservationService, useValue: { checkAvailability: vi.fn(), quote: vi.fn() } },
        { provide: ImageUrlService, useValue: { resolve: () => null } },
        { provide: ShopService, useValue: shopService },
      ],
    });
    TestBed.overrideComponent(ReservationFormPage, {
      remove: { imports: [AppShellComponent, CarComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(ReservationFormPage);
    fixture.detectChanges();
    clearTimeout((fixture.componentInstance as any).availabilityTimer);
    await fixture.whenStable();
    fixture.detectChanges();

    const checkboxes = Array.from(fixture.nativeElement.querySelectorAll('.pickup-shop-option input')) as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(loadForVehicle).toHaveBeenCalledWith(3);

    const checkboxStyle = getComputedStyle(checkboxes[0]);
    expect(checkboxStyle.width).toBe('18px');
    expect(checkboxStyle.height).toBe('18px');
    expect(checkboxStyle.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(checkboxStyle.colorScheme).toBe('light');
    expect(checkboxStyle.webkitAppearance).toBe('checkbox');

    checkboxes[0].click();
    fixture.detectChanges();
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect(setPickupShop).toHaveBeenLastCalledWith(firstShop.id, expect.stringContaining(firstShop.nome));

    checkboxes[1].click();
    fixture.detectChanges();
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
    expect(setPickupShop).toHaveBeenLastCalledWith(secondShop.id, expect.stringContaining(secondShop.nome));

    checkboxes[1].click();
    fixture.detectChanges();
    expect(checkboxes[1].checked).toBe(false);
    expect(setPickupShop).toHaveBeenLastCalledWith(null, '');
  });
});
