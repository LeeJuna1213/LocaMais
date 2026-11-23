import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds a logical-deletion marker without changing existing client records. */
export class AddClientDeletedAt1796300000000 implements MigrationInterface {
  name = 'AddClientDeletedAt1796300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('clientes', 'deleted_at'))) {
      await queryRunner.query('ALTER TABLE clientes ADD deleted_at datetime NULL');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('clientes', 'deleted_at')) {
      await queryRunner.query('ALTER TABLE clientes DROP COLUMN deleted_at');
    }
  }
}
