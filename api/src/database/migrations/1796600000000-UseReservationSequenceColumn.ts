import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves reservation-code allocation into reservas. Existing public codes are
 * intentionally left untouched; codigo_sequencial is an internal allocator.
 */
export class UseReservationSequenceColumn1796600000000 implements MigrationInterface {
  name = 'UseReservationSequenceColumn1796600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('reservas'))) {
      throw new Error('Tabela reservas não encontrada; migration cancelada.');
    }
    const invalidCodes = await queryRunner.query(
      "SELECT SUM(CASE WHEN codigo IS NULL OR codigo = '' THEN 1 ELSE 0 END) AS missing_total, COUNT(DISTINCT codigo) AS unique_total FROM reservas",
    );
    const reservationCount = await queryRunner.query('SELECT COUNT(*) AS total FROM reservas');
    if (Number(invalidCodes[0]?.missing_total ?? 0) > 0) {
      throw new Error('Há reservas sem código amigável; tabela de sequência preservada e migration cancelada.');
    }
    if (Number(invalidCodes[0]?.unique_total ?? 0) !== Number(reservationCount[0]?.total ?? 0)) {
      throw new Error('Há códigos de reserva duplicados; tabela de sequência preservada e migration cancelada.');
    }

    const hasSequenceTable = await queryRunner.hasTable('sequencia_codigos_publicos_reserva');
    const hasSequenceColumn = await queryRunner.hasColumn('reservas', 'codigo_sequencial');
    if (!hasSequenceTable && hasSequenceColumn) return;
    if (!hasSequenceTable) throw new Error('Tabela de sequência esperada não encontrada; migration cancelada.');

    const type = queryRunner.connection.options.type;
    if (type === 'mysql' || type === 'mariadb') {
      const dependencies = await queryRunner.query(
        `SELECT COUNT(*) AS total FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ?`,
        ['sequencia_codigos_publicos_reserva'],
      );
      if (Number(dependencies[0]?.total ?? 0) > 0) {
        throw new Error('A tabela de sequência possui chaves estrangeiras dependentes; remoção cancelada.');
      }
    }

    if (!hasSequenceColumn) {
      if (type === 'mysql' || type === 'mariadb') {
        await queryRunner.query('ALTER TABLE reservas ADD codigo_sequencial INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE');
      } else {
        await queryRunner.query('ALTER TABLE reservas ADD COLUMN codigo_sequencial INTEGER NULL');
        const reservations = await queryRunner.query('SELECT id FROM reservas ORDER BY created_at ASC, id ASC') as Array<{ id: string }>;
        for (let index = 0; index < reservations.length; index += 1) {
          await queryRunner.query('UPDATE reservas SET codigo_sequencial = ? WHERE id = ?', [index + 1, reservations[index].id]);
        }
      }
    }

    if (type !== 'mysql' && type !== 'mariadb') {
      const table = await queryRunner.getTable('reservas');
      if (!table?.indices.some((index) => index.name === 'UQ_reservas_codigo_sequencial')) {
        await queryRunner.query('CREATE UNIQUE INDEX UQ_reservas_codigo_sequencial ON reservas (codigo_sequencial)');
      }
    }

    const codes = await queryRunner.query('SELECT codigo FROM reservas WHERE codigo IS NOT NULL') as Array<{ codigo: string }>;
    const maxExistingNumber = codes.reduce((max, row) => Math.max(max, Number(row.codigo.match(/(\d+)$/)?.[1] ?? 0)), 0);
    const oldSequence = await queryRunner.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM sequencia_codigos_publicos_reserva') as Array<{ max_id: number }>;
    const nextSequence = Math.max(maxExistingNumber, Number(oldSequence[0]?.max_id ?? 0)) + 1;
    if (type === 'mysql' || type === 'mariadb') {
      await queryRunner.query(`ALTER TABLE reservas AUTO_INCREMENT = ${nextSequence}`);
    } else {
      const current = await queryRunner.query('SELECT COALESCE(MAX(codigo_sequencial), 0) AS max_id FROM reservas') as Array<{ max_id: number }>;
      if (nextSequence - 1 > Number(current[0]?.max_id ?? 0)) {
        const row = await queryRunner.query('SELECT id FROM reservas ORDER BY codigo_sequencial ASC LIMIT 1') as Array<{ id: string }>;
        if (row[0]) await queryRunner.query('UPDATE reservas SET codigo_sequencial = ? WHERE id = ?', [nextSequence - 1, row[0].id]);
      }
    }

    await queryRunner.dropTable('sequencia_codigos_publicos_reserva');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('sequencia_codigos_publicos_reserva')) {
      throw new Error('Tabela de sequência já existe; reversão cancelada para evitar sobrescrever dados.');
    }

    const type = queryRunner.connection.options.type;
    if (type === 'mysql' || type === 'mariadb') {
      await queryRunner.query(`CREATE TABLE sequencia_codigos_publicos_reserva (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY
      ) ENGINE=InnoDB`);
    } else {
      await queryRunner.query('CREATE TABLE sequencia_codigos_publicos_reserva (id INTEGER PRIMARY KEY AUTOINCREMENT)');
    }

    const codes = await queryRunner.query('SELECT codigo FROM reservas WHERE codigo IS NOT NULL') as Array<{ codigo: string }>;
    const maxCodeNumber = codes.reduce((max, row) => Math.max(max, Number(row.codigo.match(/(\d+)$/)?.[1] ?? 0)), 0);
    const sequenceColumn = await queryRunner.hasColumn('reservas', 'codigo_sequencial');
    const currentSequence = sequenceColumn
      ? await queryRunner.query('SELECT COALESCE(MAX(codigo_sequencial), 0) AS max_id FROM reservas') as Array<{ max_id: number }>
      : [{ max_id: 0 }];
    const sequenceHighWatermark = Math.max(maxCodeNumber, Number(currentSequence[0]?.max_id ?? 0));
    if (sequenceHighWatermark > 0) {
      if (type === 'mysql' || type === 'mariadb') {
        await queryRunner.query('INSERT INTO sequencia_codigos_publicos_reserva (id) VALUES (?)', [sequenceHighWatermark]);
      } else {
        await queryRunner.query('INSERT INTO sequencia_codigos_publicos_reserva (id) VALUES (?)', [sequenceHighWatermark]);
      }
    }

    if (type !== 'mysql' && type !== 'mariadb') {
      await queryRunner.query('DROP INDEX UQ_reservas_codigo_sequencial');
    }
    await queryRunner.query('ALTER TABLE reservas DROP COLUMN codigo_sequencial');
  }
}
