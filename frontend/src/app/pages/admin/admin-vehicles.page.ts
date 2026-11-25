import { Component, OnDestroy, inject } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { buildOutline, cameraOutline, clipboardOutline, createOutline, trashOutline } from 'ionicons/icons';
import { Router } from '@angular/router';

import { Vehicle } from '../../core/models';
import { ToastService } from '../../core/services/toast.service';
import { VehicleService } from '../../core/services/vehicle.service';
import { VEHICLE_PHOTO_ACCEPT, VEHICLE_PHOTO_ERROR, vehiclePhotoError } from '../../core/utils/photo.validation';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { VehicleCardComponent } from '../../shared/components/vehicle-card.component';

@Component({
  selector: 'app-admin-vehicles',
  standalone: true,
  imports: [AppShellComponent, VehicleCardComponent],
  styles: [`
    .file-input { display: none; }
    .photo-preview { display: flex; align-items: center; gap: 12px; }
    .photo-preview img { width: 68px; height: 68px; border-radius: 10px; object-fit: cover; }
    .photo-preview-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .photo-preview-actions button { min-height: 38px; }
    .photo-preview-actions button:focus-visible { outline: 2px solid #e86f12; outline-offset: 2px; }
  `],
  template: `
    <app-shell title="Veículos" [back]="true" defaultHref="/admin/menu" [showNav]="true" role="admin" activeTab="veiculos">
      @if (pendingPhoto && pendingPhotoVehicle) {
        <div class="card" aria-live="polite">
          <div class="photo-preview">
            <img [src]="previewUrl" alt="Pré-visualização da foto selecionada" />
            <div>
              <b>Nova foto</b>
              <div class="small muted">{{ pendingPhotoVehicle.name }}</div>
            </div>
          </div>
          <div class="photo-preview-actions">
            <button class="btn" type="button" [disabled]="uploadingPhoto" (click)="uploadPhoto()">
              {{ uploadingPhoto ? 'Enviando...' : 'Salvar foto' }}
            </button>
            <button class="lnk dark" type="button" [disabled]="uploadingPhoto" (click)="cancelPhoto()">Cancelar</button>
          </div>
        </div>
      }

      <input #photoInput class="file-input" type="file" [attr.accept]="photoAccept" (change)="selectPhoto($event)" />

      @if (vehicleService.loading()) {
        <div class="card empty" role="status">Carregando veículos...</div>
      } @else if (vehicleService.error(); as error) {
        <div class="card empty" role="alert">{{ error }}</div>
        <button class="btn" type="button" (click)="vehicleService.load()">Tentar novamente</button>
      } @else {
        @for (vehicle of vehicleService.vehicles(); track vehicle.id) {
          <app-vehicle-card
            [vehicle]="vehicle"
            [adminActions]="true"
            [actionsDisabled]="busyVehicleId !== null || uploadingPhoto"
            (selected)="open($event)"
            (manage)="openActions($event, photoInput)"
          />
        } @empty {
          <div class="card empty">Nenhum veículo cadastrado</div>
        }
      }

      <button class="btn" type="button" [disabled]="busyVehicleId !== null || uploadingPhoto" (click)="newVehicle()">Cadastrar veículo</button>
    </app-shell>
  `,
})
export class AdminVehiclesPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);
  readonly vehicleService = inject(VehicleService);
  readonly photoAccept = VEHICLE_PHOTO_ACCEPT;

  busyVehicleId: number | null = null;
  uploadingPhoto = false;
  pendingPhotoVehicle: Vehicle | null = null;
  pendingPhoto: File | null = null;
  previewUrl: string | null = null;

  constructor() {
    addIcons({ buildOutline, cameraOutline, clipboardOutline, createOutline, trashOutline });
    void this.vehicleService.load();
  }

  ngOnDestroy(): void {
    this.releasePreview();
  }

  async open(vehicle: Vehicle): Promise<void> {
    const actionSheet = await this.actionSheets.create({
      header: vehicle.name,
      buttons: [
        { text: 'Revisão e Status', icon: 'build-outline', handler: () => { void this.router.navigate(['/admin/veiculos', vehicle.id, 'revisoes']); } },
        { text: 'Vistorias', icon: 'clipboard-outline', handler: () => { void this.router.navigate(['/admin/veiculos', vehicle.id, 'vistorias']); } },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });
    await actionSheet.present();
  }

  async newVehicle(): Promise<void> {
    await this.router.navigateByUrl('/admin/veiculos/novo');
  }

  async openActions(vehicle: Vehicle, photoInput: HTMLInputElement): Promise<void> {
    if (this.busyVehicleId !== null || this.uploadingPhoto) return;

    const buttons = [
      { text: 'Editar veículo', icon: 'create-outline', handler: () => this.edit(vehicle) },
      {
        text: vehicle.photo ? 'Alterar foto' : 'Adicionar foto',
        icon: 'camera-outline',
        handler: () => this.choosePhoto(vehicle, photoInput),
      },
      { text: 'Excluir veículo', role: 'destructive', icon: 'trash-outline', handler: () => this.confirmVehicleRemoval(vehicle) },
      { text: 'Cancelar', role: 'cancel' },
    ];

    const actionSheet = await this.actionSheets.create({ header: vehicle.name, buttons });
    await actionSheet.present();
  }

  async edit(vehicle: Vehicle): Promise<void> {
    await this.router.navigate(['/admin/veiculos', vehicle.id, 'editar']);
  }

  choosePhoto(vehicle: Vehicle, photoInput: HTMLInputElement): void {
    if (this.uploadingPhoto || this.busyVehicleId !== null) return;
    this.pendingPhotoVehicle = vehicle;
    photoInput.click();
  }

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.pendingPhotoVehicle) return;

    const error = vehiclePhotoError(file);
    if (error) {
      this.cancelPhoto();
      void this.toast.show(error ?? VEHICLE_PHOTO_ERROR);
      return;
    }

    this.releasePreview();
    this.pendingPhoto = file;
    this.previewUrl = URL.createObjectURL(file);
  }

  async uploadPhoto(): Promise<void> {
    const vehicle = this.pendingPhotoVehicle;
    const file = this.pendingPhoto;
    if (!vehicle || !file || this.uploadingPhoto || this.busyVehicleId !== null) return;

    this.uploadingPhoto = true;
    try {
      await this.vehicleService.uploadPhoto(vehicle.id, file);
      this.cancelPhoto();
      await this.toast.show('Foto do veículo atualizada com sucesso.');
    } catch (error) {
      await this.toast.show(this.errorMessage(error, 'Não foi possível enviar a foto do veículo.'));
    } finally {
      this.uploadingPhoto = false;
    }
  }

  cancelPhoto(): void {
    this.pendingPhoto = null;
    this.pendingPhotoVehicle = null;
    this.releasePreview();
  }

  async confirmVehicleRemoval(vehicle: Vehicle): Promise<void> {
    if (this.busyVehicleId !== null || this.uploadingPhoto) return;
    const alert = await this.alerts.create({
      header: 'Excluir veículo?',
      message: `O veículo “${vehicle.name}” será excluído. O backend pode impedir a exclusão se houver vínculos ou se o veículo não estiver disponível.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Excluir', role: 'confirm' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm' || this.busyVehicleId !== null || this.uploadingPhoto) return;

    this.busyVehicleId = vehicle.id;
    try {
      await this.vehicleService.remove(vehicle.id);
      await this.toast.show('Veículo excluído com sucesso.');
    } catch (error) {
      await this.toast.show(this.errorMessage(error, 'Não foi possível excluir o veículo.'));
    } finally {
      this.busyVehicleId = null;
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) return fallback;
    if (/reserva|alugad|manutenç|dispon[ií]vel/i.test(error.message)) {
      return `O backend não permitiu excluir este veículo. ${error.message}`;
    }
    return error.message || fallback;
  }

  private releasePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }
}
