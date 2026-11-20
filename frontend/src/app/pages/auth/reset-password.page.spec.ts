import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ResetPasswordPage } from './reset-password.page';

describe('ResetPasswordPage', () => {
  const auth = { loading: () => false, resetPassword: vi.fn() };
  const router = { navigateByUrl: vi.fn(async () => true) };
  let fixture: ComponentFixture<ResetPasswordPage>;
  let recoveryToken: string | null = 'valid-recovery-token';

  beforeEach(async () => {
    recoveryToken = 'valid-recovery-token';
    auth.resetPassword.mockReset().mockResolvedValue(undefined);
    router.navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [ResetPasswordPage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => recoveryToken } } } },
      ],
    });
    TestBed.overrideComponent(ResetPasswordPage, { remove: { imports: [AppShellComponent] }, add: { schemas: [NO_ERRORS_SCHEMA] } });
    await TestBed.compileComponents();
  });

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function fill(name: string, value: string): Promise<void> {
    const element = fixture.nativeElement.querySelector(`input[name="${name}"]`) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function submit(): Promise<void> {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('blocks access without token and offers a new recovery link', async () => {
    recoveryToken = null;
    await create();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('sem token');
    fixture.nativeElement.querySelector('button.btn').click();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/recuperar-senha');
    expect(auth.resetPassword).not.toHaveBeenCalled();
  });

  it('validates minimum length and matching confirmation before submission', async () => {
    await create();
    await fill('newPassword', 'short');
    await fill('confirmPassword', 'different');
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    await submit();
    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('As senhas não conferem.');
  });

  it('submits matching password, displays success and returns to login without authenticating', async () => {
    await create();
    await fill('newPassword', 'NovaSenha1!');
    await fill('confirmPassword', 'NovaSenha1!');
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    await submit();
    expect(auth.resetPassword).toHaveBeenCalledWith('valid-recovery-token', 'NovaSenha1!');
    expect(fixture.nativeElement.textContent).toContain('Sua senha foi alterada com sucesso.');
    fixture.nativeElement.querySelector('button.btn').click();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('displays expired-token error and offers a new link', async () => {
    auth.resetPassword.mockRejectedValue(new Error('Link inválido, expirado ou já utilizado. Solicite um novo link de recuperação.'));
    await create();
    await fill('newPassword', 'NovaSenha1!');
    await fill('confirmPassword', 'NovaSenha1!');
    await submit();
    expect(fixture.nativeElement.textContent).toContain('Link inválido, expirado ou já utilizado.');
    const recovery = [...fixture.nativeElement.querySelectorAll('button')].find((button) => button.textContent.includes('Solicitar um novo link')) as HTMLButtonElement;
    recovery.click();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/recuperar-senha');
  });

  it('toggles password visibility using the page controls', async () => {
    await create();
    const password = fixture.nativeElement.querySelector('input[name="newPassword"]') as HTMLInputElement;
    expect(password.type).toBe('password');
    const toggle = fixture.nativeElement.querySelector('button[aria-label="Mostrar nova senha"]') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    expect(password.type).toBe('text');
  });
});
