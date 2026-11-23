import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientService } from '../../core/services/client.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ClientEditPage } from './client-edit.page';

describe('ClientEditPage new client', () => {
  const clientService = {
    loading: () => false,
    error: () => null,
    add: vi.fn(async () => ({ id: 5 })),
    update: vi.fn(async () => undefined),
  };
  const toast = { show: vi.fn(async () => undefined) };
  const router = { navigateByUrl: vi.fn(async () => true) };
  let fixture: ComponentFixture<ClientEditPage>;
  let page: ClientEditPage;

  beforeEach(async () => {
    clientService.add.mockReset().mockResolvedValue({ id: 5 });
    clientService.update.mockReset();
    toast.show.mockClear();
    router.navigateByUrl.mockClear();
    TestBed.configureTestingModule({
      imports: [ClientEditPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'novo' } } } },
        { provide: ClientService, useValue: clientService },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
      ],
    });
    TestBed.overrideComponent(ClientEditPage, {
      remove: { imports: [AppShellComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(ClientEditPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('rejects an invalid CPF without calling the administrative client endpoint', async () => {
    page.name = 'Mariana Oliveira Santos';
    page.document = '529.982.247-24';
    await page.save();

    expect(clientService.add).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('CPF inválido'));
  });

  it('submits valid PF data normalized through the admin client service', async () => {
    Object.assign(page, {
      name: 'Mariana Oliveira Santos',
      type: 'PF',
      document: '529.982.247-25',
      email: 'mariana@example.test',
      password: 'SenhaTeste#2026',
      birthDate: '1990-05-10',
      street: 'Rua de Teste',
      number: '100',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001-000',
    });
    await page.save();

    expect(clientService.add).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Mariana Oliveira Santos',
      type: 'PF',
      document: '52998224725',
      email: 'mariana@example.test',
      birthDate: '1990-05-10',
      address: expect.objectContaining({ state: 'SP', zipCode: '01001-000' }),
    }));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/clientes');
  });

  it('submits valid PJ data with the CNPJ and company name normalized', async () => {
    Object.assign(page, {
      name: 'AutoPrime Comércio e Serviços LTDA',
      type: 'PJ',
      document: '11.222.333/0001-81',
      email: 'autoprime@example.test',
      password: 'SenhaTeste#2026',
      companyName: 'AutoPrime Comércio e Serviços LTDA',
      street: 'Rua de Teste',
      number: '100',
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001-000',
    });
    await page.save();

    expect(clientService.add).toHaveBeenCalledWith(expect.objectContaining({
      name: 'AutoPrime Comércio e Serviços LTDA',
      type: 'PJ',
      document: '11222333000181',
      companyName: 'AutoPrime Comércio e Serviços LTDA',
      email: 'autoprime@example.test',
    }));
  });
});
