import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerPaymentApi } from '../../core/models';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { CustomerPaymentsPage } from './customer-payments.page';

describe('CustomerPaymentsPage', () => {
  const items: CustomerPaymentApi[] = [
    { id: 'approved-1', valor: '125.50', metodo: 'pix', status: 'aprovado', data: '2026-11-20T10:00:00Z', locacao_id: 'loc-1', locacao: { id: 'loc-1', created_at: '2026-11-20T10:00:00Z', reservation: { id: 'internal-uuid', codigo: 'RES-000001' } } },
    { id: 'pending-1', valor: '50', metodo: 'pix', status: 'pendente', data: '2026-11-21T10:00:00Z', locacao_id: 'loc-2' },
    { id: 'refused-1', valor: '99', metodo: 'pix', status: 'recusado', data: '2026-11-21T11:00:00Z', locacao_id: 'loc-3' },
    { id: 'cancelled-1', valor: '75', metodo: 'pix', status: 'cancelado', data: '2026-11-21T12:00:00Z', locacao_id: 'loc-4' },
  ];
  const service = {
    items: () => items,
    loading: () => false,
    error: () => null,
    load: vi.fn(async () => undefined),
    receipt: vi.fn(async () => ({
      empresa: 'LocaMais', reciboId: 'approved-1', pagamentoId: 'approved-1', locacaoId: 'loc-1',
      valorPago: 125.5, metodoPagamento: 'pix', dataConfirmacao: '2026-11-20T10:00:00Z',
      status: 'aprovado', aviso: 'Pagamento simulado',
    })),
  };
  let fixture: ComponentFixture<CustomerPaymentsPage>;

  beforeEach(async () => {
    service.load.mockClear();
    service.receipt.mockClear();
    TestBed.configureTestingModule({
      imports: [CustomerPaymentsPage],
      providers: [{ provide: CustomerPaymentService, useValue: service }],
    });
    TestBed.overrideComponent(CustomerPaymentsPage, {
      remove: { imports: [AppShellComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(CustomerPaymentsPage);
    fixture.detectChanges();
  });

  it('loads real API-backed payment state and excludes refused/cancelled values from totals', () => {
    const page = fixture.componentInstance;
    expect(service.load).toHaveBeenCalledOnce();
    expect(page.approved.map((item) => item.id)).toEqual(['approved-1']);
    expect(page.pending.map((item) => item.id)).toEqual(['pending-1']);
    expect(page.totalPaid).toBe(125.5);
    expect(page.totalPending).toBe(50);
  });

  it('shows the payment lists without top total summary cards', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Total pago');
    expect(text).not.toContain('Total pendente');
    expect(text).toContain('Pagamentos realizados');
    expect(text).toContain('Pagamentos pendentes');
    expect(text).toContain('RES-000001');
    expect(text).not.toContain('internal-uuid');
    expect(text).toContain('125,50');
    expect(text).toContain('50,00');
  });

  it('requests a receipt only for an approved payment', async () => {
    const page = fixture.componentInstance;
    await page.openReceipt(items[1]);
    expect(service.receipt).not.toHaveBeenCalled();
    await page.openReceipt(items[0]);
    expect(service.receipt).toHaveBeenCalledWith('approved-1');
    expect(page.receipt?.status).toBe('aprovado');
  });
});
