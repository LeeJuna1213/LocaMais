import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ForgotPasswordPage } from './forgot-password.page';

describe('ForgotPasswordPage', () => {
  const auth = { loading: () => false, requestPasswordRecovery: vi.fn() };
  const router = { navigateByUrl: vi.fn(async () => true) };
  let fixture: ComponentFixture<ForgotPasswordPage>;

  beforeEach(async () => {
    auth.requestPasswordRecovery.mockReset().mockResolvedValue(undefined);
    router.navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [ForgotPasswordPage],
      providers: [{ provide: AuthService, useValue: auth }, { provide: Router, useValue: router }],
    });
    TestBed.overrideComponent(ForgotPasswordPage, { remove: { imports: [AppShellComponent] }, add: { schemas: [NO_ERRORS_SCHEMA] } });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ForgotPasswordPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  async function email(value: string): Promise<void> {
    const element = fixture.nativeElement.querySelector('input[name="email"]') as HTMLInputElement;
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

  it('validates required and malformed email in the actual form', async () => {
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await email('not-an-email');
    expect(button.disabled).toBe(true);
    await submit();
    expect(auth.requestPasswordRecovery).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Informe um e-mail válido.');
  });

  it('shows generic success after request and navigates back to login', async () => {
    await email('ana@example.test');
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    await submit();
    expect(auth.requestPasswordRecovery).toHaveBeenCalledWith('ana@example.test');
    expect(fixture.nativeElement.textContent).toContain('Se existir uma conta vinculada a esse e-mail');
    fixture.nativeElement.querySelector('button.lnk').click();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('shows API error without claiming a request succeeded', async () => {
    auth.requestPasswordRecovery.mockRejectedValue(new Error('O envio de e-mails ainda não está configurado.'));
    await email('ana@example.test');
    await submit();
    expect(fixture.nativeElement.textContent).toContain('O envio de e-mails ainda não está configurado.');
    expect(fixture.nativeElement.textContent).not.toContain('Se existir uma conta vinculada');
  });
});
