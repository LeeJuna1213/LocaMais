import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerPaymentService } from '../../core/services/customer-payment.service';
import { ToastService } from '../../core/services/toast.service';
import { AppShellComponent } from '../../shared/components/app-shell.component';
import { AdminPaymentsPage } from './admin-payments.page';

describe('AdminPaymentsPage filters', () => {
  const payments = {
    items: () => [], loading: () => false, error: () => null,
    loadOperational: vi.fn(async () => undefined),
    confirm: vi.fn(), receipt: vi.fn(),
  };
  let fixture: ComponentFixture<AdminPaymentsPage>;

  beforeEach(async () => {
    payments.loadOperational.mockClear();
    TestBed.configureTestingModule({
      imports: [AdminPaymentsPage],
      providers: [
        { provide: CustomerPaymentService, useValue: payments },
        { provide: ToastService, useValue: { show: vi.fn(async () => undefined) } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
      ],
    });
    TestBed.overrideComponent(AdminPaymentsPage, { remove: { imports: [AppShellComponent] }, add: { schemas: [NO_ERRORS_SCHEMA] } });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(AdminPaymentsPage);
    fixture.detectChanges();
  });

  it('applies combined filters through the API service and clears them back to all payments', async () => {
    const page = fixture.componentInstance;
    page.statusFilter = 'cancelado';
    page.dateFrom = '2026-11-20';
    page.dateTo = '2026-11-24';
    await page.applyFilters();
    expect(payments.loadOperational).toHaveBeenLastCalledWith({ status: 'cancelado', de: '2026-11-20', ate: '2026-11-24' });
    await page.clearFilters();
    expect(payments.loadOperational).toHaveBeenLastCalledWith({ status: '', de: '', ate: '' });
    expect(page.statusLabel('aprovado')).toBe('Pago');
    expect(page.statusLabel('cancelado')).toBe('Cancelado');
    expect(page.statusLabel('estornado')).toBe('Estornado');
  });

  it('keeps date controls collapsed until the compact more-filters control is opened', () => {
    const toggle = fixture.nativeElement.querySelector('.payment-filter-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Ver mais filtros');
    expect(fixture.nativeElement.querySelector('#payment-extra-filters').getAttribute('aria-hidden')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.textContent).toContain('Ver menos filtros');
    expect(fixture.nativeElement.querySelector('#payment-extra-filters').getAttribute('aria-hidden')).toBe('false');
    expect(fixture.nativeElement.querySelector('.payment-clear-filters').textContent).toContain('Limpar filtros');
  });
});
