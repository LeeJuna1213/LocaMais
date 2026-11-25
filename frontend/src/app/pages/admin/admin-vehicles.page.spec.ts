import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Vehicle } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';
import { AdminVehiclesPage } from './admin-vehicles.page';

const vehicle: Vehicle = {
  id: 17, name: 'Hyundai HB20 2024', version: '', pricePerDay: 125,
  status: 'Disponível', color: '#4a6fa5', category: 'Economico', transmission: null,
  revisions: [], favorite: false, plate: 'ABC1D23', photo: '/uploads/carros/atual.webp',
  make: 'Hyundai', model: 'HB20', year: 2024,
};

describe('AdminVehiclesPage vehicle management', () => {
  const load = vi.fn(async () => undefined);
  const remove = vi.fn(async () => undefined);
  const uploadPhoto = vi.fn(async () => vehicle);
  const vehicleService = {
    vehicles: () => [vehicle], loading: () => false, error: () => null,
    load, remove, uploadPhoto,
  };
  const toast = { show: vi.fn(async () => undefined) };
  const router = { navigate: vi.fn(async () => true), navigateByUrl: vi.fn(async () => true) };
  const alert = { present: vi.fn(async () => undefined), onDidDismiss: vi.fn(async () => ({ role: 'cancel' })) };
  const alerts = { create: vi.fn(async () => alert) };
  const actionSheet = { present: vi.fn(async () => undefined) };
  let options: { buttons: Array<{ text?: string; handler?: () => unknown }> } | null = null;
  const actionSheets = {
    create: vi.fn(async (input: { buttons: Array<{ text?: string; handler?: () => unknown }> }) => {
      options = input;
      return actionSheet;
    }),
  };
  let fixture: ComponentFixture<AdminVehiclesPage>;

  beforeEach(async () => {
    load.mockClear();
    remove.mockReset().mockResolvedValue(undefined);
    uploadPhoto.mockReset().mockResolvedValue(vehicle);
    toast.show.mockClear();
    router.navigate.mockClear();
    router.navigateByUrl.mockClear();
    alerts.create.mockClear();
    alert.onDidDismiss.mockReset().mockResolvedValue({ role: 'cancel' });
    actionSheets.create.mockClear();
    actionSheet.present.mockClear();
    options = null;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:car-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });

    TestBed.configureTestingModule({
      imports: [AdminVehiclesPage],
      providers: [
        { provide: VehicleService, useValue: vehicleService },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
        { provide: AlertController, useValue: alerts },
        { provide: ActionSheetController, useValue: actionSheets },
      ],
    });
    TestBed.overrideComponent(AdminVehiclesPage, {
      remove: { imports: [AppShellComponent, VehicleCardComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(AdminVehiclesPage);
    fixture.detectChanges();
  });

  it('offers edit, photo replacement and vehicle deletion from the row action menu', async () => {
    const input = document.createElement('input');
    await fixture.componentInstance.openActions(vehicle, input);
    expect(actionSheet.present).toHaveBeenCalledOnce();
    expect(options?.buttons.map((button) => button.text)).toEqual([
      'Editar veículo', 'Alterar foto', 'Excluir veículo', 'Cancelar',
    ]);
  });

  it('offers both revision/status and inspection history when a vehicle is selected', async () => {
    await fixture.componentInstance.open(vehicle);
    expect(options?.buttons.map((button) => button.text)).toEqual(['Revisão e Status', 'Vistorias', 'Cancelar']);
    expect(options?.buttons.map((button) => (button as { icon?: string }).icon ?? null)).toEqual(['build-outline', 'clipboard-outline', null]);
    options?.buttons[1]?.handler?.();
    expect(router.navigate).toHaveBeenCalledWith(['/admin/veiculos', vehicle.id, 'vistorias']);
  });

  it('does not expose photo removal in the listing action menu', async () => {
    await fixture.componentInstance.openActions({ ...vehicle, photo: null }, document.createElement('input'));
    expect(options?.buttons.map((button) => button.text)).toEqual([
      'Editar veículo', 'Adicionar foto', 'Excluir veículo', 'Cancelar',
    ]);
  });

  it('confirms deletion and surfaces the backend conflict instead of changing status locally', async () => {
    alert.onDidDismiss.mockResolvedValueOnce({ role: 'confirm' });
    remove.mockRejectedValueOnce(new Error('veiculo possui reservas e nao pode ser removido fisicamente'));
    await fixture.componentInstance.confirmVehicleRemoval(vehicle);

    expect(alerts.create).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining(vehicle.name),
    }));
    expect(remove).toHaveBeenCalledWith(vehicle.id);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('O backend não permitiu excluir este veículo.'));
  });

  it('previews and uploads the selected photo to the vehicle endpoint service', async () => {
    const input = document.createElement('input');
    const click = vi.spyOn(input, 'click');
    fixture.componentInstance.choosePhoto(vehicle, input);
    expect(click).toHaveBeenCalledOnce();

    const file = new File(['png bytes'], 'car.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    const event = { target: input } as unknown as Event;
    fixture.componentInstance.selectPhoto(event);
    expect(fixture.componentInstance.previewUrl).toBe('blob:car-preview');
    await fixture.componentInstance.uploadPhoto();

    expect(uploadPhoto).toHaveBeenCalledWith(vehicle.id, file);
    expect(fixture.componentInstance.pendingPhoto).toBeNull();
    expect(toast.show).toHaveBeenCalledWith('Foto do veículo atualizada com sucesso.');
  });

});
