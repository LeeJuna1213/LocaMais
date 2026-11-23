import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ProfileSectionPage } from './profile-section.page';

describe('ProfileSectionPage password visibility', () => {
  const toast = { show: vi.fn(async () => undefined) };
  const router = { navigateByUrl: vi.fn(async () => true) };
  let routeSection = 'Alterar senha';
  let fixture: ComponentFixture<ProfileSectionPage>;
  const iconNames = (buttons: HTMLButtonElement[]): Array<string | null> => buttons.map((button) => {
    const icon = button.querySelector('ion-icon') as (HTMLElement & { name?: string }) | null;
    return icon?.name ?? icon?.getAttribute('name') ?? null;
  });

  beforeEach(async () => {
    toast.show.mockClear();
    router.navigateByUrl.mockClear();
    routeSection = 'Alterar senha';
    TestBed.configureTestingModule({
      imports: [ProfileSectionPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeSection }, queryParamMap: { get: () => null } } } },
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: { profile: () => ({ name: '', email: '', phone: '', cnh: '', cnhValidity: '', street: '', city: '', addressNumber: '', addressComplement: '', addressDistrict: '', addressState: '', addressZipCode: '' }) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    TestBed.overrideComponent(ProfileSectionPage, { remove: { imports: [AppShellComponent] }, add: { schemas: [NO_ERRORS_SCHEMA] } });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ProfileSectionPage);
    fixture.detectChanges();
  });

  it('starts hidden and toggles each field independently without clearing values', () => {
    const inputs = Array.from(fixture.nativeElement.querySelectorAll('.password-field input')) as HTMLInputElement[];
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.pw-toggle')) as HTMLButtonElement[];
    expect(inputs.map((input) => input.type)).toEqual(['password', 'password', 'password']);
    expect(buttons.every((button) => button.type === 'button')).toBe(true);
    expect(iconNames(buttons)).toEqual([
      'eye-off-outline', 'eye-off-outline', 'eye-off-outline',
    ]);

    inputs[0].value = 'current-secret';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1].value = 'new-secret';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[2].value = 'new-secret';
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    buttons[1].click();
    fixture.detectChanges();
    expect(inputs.map((input) => input.type)).toEqual(['password', 'text', 'password']);
    expect(iconNames(buttons)).toEqual([
      'eye-off-outline', 'eye-outline', 'eye-off-outline',
    ]);
    expect(inputs.map((input) => input.value)).toEqual(['current-secret', 'new-secret', 'new-secret']);

    buttons[1].click();
    buttons[0].click();
    buttons[2].click();
    fixture.detectChanges();
    expect(inputs.map((input) => input.type)).toEqual(['text', 'password', 'text']);
    expect(inputs.map((input) => input.value)).toEqual(['current-secret', 'new-secret', 'new-secret']);
  });

  it('mantém o botão de salvar e o comportamento existente de validação da nova senha', async () => {
    const page = fixture.componentInstance;
    page.newPassword = 'new-secret';
    page.newPasswordConfirmation = 'new-secret';
    await page.save();
    expect(toast.show).toHaveBeenCalledWith('Alterações salvas');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/client/perfil');
  });

  it.each(['Preferências', 'Pagamentos'])('redireciona a rota removida %s de volta ao Perfil', (section) => {
    fixture.destroy();
    routeSection = section;
    const removedSectionFixture = TestBed.createComponent(ProfileSectionPage);
    removedSectionFixture.detectChanges();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/client/perfil');
    removedSectionFixture.destroy();
  });
});
