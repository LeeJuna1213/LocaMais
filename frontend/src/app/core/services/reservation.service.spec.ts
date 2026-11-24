import { describe, expect, it } from 'vitest';
import { filterAdminReservations, mapReservation, ReservationApiResponse } from './reservation.service';

const makeApiReservation = (overrides: Partial<ReservationApiResponse> = {}): ReservationApiResponse => ({
      id: 'reservation-uuid',
      codigo: 'RES-000001',
      dataRetirada: '2026-12-01T10:00:00.000Z',
      dataDevolucao: '2026-12-03T10:00:00.000Z',
      diarias: 2,
  status: 'pendente',
  valorTotal: 200,
  client_id: 17,
  car_id: 2,
  client: { id: 17, tipo_pessoa: 'PF', cpf: null, cnpj: null },
  car: null,
  ...overrides,
});

describe('mapReservation', () => {
  it('keeps the persisted rental ID for the return operation', () => {
    const reservation = mapReservation(makeApiReservation({
      status: 'confirmada',
      locacao: { id: 'rental-uuid', status: 'em_andamento' },
    }), 99, true);
    expect(reservation.rentalId).toBe('rental-uuid');
    expect(reservation.rentalStatus).toBe('em_andamento');
  });

  it('does not classify a cancelled rental as active or pending pickup', () => {
    const reservation = mapReservation(makeApiReservation({
      status: 'confirmada',
      locacao: { id: 'cancelled-rental', status: 'cancelada' },
    }), 99, true);
    expect(reservation.status).toBe('Confirmada');
    expect(reservation.rentalStarted).toBe(false);
    expect(filterAdminReservations([reservation], 'Confirmadas')).toEqual([]);
    expect(filterAdminReservations([reservation], 'Canceladas')).toEqual([reservation]);
    expect(filterAdminReservations([reservation], 'Em andamento')).toEqual([]);
  });

  it('keeps persisted pending status and includes the owner-scoped client row', () => {
    const reservation = mapReservation(makeApiReservation(), 99, true);
    expect(reservation.status).toBe('Aguardando pagamento');
    expect(reservation.mine).toBe(true);
    expect(reservation.days).toBe(2);
  });

  it('does not map a confirmed reservation into the pending category', () => {
    const reservation = mapReservation(makeApiReservation({ status: 'confirmada' }), 99, true);
    expect(reservation.status).toBe('Confirmada');
  });

  it('uses the actual rental status for an active rental and not the reservation status', () => {
    const reservation = mapReservation(makeApiReservation({
      status: 'confirmada',
      locacao: { status: 'em_andamento', dataRetirada: '2026-12-01T10:00:00.000Z', dataDevolucao: null },
    }), 99, true);
    expect(reservation.status).toBe('Em andamento');
    expect(reservation.rentalStarted).toBe(true);
    expect(reservation.actualReturnDate).toBeNull();
  });

  it('treats a concluded rental with actual pickup as effective and retains its actual return date', () => {
    const reservation = mapReservation(makeApiReservation({
      status: 'concluida',
      locacao: {
        status: 'concluida',
        dataRetirada: '2026-12-01T10:00:00.000Z',
        dataDevolucao: '2026-12-03T09:45:00.000Z',
      },
    }), 99, true);
    expect(reservation.rentalStarted).toBe(true);
    expect(reservation.actualReturnDate).toBe('2026-12-03T09:45:00.000Z');
  });

  it('does not treat a confirmed reservation awaiting pickup as effective', () => {
    const reservation = mapReservation(makeApiReservation({
      status: 'confirmada',
      locacao: { status: 'aguardando_retirada', dataRetirada: null, dataDevolucao: null },
    }), 99, true);
    expect(reservation.status).toBe('Confirmada');
    expect(reservation.rentalStarted).toBe(false);
  });

  it('does not treat canceled reservations as effective, even if a rental relation exists', () => {
    const reservation = mapReservation(makeApiReservation({
      status: 'cancelada',
      locacao: { status: 'em_andamento', dataRetirada: '2026-12-01T10:00:00.000Z', dataDevolucao: null },
    }), 99, true);
    expect(reservation.rentalStarted).toBe(false);
  });

  it('does not mark another client reservation as mine for an operational user', () => {
    const reservation = mapReservation(makeApiReservation(), 99, false);
    expect(reservation.mine).toBe(false);
  });
});
