import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { LoginPage } from './login.page';

describe('LoginPage recovery navigation', () => {
  const auth = { loading: () => false };
  const router = { navigateByUrl: vi.fn(async () => true) };
  const toast = { show: vi.fn(async () => undefined) };

  beforeEach(() => {
    router.navigateByUrl.mockClear();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
    ] });
  });

  it('opens the password recovery route from the forgot-password action', async () => {
    const page = TestBed.runInInjectionContext(() => new LoginPage());
    await page.forgotPassword();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/recuperar-senha');
    expect(toast.show).not.toHaveBeenCalled();
  });
});
