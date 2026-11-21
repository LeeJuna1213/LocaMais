import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { LogoComponent } from '../../shared/components/logo.component';
import { SegmentTabsComponent } from '../../shared/components/segment-tabs.component';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  const auth = { loading: () => false, login: vi.fn() };
  const router = { navigateByUrl: vi.fn(async () => true) };
  const toast = { show: vi.fn(async () => undefined) };
  let fixture: ComponentFixture<LoginPage>;

  beforeEach(async () => {
    auth.login.mockReset().mockResolvedValue(undefined);
    router.navigateByUrl.mockClear();
    toast.show.mockClear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: ToastService, useValue: toast },
      ],
    });
    TestBed.overrideComponent(LoginPage, {
      remove: { imports: [IonContent, LogoComponent, SegmentTabsComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  it('opens the password recovery route from the forgot-password action', async () => {
    await fixture.componentInstance.forgotPassword();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/recuperar-senha');
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('usa somente um input de senha, alterna password/text e não submete pelo botão do olho', async () => {
    const page = fixture.componentInstance;
    page.password = 'Senha12345';
    fixture.detectChanges();

    const field = fixture.nativeElement.querySelector('input[name="password"]') as HTMLInputElement;
    const toggle = fixture.nativeElement.querySelector('.pw-toggle') as HTMLButtonElement;
    expect(field).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('ion-input')).toHaveLength(0);
    expect(toggle.getAttribute('type')).toBe('button');
    expect(field.type).toBe('password');

    toggle.click();
    fixture.detectChanges();
    expect(field.type).toBe('text');
    expect(page.password).toBe('Senha12345');
    expect(auth.login).not.toHaveBeenCalled();

    toggle.click();
    fixture.detectChanges();
    expect(field.type).toBe('password');
    expect(page.password).toBe('Senha12345');
  });
});
