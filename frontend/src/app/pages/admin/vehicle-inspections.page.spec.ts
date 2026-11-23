import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vehicle } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { VehicleInspectionService } from '../../core/services/vehicle-inspection.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CarComponent } from '../../shared/components/car.component';
import { VehicleInspectionsPage } from './vehicle-inspections.page';

describe('VehicleInspectionsPage', () => {
  const vehicle: Vehicle = {
    id: 17, name: 'Hyundai HB20 2024', version: '', pricePerDay: 125, status: 'Disponível',
    color: '#4a6fa5', category: 'Hatch', transmission: 'Manual', revisions: [], favorite: false,
    plate: 'ABC1D23', mileage: 50000, make: 'Hyundai', model: 'HB20', year: 2024,
    nextInspectionKm: 50000, inspectionDue: true,
  };
  const items = vi.fn(() => []);
  const loadByVehicle = vi.fn(async () => undefined);
  const create = vi.fn(async () => ({
    id: 'inspection-1', tipo: 'periodica' as const, data: '2026-11-23', observacoes: 'Inspeção completa',
    fotos: '[]', carro_id: 17, km: 50000, valor: 185.5, created_at: '', updated_at: '',
  }));
  const vehicleService = {
    loading: () => false, error: () => null, getById: () => vehicle,
    loadOne: vi.fn(async () => vehicle),
  };
  const inspectionService = { loading: () => false, error: () => null, items, loadByVehicle, create };
  const toast = { show: vi.fn(async () => undefined) };
  let fixture: ComponentFixture<VehicleInspectionsPage>;

  beforeEach(async () => {
    items.mockReturnValue([]);
    loadByVehicle.mockClear();
    create.mockClear();
    vehicleService.loadOne.mockClear();
    toast.show.mockClear();
    TestBed.configureTestingModule({
      imports: [VehicleInspectionsPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '17' } } } },
        { provide: VehicleService, useValue: vehicleService },
        { provide: VehicleInspectionService, useValue: inspectionService },
        { provide: ToastService, useValue: toast },
      ],
    });
    TestBed.overrideComponent(VehicleInspectionsPage, {
      remove: { imports: [AppShellComponent, CarComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(VehicleInspectionsPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('shows the selected vehicle, its odometer and pending state', () => {
    expect(fixture.nativeElement.textContent).toContain('ABC1D23');
    expect(fixture.nativeElement.textContent).toContain('50000 km');
    expect(fixture.nativeElement.textContent).toContain('Vistoria pendente');
  });

  it('formats a date-only inspection without shifting it to the previous day', () => {
    expect(fixture.componentInstance.formatDate('2026-11-23T00:00:00.000Z')).toBe('23/11/2026');
  });

  it('registers a completed inspection and refreshes vehicle and history', async () => {
    const page = fixture.componentInstance;
    page.data = '2026-11-23';
    page.descricao = 'Inspeção de freios, pneus e iluminação';
    page.valor = 185.5;
    page.km = 50000;
    page.proximaVistoriaKm = 61000;
    await page.save();

    expect(create).toHaveBeenCalledWith({
      carroId: 17, data: '2026-11-23', descricao: 'Inspeção de freios, pneus e iluminação',
      valor: 185.5, km: 50000, proximaVistoriaKm: 61000,
    });
    expect(loadByVehicle).toHaveBeenCalledWith(17);
    expect(vehicleService.loadOne).toHaveBeenCalledWith(17);
    expect(toast.show).toHaveBeenCalledWith('Vistoria registrada e próximo limite atualizado.');
  });

  it('does not submit a decreasing odometer or a next limit at/below inspection km', async () => {
    const page = fixture.componentInstance;
    page.descricao = 'Teste'; page.valor = 0; page.data = '2026-11-23';
    page.km = 49999; page.proximaVistoriaKm = 60000;
    await page.save();
    expect(create).not.toHaveBeenCalled();
    page.km = 50000; page.proximaVistoriaKm = 50000;
    await page.save();
    expect(create).not.toHaveBeenCalled();
  });
});
