import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Vehicle } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { CategoryService } from '../../core/services/category.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';
import { VehicleListPage } from './vehicle-list.page';

const fleet: Vehicle[] = [
  {
    id: 1, name: 'Honda Civic 2024', version: '', pricePerDay: 180, status: 'Disponível',
    color: '#000', category: 'Sedan', transmission: 'Automático', revisions: [], favorite: false,
    make: 'Honda', model: 'Civic', year: 2024,
  },
  {
    id: 2, name: 'Honda Fit 2022', version: '', pricePerDay: 90, status: 'Alugado',
    color: '#000', category: 'Hatch', transmission: 'Manual', revisions: [], favorite: false,
    make: 'Honda', model: 'Fit', year: 2022,
  },
  {
    id: 3, name: 'Toyota Corolla 2023', version: '', pricePerDay: 240, status: 'Em manutenção',
    color: '#000', category: 'Sedan', transmission: 'Automático', revisions: [], favorite: false,
    make: 'Toyota', model: 'Corolla', year: 2023,
  },
];

describe('VehicleListPage dynamic filters', () => {
  const vehicleService = { load: vi.fn(async () => undefined), vehicles: () => fleet, loading: () => false, error: () => null };
  const auth = { role: () => 'client' };
  const router = { navigate: vi.fn(async () => true) };
  const categoryService = {
    load: vi.fn(async () => undefined),
    categories: () => [{ id: 2, nome: 'Hatch' }, { id: 1, nome: 'Sedan' }],
  };
  let fixture: ComponentFixture<VehicleListPage>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [VehicleListPage],
      providers: [
        { provide: VehicleService, useValue: vehicleService },
        { provide: AuthService, useValue: auth },
        { provide: CategoryService, useValue: categoryService },
        { provide: Router, useValue: router },
      ],
    });
    TestBed.overrideComponent(VehicleListPage, {
      remove: { imports: [AppShellComponent, VehicleCardComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(VehicleListPage);
    fixture.detectChanges();
  });

  it('derives make, model, category, and transmission options from actual vehicle data', () => {
    const page = fixture.componentInstance;
    expect(page.makes).toEqual(['Honda', 'Toyota']);
    expect(page.models).toEqual(['Civic', 'Corolla', 'Fit']);
    expect(page.categories).toEqual(['Hatch', 'Sedan']);
    expect(page.transmissionOptions).toEqual(['Todas', 'Automático', 'Manual']);
  });

  it('filters on each selection and combines manufacturer, model, category, transmission, price, and status', () => {
    const page = fixture.componentInstance;
    expect(page.filteredVehicles).toHaveLength(3);
    page.make = 'Honda';
    expect(page.filteredVehicles.map((vehicle) => vehicle.id)).toEqual([1, 2]);
    page.model = 'Civic';
    page.category = 'Sedan';
    page.transmission = 'Automático';
    page.priceRange = '100-200';
    page.status = 'Disponível';
    expect(page.filteredVehicles.map((vehicle) => vehicle.id)).toEqual([1]);

    page.model = 'Fit';
    expect(page.filteredVehicles).toEqual([]);
  });

  it('clears all filters and restores the entire fleet', () => {
    const page = fixture.componentInstance;
    page.query = 'not found';
    page.category = 'Sedan';
    page.make = 'Honda';
    page.model = 'Civic';
    page.priceRange = '200-300';
    page.transmission = 'Manual';
    page.status = 'Alugado';
    page.clearFilters();
    expect(page.filteredVehicles).toHaveLength(3);
    expect(page.category).toBe('Todas');
    expect(page.model).toBe('');
    expect(page.status).toBe('Todos');
    expect(page.priceRange).toBe('');
  });

  it('keeps only category and make visible until the more-filters control is expanded', () => {
    const page = fixture.componentInstance;
    const primaryFields = fixture.nativeElement.querySelector('.fl')?.querySelectorAll('select');
    expect(primaryFields).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.filter-panel')?.classList.contains('expanded')).toBe(false);
    page.showMoreFilters = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.filter-panel')?.classList.contains('expanded')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Faixa de preço');
    expect(fixture.nativeElement.textContent).toContain('Disponibilidade');
  });
});
