import { describe, expect, it } from 'vitest';
import { afterEach, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CustomerPaymentApi } from '../models';
import { CustomerPaymentService } from './customer-payment.service';
import { environment } from '../../../environments/environment';
import {
  countPendingPayments,
  filterPayments,
  filterOperationalPayments,
} from './customer-payment.service';

const payment = (id: string, status: CustomerPaymentApi['status']): CustomerPaymentApi => ({
  id,
  valor: 125,
  metodo: 'pix',
  status,
  data: '2026-11-22T12:00:00.000Z',
  locacao_id: `rental-${id}`,
});

describe('CustomerPaymentService filters', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('sends applied status and date filters to the authenticated customer endpoint', async () => {
    const service = TestBed.inject(CustomerPaymentService);
    const loaded = service.load({ status: 'cancelado', de: '2026-11-20', ate: '2026-11-24' });
    const request = http.expectOne((item) => item.url === `${environment.apiUrl}/pagamentos/meus`);
    expect(request.request.params.get('status')).toBe('cancelado');
    expect(request.request.params.get('de')).toBe('2026-11-20');
    expect(request.request.params.get('ate')).toBe('2026-11-24');
    request.flush([]);
    await loaded;
    expect(service.error()).toBeNull();
  });

  it('sends operational filters to the staff endpoint and omits blank criteria after clearing', async () => {
    const service = TestBed.inject(CustomerPaymentService);
    const filtered = service.loadOperational({ status: 'estornado', de: '', ate: '' });
    const request = http.expectOne((item) => item.url === `${environment.apiUrl}/pagamentos`);
    expect(request.request.params.get('status')).toBe('estornado');
    expect(request.request.params.has('de')).toBe(false);
    request.flush([]);
    await filtered;
    const cleared = service.loadOperational();
    const clearRequest = http.expectOne((item) => item.url === `${environment.apiUrl}/pagamentos`);
    expect(clearRequest.request.params.keys()).toEqual([]);
    clearRequest.flush([]);
    await cleared;
  });
});

describe('operational payment criteria', () => {
  const payments = [
    payment('pending-a', 'pendente'),
    payment('pending-b', 'pendente'),
    payment('approved', 'aprovado'),
    payment('refused', 'recusado'),
    payment('canceled', 'cancelado'),
  ];

  it('counts only pending persisted payments and matches the pending list', () => {
    const listed = filterOperationalPayments(payments, 'Pendentes');
    expect(countPendingPayments(payments)).toBe(2);
    expect(listed).toHaveLength(2);
    expect(listed.map(({ id }) => id)).toEqual(['pending-a', 'pending-b']);
    expect(countPendingPayments(payments)).toBe(listed.length);
  });

  it('does not classify approved, refused, or canceled payments as pending', () => {
    expect(filterOperationalPayments(payments, 'Pendentes').map(({ status }) => status))
      .toEqual(['pendente', 'pendente']);
  });

  it('includes historical statuses in the unfiltered operational listing', () => {
    expect(filterOperationalPayments(payments, 'Todos').map(({ id }) => id))
      .toEqual(['pending-a', 'pending-b', 'approved', 'refused', 'canceled']);
    expect(filterOperationalPayments(payments, 'Realizados').map(({ id }) => id))
      .toEqual(['approved']);
  });

  it('filters individually by all persisted statuses and includes historical statuses in all', () => {
    expect(filterPayments(payments, { status: 'cancelado' }).map(({ id }) => id)).toEqual(['canceled']);
    expect(filterPayments(payments, { status: 'pendente' }).map(({ status }) => status)).toEqual(['pendente', 'pendente']);
    expect(filterPayments(payments, { status: 'aprovado' }).map(({ id }) => id)).toEqual(['approved']);
    expect(filterPayments(payments, { status: 'estornado' })).toEqual([]);
    expect(filterPayments(payments).map(({ status }) => status)).toEqual([
      'pendente', 'pendente', 'aprovado', 'recusado', 'cancelado',
    ]);
  });

  it('combines status with inclusive date range and resets when filters are cleared', () => {
    const ranged = [
      payment('before', 'pendente'),
      { ...payment('inside', 'pendente'), data: '2026-11-24T12:00:00.000Z' },
      { ...payment('after', 'pendente'), data: '2026-11-25T00:00:00.000Z' },
    ];
    expect(filterPayments(ranged, { status: 'pendente', de: '2026-11-24', ate: '2026-11-24' }).map(({ id }) => id))
      .toEqual(['inside']);
    expect(filterPayments(ranged, {}).map(({ id }) => id)).toEqual(['before', 'inside', 'after']);
  });
});
