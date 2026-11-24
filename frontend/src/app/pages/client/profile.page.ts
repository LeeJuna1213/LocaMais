import { Component, inject } from '@angular/core';
import { ActionSheetController, AlertController, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  createOutline,
  heartOutline,
  idCardOutline,
  locationOutline,
  lockClosedOutline,
  logOutOutline,
  personOutline,
  notificationsOutline,
  trashOutline,
} from 'ionicons/icons';
import { Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { ToastService } from '../../core/services/toast.service';
import { NotificationService } from '../../core/services/notification.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const VALID_PHOTO_TYPES: Record<string, string[]> = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [AppShellComponent, IonIcon],
  styles: [`
    .profile-heading { display: flex; align-items: center; gap: 18px; }
    .profile-photo-frame { position: relative; width: 92px; height: 92px; flex: 0 0 92px; }
    .profile-photo, .avatar { width: 92px; height: 92px; border-radius: 50%; }
    .profile-photo { display: block; object-fit: cover; border: 3px solid #ffe2c7; }
    .avatar { display: grid; place-items: center; background: #fff0e2; color: #9c4c0c; font-size: 34px; font-weight: 700; }
    .profile-photo[hidden], .avatar[hidden] { display: none !important; }
    .photo-edit-button { position: absolute; right: -4px; bottom: -4px; width: 30px; height: 30px; padding: 0; border: 2px solid #fff; border-radius: 50%; display: grid; place-items: center; background: #e86f12; color: #fff; box-shadow: 0 2px 7px #0003; cursor: pointer; }
    .photo-edit-button ion-icon { font-size: 16px; }
    .photo-edit-button:focus-visible { outline: 3px solid #15243b; outline-offset: 3px; }
    .photo-edit-button:disabled { opacity: .55; cursor: not-allowed; }
    .photo-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .photo-actions button { min-height: 38px; }
    .photo-error { color: #b42318; font-size: 12px; margin-top: 8px; }
    .file-input { display: none; }
    .profile-logout { display: flex; align-items: center; justify-content: center; gap: 9px; }
    .profile-logout ion-icon { width: 20px; height: 20px; font-size: 20px; }
    .notification-count { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #e86f12; color: #fff; font-size: 11px; font-weight: 700; }
  `],
  template: `
    <app-shell title="Meu perfil" [showNav]="true" role="client" activeTab="perfil">
      <div class="card">
        <div class="profile-heading">
          <div class="profile-photo-frame">
            <img class="profile-photo" [hidden]="!photoSource || imageFailed" [src]="photoSource" alt="Foto de perfil" (error)="imageFailed = true" />
            <div class="avatar" [hidden]="!!photoSource && !imageFailed" aria-label="Avatar padrão">{{ initial }}</div>
            <button class="photo-edit-button" type="button" aria-label="Ações da foto de perfil" aria-haspopup="dialog" [disabled]="savingPhoto" (click)="openPhotoActions(photoInput)">
              <ion-icon name="create-outline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <div>
            <b>{{ profile.name }}</b>
            <div class="small muted">{{ profile.email }}<br />{{ profile.phone || 'Telefone não informado' }}</div>
          </div>
        </div>

        <input #photoInput class="file-input" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" (change)="selectPhoto($event)" />

        @if (selectedPhoto) {
          <p class="small muted">Pré-visualização da nova foto. Confirme para salvar.</p>
          <div class="photo-actions">
            <button class="btn" data-action="upload-photo" type="button" [disabled]="savingPhoto" (click)="uploadPhoto()">
              {{ savingPhoto ? 'Enviando...' : 'Salvar foto' }}
            </button>
            <button class="lnk dark" type="button" [disabled]="savingPhoto" (click)="cancelPhoto()">
              <ion-icon name="close-outline" aria-hidden="true"></ion-icon> Cancelar
            </button>
          </div>
        }
      </div>

      <div class="card">
        @for (section of sections; track section) {
          <button class="mn" type="button" (click)="openSection(section)">
            <span class="mn-main"><ion-icon [name]="sectionIcon(section)" aria-hidden="true"></ion-icon>{{ section }} @if (section === 'Notificações' && notifications.unreadCount() > 0) { <span class="notification-count" aria-label="Notificações não lidas">{{ notifications.unreadCount() }}</span> }</span><span>›</span>
          </button>
        }
      </div>

      <button class="btn red profile-logout" type="button" (click)="logout()"><ion-icon name="log-out-outline" aria-hidden="true"></ion-icon>Sair da conta</button>
    </app-shell>
  `,
})
export class ProfilePage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly imageUrls = inject(ImageUrlService);
  readonly notifications = inject(NotificationService);

  readonly sections = ['Dados pessoais', 'CNH', 'Alterar senha', 'Endereço', 'Favoritos', 'Notificações'];
  selectedPhoto: File | null = null;
  previewUrl: string | null = null;
  imageFailed = false;
  savingPhoto = false;

  constructor() {
    addIcons({
      closeOutline,
      createOutline,
      personOutline,
      idCardOutline,
      lockClosedOutline,
      locationOutline,
      heartOutline,
      logOutOutline,
      trashOutline,
      notificationsOutline,
    });
    void this.notifications.load(true).catch(() => undefined);
  }

  get profile() {
    return this.auth.profile();
  }

  get initial(): string {
    return (this.profile.name[0] || '?').toUpperCase();
  }

  get photoSource(): string | null {
    return this.previewUrl ?? this.imageUrls.resolve(this.profile.foto);
  }

  async openPhotoActions(photoInput: HTMLInputElement): Promise<void> {
    if (this.savingPhoto) return;

    const buttons = [
      {
        text: this.profile.foto ? 'Alterar foto' : 'Adicionar foto',
        icon: 'create-outline',
        handler: () => photoInput.click(),
      },
      ...(this.profile.foto
        ? [{
            text: 'Excluir foto',
            role: 'destructive',
            icon: 'trash-outline',
            handler: () => this.confirmPhotoRemoval(),
          }]
        : []),
      { text: 'Cancelar', role: 'cancel' },
    ];

    const actionSheet = await this.actionSheets.create({
      header: 'Foto de perfil',
      buttons,
    });
    await actionSheet.present();
  }

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const validType = VALID_PHOTO_TYPES[extension]?.includes(file.type) ?? false;
    if (!validType || file.size > MAX_PHOTO_SIZE) {
      this.cancelPhoto();
      void this.toast.show('Selecione uma imagem JPG, PNG ou WebP de até 5 MB.');
      return;
    }

    this.releasePreview();
    this.selectedPhoto = file;
    this.previewUrl = URL.createObjectURL(file);
    this.imageFailed = false;
  }

  async uploadPhoto(): Promise<void> {
    if (!this.selectedPhoto || this.savingPhoto) return;
    this.savingPhoto = true;
    try {
      await this.auth.uploadProfilePhoto(this.selectedPhoto);
      this.selectedPhoto = null;
      this.releasePreview();
      this.imageFailed = false;
      await this.toast.show('Foto de perfil atualizada com sucesso.');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível enviar a foto de perfil.');
    } finally {
      this.savingPhoto = false;
    }
  }

  cancelPhoto(): void {
    this.selectedPhoto = null;
    this.releasePreview();
    this.imageFailed = false;
  }

  async confirmPhotoRemoval(): Promise<void> {
    const confirmation = await this.alerts.create({
      header: 'Remover foto de perfil?',
      message: 'A foto atual será removida da sua conta.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Remover', role: 'confirm' },
      ],
    });
    await confirmation.present();
    const { role } = await confirmation.onDidDismiss();
    if (role !== 'confirm' || this.savingPhoto) return;

    this.savingPhoto = true;
    try {
      await this.auth.removeProfilePhoto();
      this.imageFailed = false;
      await this.toast.show('Foto de perfil removida com sucesso.');
    } catch (error) {
      await this.toast.show(error instanceof Error ? error.message : 'Não foi possível remover a foto de perfil.');
    } finally {
      this.savingPhoto = false;
    }
  }

  async openSection(section: string): Promise<void> {
    if (section === 'Favoritos') {
      await this.router.navigateByUrl('/client/favoritos');
      return;
    }
    if (section === 'Notificações') {
      await this.router.navigateByUrl('/client/notificacoes');
      return;
    }
    await this.router.navigate(['/client/perfil', section]);
  }

  sectionIcon(section: string): string {
    const icons: Record<string, string> = {
      'Dados pessoais': 'person-outline',
      CNH: 'id-card-outline',
      'Alterar senha': 'lock-closed-outline',
      Endereço: 'location-outline',
      Favoritos: 'heart-outline',
      Notificações: 'notifications-outline',
    };
    return icons[section] ?? 'person-outline';
  }

  async logout(): Promise<void> {
    this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  private releasePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }
}
