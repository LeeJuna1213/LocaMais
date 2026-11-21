import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsuarioService } from '../../core/services/usuario.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { UsuarioEditPage } from './usuario-edit.page';

describe('UsuarioEditPage password visibility', () => {
  const router = { navigateByUrl: vi.fn(async () => true) };
  const usuarioService = { create: vi.fn(async () => undefined), update: vi.fn(async () => undefined), loading: () => false, error: () => null, usuarios: () => [] };
  const auth = { role: () => 'admin' };
  const toast = { show: vi.fn(async () => undefined) };
  let fixture: ComponentFixture<UsuarioEditPage>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [UsuarioEditPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'novo' } } } },
        { provide: Router, useValue: router },
        { provide: UsuarioService, useValue: usuarioService },
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
      ],
    });
    TestBed.overrideComponent(UsuarioEditPage, {
      remove: { imports: [AppShellComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(UsuarioEditPage);
    fixture.detectChanges();
  });

  it('toggles the actual password input without submitting the employee form', () => {
    const input = fixture.nativeElement.querySelector('input[name="password"]') as HTMLInputElement;
    const button = fixture.nativeElement.querySelector('.pw-toggle') as HTMLButtonElement;
    input.value = 'senha-de-teste';
    input.dispatchEvent(new Event('input'));
    expect(input.type).toBe('password');
    expect(button.type).toBe('button');
    expect(input.classList.contains('pw')).toBe(false);

    button.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    expect(input.value).toBe('senha-de-teste');
    expect(usuarioService.create).not.toHaveBeenCalled();

    button.click();
    fixture.detectChanges();
    expect(input.type).toBe('password');
  });
});
