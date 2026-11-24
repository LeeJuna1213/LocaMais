import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UseReservationSequenceColumn1796600000000 } from '../1796600000000-UseReservationSequenceColumn.js';

describe('UseReservationSequenceColumn1796600000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({ type: 'better-sqlite3', database: ':memory:' });
    await dataSource.initialize();
    await dataSource.query('CREATE TABLE reservas (id varchar(36) PRIMARY KEY, codigo varchar(20), created_at datetime)');
    await dataSource.query('CREATE TABLE sequencia_codigos_publicos_reserva (id integer PRIMARY KEY AUTOINCREMENT)');
    await dataSource.query("INSERT INTO reservas (id, codigo, created_at) VALUES ('r1', 'RES-000001', '2026-01-01'), ('r2', 'RES-000002', '2026-01-02')");
    await dataSource.query('INSERT INTO sequencia_codigos_publicos_reserva DEFAULT VALUES');
    await dataSource.query('INSERT INTO sequencia_codigos_publicos_reserva DEFAULT VALUES');
  });

  afterEach(async () => dataSource.destroy());

  it('moves allocation into reservas and reverses without changing codes or reservations', async () => {
    const migration = new UseReservationSequenceColumn1796600000000();
    const runner = dataSource.createQueryRunner();

    await migration.up(runner);

    expect(await runner.hasTable('sequencia_codigos_publicos_reserva')).toBe(false);
    expect((await runner.getTable('reservas'))?.indices.some((index) => index.isUnique)).toBe(true);
    expect(await runner.query('SELECT id, codigo, codigo_sequencial FROM reservas ORDER BY id')).toEqual([
      { id: 'r1', codigo: 'RES-000001', codigo_sequencial: 1 },
      { id: 'r2', codigo: 'RES-000002', codigo_sequencial: 2 },
    ]);
    await runner.query("INSERT INTO reservas (id, codigo, codigo_sequencial) VALUES ('r3', 'LOC-000003', 3)");
    await expect(runner.query("INSERT INTO reservas (id, codigo, codigo_sequencial) VALUES ('r4', 'LOC-000003', 3)"))
      .rejects.toThrow();

    await migration.down(runner);

    expect(await runner.hasTable('sequencia_codigos_publicos_reserva')).toBe(true);
    expect(await runner.query('SELECT id, codigo FROM reservas ORDER BY id')).toEqual([
      { id: 'r1', codigo: 'RES-000001' },
      { id: 'r2', codigo: 'RES-000002' },
      { id: 'r3', codigo: 'LOC-000003' },
    ]);
    expect(await runner.query('SELECT id FROM sequencia_codigos_publicos_reserva')).toEqual([{ id: 3 }]);
    await runner.release();
  });

  it('does not remove the old sequence table if any reservation has no public code', async () => {
    await dataSource.query("INSERT INTO reservas (id, codigo, created_at) VALUES ('r-null', NULL, '2026-01-03')");
    const runner = dataSource.createQueryRunner();

    await expect(new UseReservationSequenceColumn1796600000000().up(runner)).rejects.toThrow(/sem código/);
    expect(await runner.hasTable('sequencia_codigos_publicos_reserva')).toBe(true);
    expect((await runner.query('PRAGMA table_info(reservas)')).some((column: { name: string }) => column.name === 'codigo_sequencial')).toBe(false);
    await runner.release();
  });
});
