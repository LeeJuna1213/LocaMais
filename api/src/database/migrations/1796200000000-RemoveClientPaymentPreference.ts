import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Remove the retired client payment-preference field. */
export class RemoveClientPaymentPreference1796200000000 implements MigrationInterface {
  name = 'RemoveClientPaymentPreference1796200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('clientes', 'metodo_pagamento_preferido')) {
      await queryRunner.query('ALTER TABLE clientes DROP COLUMN metodo_pagamento_preferido');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('clientes', 'metodo_pagamento_preferido'))) {
      await queryRunner.query('ALTER TABLE clientes ADD metodo_pagamento_preferido varchar(30) NULL');
    }
  }
}
