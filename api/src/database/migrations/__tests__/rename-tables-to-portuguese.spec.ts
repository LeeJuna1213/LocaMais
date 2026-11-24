import { DataSource, type QueryRunner } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RenameTablesToPortuguese1796500000000 } from '../1796500000000-RenameTablesToPortuguese.js';

describe('RenameTablesToPortuguese1796500000', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
    });
    await dataSource.initialize();
    queryRunner = dataSource.createQueryRunner();

    await queryRunner.query('PRAGMA foreign_keys = ON');
    await queryRunner.query('CREATE TABLE usuarios (id integer PRIMARY KEY)');
    await queryRunner.query('CREATE TABLE pagamentos (id varchar(36) PRIMARY KEY)');
    await queryRunner.query(`CREATE TABLE password_reset_tokens (
      id integer PRIMARY KEY,
      user_id integer NOT NULL,
      token_hash varchar(64) NOT NULL,
      CONSTRAINT fk_tokens_usuario FOREIGN KEY (user_id) REFERENCES usuarios(id)
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_password_token_hash ON password_reset_tokens (token_hash)',
    );
    await queryRunner.query(
      'CREATE TABLE reservation_public_code_sequence (id integer PRIMARY KEY)',
    );
    await queryRunner.query(`CREATE TABLE gateways_de_pagamento (
      id varchar(36) PRIMARY KEY,
      pagamento_id varchar(36) NOT NULL,
      CONSTRAINT fk_gateway_pagamento FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id)
    )`);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_gateway_pagamento ON gateways_de_pagamento (pagamento_id)',
    );

    await queryRunner.query('INSERT INTO usuarios (id) VALUES (7)');
    await queryRunner.query("INSERT INTO pagamentos (id) VALUES ('pag-1')");
    await queryRunner.query(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash) VALUES (11, 7, 'hash-1')",
    );
    await queryRunner.query(
      'INSERT INTO reservation_public_code_sequence (id) VALUES (13)',
    );
    await queryRunner.query(
      "INSERT INTO gateways_de_pagamento (id, pagamento_id) VALUES ('gateway-1', 'pag-1')",
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('renames tables without losing rows, indexes, or foreign keys and rolls back', async () => {
    const migration = new RenameTablesToPortuguese1796500000000();

    await migration.up(queryRunner);

    const names = [
      'tokens_redefinicao_senha',
      'sequencia_codigos_publicos_reserva',
      'provedores_de_pagamento',
    ];
    for (const name of names) {
      expect(await queryRunner.hasTable(name)).toBe(true);
    }
    for (const name of [
      'password_reset_tokens',
      'reservation_public_code_sequence',
      'gateways_de_pagamento',
    ]) {
      expect(await queryRunner.hasTable(name)).toBe(false);
    }

    expect(await queryRunner.query('SELECT id, user_id, token_hash FROM tokens_redefinicao_senha')).toEqual([
      { id: 11, user_id: 7, token_hash: 'hash-1' },
    ]);
    expect(await queryRunner.query('SELECT id FROM sequencia_codigos_publicos_reserva')).toEqual([
      { id: 13 },
    ]);
    expect(await queryRunner.query('SELECT id, pagamento_id FROM provedores_de_pagamento')).toEqual([
      { id: 'gateway-1', pagamento_id: 'pag-1' },
    ]);

    const tokenTable = await queryRunner.getTable('tokens_redefinicao_senha');
    const providerTable = await queryRunner.getTable('provedores_de_pagamento');
    expect(tokenTable?.indices.map(({ name }) => name)).toContain('uq_password_token_hash');
    expect(tokenTable?.foreignKeys.map(({ referencedTableName }) => referencedTableName)).toContain('usuarios');
    expect(providerTable?.indices.map(({ name }) => name)).toContain('uq_gateway_pagamento');
    expect(providerTable?.foreignKeys.map(({ referencedTableName }) => referencedTableName)).toContain('pagamentos');

    await migration.down(queryRunner);

    expect(await queryRunner.query('SELECT id, token_hash FROM password_reset_tokens')).toEqual([
      { id: 11, token_hash: 'hash-1' },
    ]);
    expect(await queryRunner.query('SELECT id FROM reservation_public_code_sequence')).toEqual([
      { id: 13 },
    ]);
    expect(await queryRunner.query('SELECT id, pagamento_id FROM gateways_de_pagamento')).toEqual([
      { id: 'gateway-1', pagamento_id: 'pag-1' },
    ]);
  });

  it('can safely retry after an earlier rename was committed', async () => {
    await queryRunner.renameTable('password_reset_tokens', 'tokens_redefinicao_senha');

    await new RenameTablesToPortuguese1796500000000().up(queryRunner);

    expect(await queryRunner.hasTable('tokens_redefinicao_senha')).toBe(true);
    expect(await queryRunner.hasTable('sequencia_codigos_publicos_reserva')).toBe(true);
    expect(await queryRunner.hasTable('provedores_de_pagamento')).toBe(true);
  });
});
