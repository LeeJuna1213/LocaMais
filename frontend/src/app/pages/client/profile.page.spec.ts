import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActionSheetController, AlertController } from '@ionic/angular';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { ImageUrlService } from '../../core/services/image-url.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ProfilePage } from './profile.page';

describe('ProfilePage photo controls', () => {
  let profile: { name: string; email: string; phone: string; foto: string | null };
  const auth = {
    loading: () => false,
    profile: () => profile,
    uploadProfilePhoto: vi.fn(),
    removeProfilePhoto: vi.fn(),
    logout: vi.fn(),
  };
  const toast = { show: vi.fn(async () => undefined) };
  const router = { navigate: vi.fn(async () => true), navigateByUrl: vi.fn(async () => true) };
  const alert = { present: vi.fn(async () => undefined), onDidDismiss: vi.fn(async () => ({ role: 'cancel' })) };
  const alerts = { create: vi.fn(async () => alert) };
  const actionSheet = { present: vi.fn(async () => undefined) };
  let actionButtons: Array<{ text?: string; role?: string; handler?: () => unknown }> = [];
  const actionSheets = {
    create: vi.fn(async (options: { buttons: Array<{ text?: string; role?: string; handler?: () => unknown }> }) => {
      actionButtons = options.buttons;
      return actionSheet;
    }),
  };
  let fixture: ComponentFixture<ProfilePage>;

  beforeEach(async () => {
    profile = { name: 'Ana', email: 'ana@example.test', phone: '', foto: null };
    auth.uploadProfilePhoto.mockReset();
    auth.removeProfilePhoto.mockReset();
    toast.show.mockClear();
    alerts.create.mockClear();
    actionSheets.create.mockClear();
    actionSheet.present.mockClear();
    actionButtons = [];
    alert.onDidDismiss.mockReset().mockResolvedValue({ role: 'cancel' });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:profile-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ImageUrlService, useValue: { resolve: (path: string | null) => path ? 'data:image/png;base64,aGVsbG8=' : null } },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
        { provide: AlertController, useValue: alerts },
        { provide: ActionSheetController, useValue: actionSheets },
      ],
    });
    TestBed.overrideComponent(ProfilePage, { remove: { imports: [AppShellComponent] }, add: { schemas: [NO_ERRORS_SCHEMA] } });
    await TestBed.compileComponents();
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function select(file: File): void {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  }

  it('shows name and initial avatar when no profile image exists', async () => {
    await render();
    expect(fixture.nativeElement.textContent).toContain('Ana');
    expect(fixture.nativeElement.querySelector('.avatar')?.textContent.trim()).toBe('A');
    expect((fixture.nativeElement.querySelector('img.profile-photo') as HTMLImageElement).hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('.photo-edit-button')?.getAttribute('aria-label')).toBe('Ações da foto de perfil');
  });

  it('offers only adding a photo when the account has no photo', async () => {
    await render();
    fixture.nativeElement.querySelector('.photo-edit-button').click();
    await fixture.whenStable();

    expect(actionSheet.present).toHaveBeenCalledOnce();
    expect(actionButtons.map((button) => button.text)).toEqual(['Adicionar foto', 'Cancelar']);
  });

  it('opens the file picker from the change-photo action when a photo exists', async () => {
    profile = { ...profile, foto: '/uploads/usuarios/current.webp' };
    await render();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fixture.nativeElement.querySelector('.photo-edit-button').click();
    await fixture.whenStable();

    expect(actionButtons.map((button) => button.text)).toEqual(['Alterar foto', 'Excluir foto', 'Cancelar']);
    actionButtons[0].handler?.();
    expect(click).toHaveBeenCalledOnce();
  });

  it('shows existing image and falls back to initial when it fails to load', () => {
    profile = { ...profile, foto: '/uploads/usuarios/current.webp' };
    return render().then(() => {
    const image = fixture.nativeElement.querySelector('img.profile-photo') as HTMLImageElement;
    expect(image.src).toContain('data:image/png');
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.avatar')?.textContent.trim()).toBe('A');
    });
  });

  it('previews a supported image and uploads only after confirmation', async () => {
    await render();
    const file = new File(['image bytes'], 'avatar.png', { type: 'image/png' });
    select(file);
    expect((fixture.nativeElement.querySelector('img.profile-photo') as HTMLImageElement).src).toBe('blob:profile-preview');
    expect(auth.uploadProfilePhoto).not.toHaveBeenCalled();
    auth.uploadProfilePhoto.mockImplementation(async () => { profile = { ...profile, foto: '/uploads/usuarios/new.png' }; });
    fixture.nativeElement.querySelector('button[data-action="upload-photo"]').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.uploadProfilePhoto).toHaveBeenCalledWith(file);
    expect(toast.show).toHaveBeenCalledWith('Foto de perfil atualizada com sucesso.');
    expect(profile.foto).toBe('/uploads/usuarios/new.png');
    expect((fixture.nativeElement.querySelector('img.profile-photo') as HTMLImageElement).hidden).toBe(false);
  });

  it('rejects unsupported MIME and files above 5 MB before upload', () => {
    return render().then(() => {
    select(new File(['text'], 'script.svg', { type: 'image/svg+xml' }));
    expect(auth.uploadProfilePhoto).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Selecione uma imagem JPG, PNG ou WebP de até 5 MB.');

    toast.show.mockClear();
    select(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }));
    expect(auth.uploadProfilePhoto).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Selecione uma imagem JPG, PNG ou WebP de até 5 MB.');
    });
  });

  it('keeps preview and shows an error when upload fails', async () => {
    await render();
    auth.uploadProfilePhoto.mockRejectedValue(new Error('Falha de rede'));
    select(new File(['image bytes'], 'avatar.jpg', { type: 'image/jpeg' }));
    fixture.nativeElement.querySelector('button[data-action="upload-photo"]').click();
    await fixture.whenStable();
    expect(toast.show).toHaveBeenCalledWith('Falha de rede');
    expect(fixture.nativeElement.querySelector('img.profile-photo')).not.toBeNull();
  });

  it('asks confirmation and removes photo only after affirmative response', async () => {
    profile = { ...profile, foto: '/uploads/usuarios/current.webp' };
    await render();
    fixture.nativeElement.querySelector('.photo-edit-button').click();
    await fixture.whenStable();
    await actionButtons.find((button) => button.text === 'Excluir foto')?.handler?.();
    expect(alerts.create).toHaveBeenCalled();
    expect(auth.removeProfilePhoto).not.toHaveBeenCalled();

    alert.onDidDismiss.mockResolvedValueOnce({ role: 'confirm' });
    await actionButtons.find((button) => button.text === 'Excluir foto')?.handler?.();
    expect(auth.removeProfilePhoto).toHaveBeenCalledOnce();
  });
});
