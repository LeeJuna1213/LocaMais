import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import { RedisService } from './redis.service.js';
import { CacheInvalidationService } from './cache-invalidation.service.js';

describe('CacheInvalidationService', () => {
  let dataSource: { query: ReturnType<typeof vi.fn> };
  let redis: { del: ReturnType<typeof vi.fn> };
  let service: CacheInvalidationService;

  beforeEach(() => {
    dataSource = { query: vi.fn() };
    redis = { del: vi.fn().mockResolvedValue(undefined) };
    service = new CacheInvalidationService(
      dataSource as unknown as DataSource,
      redis as unknown as RedisService,
    );
  });

  it('invalidates client, its user aggregate, reservations and linked inspections using DB IDs', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 17 }])
      .mockResolvedValueOnce([{ id: 'reservation-1' }, { id: 'reservation-2' }])
      .mockResolvedValueOnce([{ id: 'inspection-1' }]);

    await service.invalidateClientDependents(17);

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT user_id AS id FROM clientes WHERE id = ?',
      [17],
    );
    expect(redis.del.mock.calls).toEqual([
      ['locamais:usuario:17'],
      ['locamais:reserva:reservation-1'],
      ['locamais:reserva:reservation-2'],
      ['locamais:vistoria:inspection-1'],
    ]);
  });

  it('does not stop later invalidations when Redis DEL fails', async () => {
    redis.del.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(
      service.invalidateKeys(['locamais:carro:3', 'locamais:reserva:r1']),
    ).resolves.toBeUndefined();
    expect(redis.del).toHaveBeenCalledTimes(2);
  });

  it('invalidates both user and client aggregates for an address FK', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 17 }])
      .mockResolvedValueOnce([{ id: 29 }]);

    await service.invalidateAddressAggregates(42);

    expect(dataSource.query.mock.calls).toEqual([
      ['SELECT client_id AS id FROM enderecos WHERE id = ?', [42]],
      ['SELECT user_id AS id FROM clientes WHERE id IN (?)', [17]],
    ]);
    expect(redis.del.mock.calls).toEqual([
      ['locamais:cliente:17'],
      ['locamais:usuario:29'],
    ]);
  });

  it('invalidates only reservations whose FK points to the updated car', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 'reservation-a' }]);

    await service.invalidateCarDependents(8);

    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT id FROM reservas WHERE car_id = ?',
      [8],
    );
    expect(redis.del.mock.calls).toEqual([['locamais:reserva:reservation-a']]);
  });

  it('invalidates the inspection, source reservation, car, and same-car reservations for rental lifecycle changes', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 'inspection-pickup' }])
      .mockResolvedValueOnce([{ id: 'reservation-source' }, { id: 'reservation-next' }]);

    await service.invalidateLocacaoDependents(
      'rental-1',
      'reservation-source',
      8,
      true,
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM vistorias WHERE locacao_id = ?',
      ['rental-1'],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id FROM reservas WHERE car_id = ?',
      [8],
    );
    expect(redis.del.mock.calls).toEqual([
      ['locamais:vistoria:inspection-pickup'],
      ['locamais:reserva:reservation-source'],
      ['locamais:carro:8'],
      ['locamais:reserva:reservation-next'],
    ]);
  });

  it('finds inspections through the reservation-to-rental FK chain', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 'rental-1' }])
      .mockResolvedValueOnce([{ id: 'inspection-1' }, { id: 'inspection-2' }]);

    await service.invalidateReservationInspections('reservation-1');

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM locacoes WHERE reservation_id = ?',
      ['reservation-1'],
    );
    expect(redis.del.mock.calls).toEqual([
      ['locamais:vistoria:inspection-1'],
      ['locamais:vistoria:inspection-2'],
    ]);
  });
});
