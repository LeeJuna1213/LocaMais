import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Vehicle } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { NewVehiclePage } from './new-vehicle.page';

const vehicle: Vehicle = {
  id: 17, name: 'Hyundai HB20 2024', version: '', pricePerDay: 125,
  status: 'Disponível', color: '#4a6fa5', category: 'Economico', transmission: 'Manual',
  revisions: [], favorite: false, plate: 'ABC1D23', photo: '/uploads/carros/current.jpg',
  make: 'Hyundai', model: 'HB20', year: 2024, lugares: 5, descricao: 'Descrição existente',
};

describe('NewVehiclePage create/edit form', () => {
  let routeId = '';
  let resolveLoad: ((loaded: Vehicle) => void) | undefined;
  const loadOne = vi.fn(() => new Promise<Vehicle>((resolve) => { resolveLoad = resolve; }));
  const create = vi.fn(async () => vehicle);
  const update = vi.fn(async () => vehicle);
  const uploadPhoto = vi.fn(async () => vehicle);
  const load = vi.fn(async () => undefined);
  const removePhoto = vi.fn(async () => vehicle);
  const vehicleService = { load, loadOne, create, update, uploadPhoto, removePhoto, vehicles: () => [vehicle] };
  const toast = { show: vi.fn(async () => undefined) };
  const router = { navigateByUrl: vi.fn(async () => true) };
  let fixture: ComponentFixture<NewVehiclePage>;
  const nativeCreateObjectURL = URL.createObjectURL;
  const nativeRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(async () => {
    routeId = '';
    resolveLoad = undefined;
    loadOne.mockReset().mockImplementation(() => new Promise<Vehicle>((resolve) => { resolveLoad = resolve; }));
    create.mockReset().mockResolvedValue(vehicle);
    update.mockReset().mockResolvedValue(vehicle);
    uploadPhoto.mockReset().mockResolvedValue(vehicle);
    load.mockReset().mockResolvedValue(undefined);
    removePhoto.mockReset().mockResolvedValue(vehicle);
    toast.show.mockClear();
    router.navigateByUrl.mockClear();
    URL.createObjectURL = vi.fn(() => 'blob:mock-photo');
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      imports: [NewVehiclePage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeId } } } },
        { provide: Router, useValue: router },
        { provide: VehicleService, useValue: vehicleService },
        { provide: ImageUrlService, useValue: { resolve: (path: string | null) => path ? `https://api.test${path}` : null } },
        { provide: ToastService, useValue: toast },
      ],
    });
    TestBed.overrideComponent(NewVehiclePage, {
      remove: { imports: [AppShellComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
  });

  afterEach(() => {
    URL.createObjectURL = nativeCreateObjectURL;
    URL.revokeObjectURL = nativeRevokeObjectURL;
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(NewVehiclePage);
    fixture.detectChanges();
    if (routeId) resolveLoad?.(vehicle);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function choosePhoto(file: File): void {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    if (!input) throw new Error('Seletor de foto não encontrado');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    fixture.componentInstance.selectPhoto({ target: input } as unknown as Event);
    fixture.detectChanges();
  }

  function photo(name: string, type: string, size = 1024): File {
    return { name, type, size } as File;
  }

  function fillValidForm(page: NewVehiclePage): void {
    page.placa = 'ABC1D23';
    page.marca = 'Hyundai';
    page.modelo = 'HB20';
    page.categoria = 'Economico';
    page.ano = 2024;
    page.valorDiaria = 125.5;
    page.transmission = 'Manual';
    page.lugares = 5;
  }

  it('does not submit blank or invalid fields and shows nearby validation errors', async () => {
    await render();
    await fixture.componentInstance.save();

    expect(create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.fieldError('placa')).toBe('Este campo é obrigatório.');
    expect(toast.show).toHaveBeenCalledWith('Revise os campos destacados antes de continuar.');

    fillValidForm(fixture.componentInstance);
    fixture.componentInstance.ano = 1800;
    expect(fixture.componentInstance.fieldError('ano')).toContain('entre 1900');
  });

  it('sends only DTO fields to POST and navigates back after successful creation', async () => {
    await render();
    const page = fixture.componentInstance;
    fillValidForm(page);
    await page.save();

    expect(create).toHaveBeenCalledWith({
      placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoria: 'Economico',
      ano: 2024, valorDiaria: 125.5, status: 'disponivel', cambio: 'Manual', lugares: 5, descricao: null,
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/veiculos');
  });

  it('loads persisted vehicle values, renders the form after the async GET and PATCHes two changed fields', async () => {
    routeId = '17';
    await render();
    const page = fixture.componentInstance;

    expect(page.editing).toBe(true);
    expect(page.placa).toBe('ABC1D23');
    expect(page.categoria).toBe('Economico');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Carregando veículo...');

    page.categoria = 'SUV Esportiva';
    page.valorDiaria = 520.5;
    page.transmission = 'Automático';
    await page.save();

    expect(update).toHaveBeenCalledWith(17, { categoria: 'SUV Esportiva', valorDiaria: 520.5, cambio: 'Automático' });
    expect(create).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/veiculos');
  });

  it('uploads the selected photo with the ID returned by creation', async () => {
    await render();
    const page = fixture.componentInstance;
    fillValidForm(page);
    const file = photo('carro.jpg', 'image/jpeg');
    choosePhoto(file);

    expect(page.previewUrl).toBe('blob:mock-photo');
    await page.save();

    expect(create).toHaveBeenCalledTimes(1);
    expect(uploadPhoto).toHaveBeenCalledWith(vehicle.id, file);
    expect(toast.show).toHaveBeenCalledWith('Veículo cadastrado com sucesso.');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/veiculos');
  });

  it('keeps the existing photo when untouched and replaces it only through the confirmed upload response', async () => {
    routeId = '17';
    await render();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('img[alt="Foto atual do veículo"]')?.getAttribute('src'))
      .toBe('https://api.test/uploads/carros/current.jpg');

    await page.save();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(removePhoto).not.toHaveBeenCalled();
    expect(page.currentPhoto).toBe('/uploads/carros/current.jpg');

    const replacement = photo('novo.webp', 'image/webp');
    choosePhoto(replacement);
    uploadPhoto.mockResolvedValueOnce({ ...vehicle, photo: '/uploads/carros/replacement.webp' });
    await page.save();
    expect(uploadPhoto).toHaveBeenCalledWith(17, replacement);
    expect(removePhoto).not.toHaveBeenCalled();
    expect(page.currentPhoto).toBe('/uploads/carros/replacement.webp');
  });

  it('removes the current photo only after the existing remove endpoint succeeds', async () => {
    routeId = '17';
    await render();
    const page = fixture.componentInstance;
    page.removePhoto();
    expect(page.currentPhoto).toBe('/uploads/carros/current.jpg');
    expect(removePhoto).not.toHaveBeenCalled();
    removePhoto.mockResolvedValueOnce({ ...vehicle, photo: null });
    await page.save();
    expect(removePhoto).toHaveBeenCalledWith(17);
    expect(page.currentPhoto).toBeNull();
  });

  it('rejects an invalid photo without creating the vehicle and allows replacing or removing it', async () => {
    await render();
    const page = fixture.componentInstance;
    fillValidForm(page);
    choosePhoto(photo('carro.gif', 'image/gif'));

    expect(page.photoError).toContain('JPG, PNG ou WebP');
    expect(page.pendingPhoto).toBeNull();
    await page.save();
    // Um arquivo inválido bloqueia o submit até ser removido/corrigido.
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    page.removePhoto();
    await page.save();
    expect(create).toHaveBeenCalledTimes(1);

    const valid = photo('carro.png', 'image/png');
    choosePhoto(valid);
    expect(page.pendingPhoto).toBe(valid);
    expect(page.photoError).toBeNull();
    choosePhoto(photo('maior.png', 'image/png', 5 * 1024 * 1024 + 1));
    expect(page.pendingPhoto).toBeNull();

    choosePhoto(valid);
    page.removePhoto();
    expect(page.pendingPhoto).toBeNull();
    expect(page.previewUrl).toBeNull();
  });

  it('surfaces an API failure without navigating away', async () => {
    create.mockRejectedValueOnce(new Error('A placa já está cadastrada.'));
    await render();
    fillValidForm(fixture.componentInstance);
    await fixture.componentInstance.save();

    expect(toast.show).toHaveBeenCalledWith('A placa já está cadastrada.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
