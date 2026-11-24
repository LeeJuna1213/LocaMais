import { describe, expect, it } from 'vitest';
import { CustomerPaymentApi } from '../models';
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

  it('keeps operational tabs limited to pending and approved payments', () => {
    expect(filterOperationalPayments(payments, 'Todos').map(({ id }) => id))
      .toEqual(['pending-a', 'pending-b', 'approved']);
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
