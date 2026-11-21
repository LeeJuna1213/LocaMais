import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientPaymentPreference1795600000000 implements MigrationInterface {
  name = 'AddClientPaymentPreference1795600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE clientes ADD metodo_pagamento_preferido varchar(30) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE clientes DROP COLUMN metodo_pagamento_preferido');
  }
}
