import { describe, expect, it } from 'vitest';
import { Reservation, Vehicle } from '../../core/models';
import { RevisionCostByVehicleApi } from '../../core/models';
import { buildReservationReportCategories, buildRevisionCostsByVehicle } from './reports.page';

const vehicle = (id: number, name: string): Vehicle => ({
  id, name, version: 'Teste', pricePerDay: 100, status: 'Disponível', color: '#000',
  category: 'Teste', transmission: null, revisions: [], favorite: false,
});

const reservation = (id: string, status: Reservation['status'], rentalStarted = false): Reservation => ({
  id, publicCode: id, clientName: 'Cliente', mine: false, vehicleId: 1,
  start: '2026-12-01T10:00:00.000Z', end: '2026-12-03T10:00:00.000Z', status,
  total: 200, payment: 'Pendente', paymentMethod: 'PIX', rentalStarted,
});

describe('ReportsPage report groupings', () => {
  it('lists only vehicles represented by real revision-cost rows', () => {
    const vehicles = [vehicle(1, 'Com revisão'), vehicle(2, 'Sem revisão')];
    const costs: RevisionCostByVehicleApi[] = [{ carro_id: 1, quantidade: 2, total: 480 }];

    expect(buildRevisionCostsByVehicle(vehicles, costs)).toEqual([
      { vehicle: vehicles[0], quantidade: 2, total: 480 },
    ]);
  });

  it('orders pending, confirmed, effective and canceled reservations without duplicates', () => {
    const items = [
      reservation('pending', 'Pendente'),
      reservation('confirmed', 'Confirmada'),
      reservation('active-rental', 'Em andamento', true),
      reservation('completed-rental', 'Concluída', true),
      reservation('canceled', 'Cancelada'),
      reservation('canceled-rental', 'Cancelada', true),
    ];

    const categories = buildReservationReportCategories(items);

    expect(categories.map((category) => category.tab)).toEqual([
      'Pendentes', 'Confirmadas', 'Efetivadas', 'Canceladas',
    ]);
    expect(categories.map((category) => category.reservations.map((item) => item.id))).toEqual([
      ['pending'], ['confirmed'], ['active-rental', 'completed-rental'], ['canceled', 'canceled-rental'],
    ]);
    const classified = categories.flatMap((category) => category.reservations.map((item) => item.id));
    expect(new Set(classified).size).toBe(classified.length);
  });
});
