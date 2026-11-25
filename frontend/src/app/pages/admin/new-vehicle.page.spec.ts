import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Vehicle } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { CategoryService } from '../../core/services/category.service';
import { ShopService } from '../../core/services/shop.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { NewVehiclePage } from './new-vehicle.page';

const vehicle: Vehicle = {
  id: 17, name: 'Hyundai HB20 2024', version: '', pricePerDay: 125,
  status: 'Disponível', color: '#4a6fa5', category: 'Economico', categoryId: 1, transmission: 'Manual',
  revisions: [], favorite: false, plate: 'ABC1D23', photo: '/uploads/carros/current.jpg',
  make: 'Hyundai', model: 'HB20', year: 2024, lugares: 5, descricao: 'Descrição existente',
  nextInspectionKm: 50000,
  shopIds: [1],
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
  const categories = [{ id: 1, nome: 'Economico' }];
  const categoryService = { categories: () => categories, load: vi.fn(async () => undefined), create: vi.fn(async (nome: string) => ({ id: 2, nome })) };
  const shopService = { shops: () => [{ id: 1, nome: 'Loja Centro', cidade: 'Niterói', uf: 'RJ', ativa: true }], loading: () => false, error: () => null, loadActive: vi.fn(async () => undefined) };
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
    shopService.loadActive.mockClear();
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
        { provide: CategoryService, useValue: categoryService },
        { provide: ShopService, useValue: shopService },
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
    page.categoriaId = 1;
    page.ano = 2024;
    page.valorDiaria = 125.5;
    page.transmission = 'Manual';
    page.lugares = 5;
    page.selectedShopIds = [1];
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

  it('normalizes plate input to uppercase and validates supported Brazilian formats', async () => {
    await render();
    const page = fixture.componentInstance;
    page.submitted = true;
    const cases: Array<[string, boolean]> = [
      ['ABC-1234', true], ['ABC1234', true], ['ABC1D23', true], ['abc-1234', true],
      ['ABC12D3', false], ['AB12345', false], ['ABC-12345', false], ['ABC@1234', false],
    ];

    const input = fixture.nativeElement.querySelector('#vehicle-plate') as HTMLInputElement;
    input.value = 'abc-1234';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(page.placa).toBe('ABC-1234');

    for (const [plate, valid] of cases) {
      page.onPlateInput(plate);
      expect(page.placa).toBe(plate.toUpperCase());
      expect(page.fieldError('placa') === null).toBe(valid);
    }
  });

  it('does not submit creation when the plate format is invalid', async () => {
    await render();
    const page = fixture.componentInstance;
    fillValidForm(page);
    page.onPlateInput('ABC@1234');
    await page.save();

    expect(create).not.toHaveBeenCalled();
    expect(page.fieldError('placa')).toContain('ABC-1234, ABC1234 ou ABC1D23');
  });

  it('requires at least one active pickup shop before creating a vehicle', async () => {
    await render();
    const page = fixture.componentInstance;
    fillValidForm(page);
    page.selectedShopIds = [];
    await page.save();
    expect(create).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Selecione pelo menos uma loja para disponibilizar o veículo.');
  });

  it('allows selecting and unselecting a shop from its checkbox', async () => {
    await render();
    const checkbox = fixture.nativeElement.querySelector('.shop-options input[type="checkbox"]') as HTMLInputElement;

    checkbox.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedShopIds).toEqual([1]);
    expect(checkbox.checked).toBe(true);

    checkbox.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedShopIds).toEqual([]);
    expect(checkbox.checked).toBe(false);
  });

  it('does not submit plate changes in edit mode when the format is invalid', async () => {
    routeId = '17';
    await render();
    const page = fixture.componentInstance;
    page.onPlateInput('ABC12D3');
    await page.save();

    expect(update).not.toHaveBeenCalled();
    expect(page.fieldError('placa')).toContain('ABC-1234, ABC1234 ou ABC1D23');
  });

  it('uses shared equal-size photo action styling in edit mode', async () => {
    routeId = '17';
    await render();
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.photo-actions .photo-action')) as HTMLButtonElement[];

    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('Trocar foto');
    expect(buttons[1].textContent).toContain('Remover foto');
    expect(buttons.every((button) => button.classList.contains('photo-action'))).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.photo-actions ion-icon')).toHaveLength(2);
  });

  it('uses a free-text model input and persisted categories with an inline add-category action', async () => {
    await render();
    const model = fixture.nativeElement.querySelector('#vehicle-model') as HTMLInputElement;
    const category = fixture.nativeElement.querySelector('#vehicle-category') as HTMLSelectElement;
    expect(model.tagName).toBe('INPUT');
    expect(model.hasAttribute('list')).toBe(false);
    expect(fixture.nativeElement.querySelector('datalist')).toBeNull();
    expect(Array.from(category.options).map((option) => option.textContent?.trim())).toContain('Economico');
    expect(Array.from(category.options).map((option) => option.textContent?.trim())).toContain('Adicionar nova categoria');

    fixture.componentInstance.onCategoryChange('new');
    fixture.componentInstance.newCategoryName = 'SUV Esportiva';
    await fixture.componentInstance.addCategory();
    expect(categoryService.create).toHaveBeenCalledWith('SUV Esportiva');
    expect(fixture.componentInstance.categoriaId).toBe(2);
  });

  it('sends only DTO fields to POST and navigates back after successful creation', async () => {
    await render();
    const page = fixture.componentInstance;
    fillValidForm(page);
    await page.save();

    expect(create).toHaveBeenCalledWith({
      placa: 'ABC1D23', marca: 'Hyundai', modelo: 'HB20', categoriaId: 1,
       ano: 2024, valorDiaria: 125.5, status: 'disponivel', cambio: 'Manual', lugares: 5, descricao: null,
       proximaVistoriaKm: null,
       lojas_ids: [1],
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/veiculos');
  });

  it('loads persisted vehicle values, renders the form after the async GET and PATCHes two changed fields', async () => {
    routeId = '17';
    await render();
    const page = fixture.componentInstance;

    expect(page.editing).toBe(true);
    expect(page.placa).toBe('ABC1D23');
    expect(page.categoriaId).toBe(1);
    expect(page.proximaVistoriaKm).toBe(50000);
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Carregando veículo...');

    page.categoriaId = 2;
    page.valorDiaria = 520.5;
    page.transmission = 'Automático';
    await page.save();

    expect(update).toHaveBeenCalledWith(17, { categoriaId: 2, valorDiaria: 520.5, cambio: 'Automático' });
    expect(create).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/veiculos');
  });

  it('persists and edits an individual inspection limit without losing it on unrelated edits', async () => {
    await render();
    const page = fixture.componentInstance;
    fillValidForm(page);
    page.proximaVistoriaKm = 50000;
    await page.save();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ proximaVistoriaKm: 50000 }));

    routeId = '17';
    await render();
    expect(fixture.componentInstance.proximaVistoriaKm).toBe(50000);
    fixture.componentInstance.marca = 'Hyundai atualizado';
    await fixture.componentInstance.save();
    expect(update).toHaveBeenCalledWith(17, { marca: 'Hyundai atualizado' });

    fixture.componentInstance.marca = 'Hyundai';
    fixture.componentInstance.proximaVistoriaKm = 61000;
    await fixture.componentInstance.save();
    expect(update).toHaveBeenLastCalledWith(17, { proximaVistoriaKm: 61000 });
  });

  it('rejects negative or fractional inspection limits', async () => {
    await render();
    const page = fixture.componentInstance;
    page.proximaVistoriaKm = -1;
    expect(page.fieldError('proximaVistoriaKm')).toBeNull();
    page.submitted = true;
    expect(page.fieldError('proximaVistoriaKm')).toContain('inteiro não negativo');
    page.proximaVistoriaKm = 1000.5;
    expect(page.fieldError('proximaVistoriaKm')).toContain('inteiro não negativo');
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
