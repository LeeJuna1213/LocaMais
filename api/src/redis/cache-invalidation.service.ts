import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from './redis.service.js';

/** Directed, best-effort invalidation of existing cache keys using MySQL FKs. */
@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
  ) {}

  async invalidateKeys(keys: string[]): Promise<void> {
    for (const key of new Set(keys)) {
      try {
        await this.redis.del(key);
      } catch (error) {
        this.logger.error(
          `Falha ao invalidar chave ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async invalidateUserDependents(userId: number): Promise<void> {
    const clients = await this.queryIds(
      'SELECT id FROM clientes WHERE user_id = ?',
      [userId],
    );
    await this.invalidateKeys(clients.map((id) => `locamais:cliente:${id}`));
  }

  async invalidateClientDependents(clientId: number): Promise<void> {
    const [users, reservations] = await Promise.all([
      this.queryIds('SELECT user_id AS id FROM clientes WHERE id = ?', [clientId]),
      this.queryIds('SELECT id FROM reservas WHERE client_id = ?', [clientId]),
    ]);
    const inspections = reservations.length
      ? await this.queryIds(
          `SELECT v.id FROM vistorias v INNER JOIN locacoes l ON l.id = v.locacao_id WHERE l.reservation_id IN (${reservations.map(() => '?').join(',')})`,
          reservations,
        )
      : [];
    await this.invalidateKeys([
      ...users.map((id) => `locamais:usuario:${id}`),
      ...reservations.map((id) => `locamais:reserva:${id}`),
      ...inspections.map((id) => `locamais:vistoria:${id}`),
    ]);
  }

  async invalidateAddressAggregates(addressId: number): Promise<void> {
    const clients = await this.queryIds(
      'SELECT client_id AS id FROM enderecos WHERE id = ?',
      [addressId],
    );
    const clientIds = clients.map(Number);
    const users = clientIds.length
      ? await this.queryIds(
          `SELECT user_id AS id FROM clientes WHERE id IN (${clientIds.map(() => '?').join(',')})`,
          clientIds,
        )
      : [];
    await this.invalidateKeys([
      ...clientIds.map((id) => `locamais:cliente:${id}`),
      ...users.map((id) => `locamais:usuario:${id}`),
    ]);
  }

  async invalidateCarDependents(carId: number): Promise<void> {
    const reservations = await this.queryIds(
      'SELECT id FROM reservas WHERE car_id = ?',
      [carId],
    );
    await this.invalidateKeys(
      reservations.map((id) => `locamais:reserva:${id}`),
    );
  }

  async invalidateRevisionDependents(carId: number): Promise<void> {
    await this.invalidateCarDependents(carId);
    await this.invalidateKeys([`locamais:carro:${carId}`]);
  }

  async invalidateLocacaoDependents(
    locacaoId: string,
    reservationId: string,
    carId: number,
    includeCarReservations: boolean,
  ): Promise<void> {
    const [inspections, carReservations] = await Promise.all([
      this.queryIds('SELECT id FROM vistorias WHERE locacao_id = ?', [locacaoId]),
      includeCarReservations
        ? this.queryIds('SELECT id FROM reservas WHERE car_id = ?', [carId])
        : Promise.resolve([]),
    ]);
    await this.invalidateKeys([
      ...inspections.map((id) => `locamais:vistoria:${id}`),
      `locamais:reserva:${reservationId}`,
      `locamais:carro:${carId}`,
      ...carReservations.map((id) => `locamais:reserva:${id}`),
    ]);
  }

  async invalidateLocacaoInspections(locacaoId: string): Promise<void> {
    const inspections = await this.queryIds(
      'SELECT id FROM vistorias WHERE locacao_id = ?',
      [locacaoId],
    );
    await this.invalidateKeys(
      inspections.map((id) => `locamais:vistoria:${id}`),
    );
  }

  async invalidateReservationInspections(reservationId: string): Promise<void> {
    const locacoes = await this.queryIds(
      'SELECT id FROM locacoes WHERE reservation_id = ?',
      [reservationId],
    );
    const inspections = locacoes.length
      ? await this.queryIds(
          `SELECT id FROM vistorias WHERE locacao_id IN (${locacoes.map(() => '?').join(',')})`,
          locacoes,
        )
      : [];
    await this.invalidateKeys(
      inspections.map((id) => `locamais:vistoria:${id}`),
    );
  }

  private async queryIds(sql: string, parameters: unknown[]): Promise<string[]> {
    try {
      const rows = (await this.dataSource.query(sql, parameters)) as Array<{
        id: string | number;
      }>;
      return rows.map(({ id }) => String(id));
    } catch (error) {
      this.logger.error(
        `Falha ao localizar IDs dependentes para invalidação: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
