import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopInput, ShopService } from '../../core/services/shop.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { ShopEditPage } from './shop-edit.page';

const shop = {
  id: 7, codigo: 'RJ01', nome: 'Loja Centro', telefone: '21999999999', email: 'loja@example.com',
  logradouro: 'Rua A', numero: '10', complemento: null, bairro: 'Centro', cidade: 'Rio de Janeiro',
  uf: 'RJ', cep: '20000000', ativa: true,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
};

describe('ShopEditPage state selector', () => {
  let fixture: ComponentFixture<ShopEditPage>;
  let routeId: string | null;
  const save = vi.fn(async (_input?: Partial<ShopInput>, _id?: number) => shop);
  const shops = vi.fn(() => [shop]);
  const load = vi.fn(async () => undefined);
  const router = { navigateByUrl: vi.fn(async () => true) };

  beforeEach(async () => {
    routeId = null;
    save.mockClear(); shops.mockClear(); load.mockClear(); router.navigateByUrl.mockClear();
    shops.mockReturnValue([shop]);
    TestBed.configureTestingModule({
      imports: [ShopEditPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeId } } } },
        { provide: Router, useValue: router },
        { provide: ShopService, useValue: { shops, load, save, loading: () => false, error: () => null } },
        { provide: ToastService, useValue: { show: vi.fn(async () => undefined) } },
      ],
    });
    TestBed.overrideComponent(ShopEditPage, { remove: { imports: [AppShellComponent] }, add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    await TestBed.compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(ShopEditPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('exibe exatamente os 26 estados, sem DF, e envia a UF selecionada', async () => {
    await render();
    const select = fixture.nativeElement.querySelector('#shop-state') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '', 'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
      'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
    ]);
    expect(select.options[0].textContent?.trim()).toBe('Selecione o estado');

    select.value = 'RJ';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.model.uf).toBe('RJ');
    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ uf: 'RJ' }), undefined);
  });

  it('alterna o valor real do formulário e envia ativa=true/false no cadastro', async () => {
    await render();
    const toggle = fixture.nativeElement.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(fixture.componentInstance.model.ativa).toBe(true);

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(fixture.componentInstance.model.ativa).toBe(false);
    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ativa: false }), undefined);

    fixture.componentInstance.toggleActive();
    await fixture.componentInstance.save();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ ativa: true }), undefined);
  });

  it('carrega e mantém a UF previamente persistida na edição', async () => {
    routeId = '7';
    await render();
    const select = fixture.nativeElement.querySelector('#shop-state') as HTMLSelectElement;
    expect(fixture.componentInstance.model.uf).toBe('RJ');
    expect(select.value).toBe('RJ');
  });

  it('carrega status inativo na edição e salva reativação', async () => {
    routeId = '7';
    shops.mockReturnValue([{ ...shop, ativa: false }]);
    await render();
    const toggle = fixture.nativeElement.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(fixture.componentInstance.model.ativa).toBe(false);
    toggle.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.model.ativa).toBe(true);
    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ ativa: true }), 7);
  });

  it('não inclui id nem timestamps do objeto da API no payload de edição', async () => {
    routeId = '7';
    await render();
    fixture.componentInstance.toggleActive();
    await fixture.componentInstance.save();

    const [payload, id] = save.mock.calls.at(-1)!;
    expect(id).toBe(7);
    expect(payload).toEqual({
      codigo: 'RJ01', nome: 'Loja Centro', telefone: '21999999999', email: 'loja@example.com',
      logradouro: 'Rua A', numero: '10', complemento: null, bairro: 'Centro', cidade: 'Rio de Janeiro',
      uf: 'RJ', cep: '20000000', ativa: false,
    });
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('updated_at');
  });
});
