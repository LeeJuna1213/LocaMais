import { describe, expect, it } from 'vitest';
import { CustomerPaymentApi } from '../models';
import {
  countPendingPayments,
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
});
