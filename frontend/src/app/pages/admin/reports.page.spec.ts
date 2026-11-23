import { describe, expect, it } from 'vitest';
import { Reservation, Vehicle } from '../../core/models';
import { RevisionCostByVehicleApi } from '../../core/models';
import { buildInspectionCostsByVehicle, buildReservationReportCategories, buildRevisionCostsByVehicle, ReportsPage } from './reports.page';

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

  it('keeps completed inspection expenses separate and normalizes individual costs', () => {
    const inspections = buildInspectionCostsByVehicle([{
      carro_id: 1, modelo: 'Hyundai HB20', placa: 'ABC1D23', quantidade: '2', total: '285.50',
      vistorias: [
        { id: 'v1', data: '2026-01-01', descricao: 'Pneus', km: 50000, valor: '100.00' },
        { id: 'v2', data: '2026-10-01', descricao: 'Freios', km: 60000, valor: '185.50' },
      ],
    }, { carro_id: 2, modelo: 'Sem vistoria', placa: 'SEM0001', quantidade: 0, total: 0, vistorias: [] }]);
    expect(inspections).toHaveLength(1);
    expect(inspections[0].total).toBe(285.5);
    expect(inspections[0].vistorias.map((item) => item.valor)).toEqual([100, 185.5]);
  });

  it('formats inspection expense dates without a timezone day shift', () => {
    const component = Object.create(ReportsPage.prototype) as ReportsPage;
    expect(component.formatInspectionDate('2026-11-23T00:00:00.000Z')).toBe('23/11/2026');
  });
});
