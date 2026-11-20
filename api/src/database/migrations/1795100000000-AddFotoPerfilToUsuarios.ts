import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFotoPerfilToUsuarios1795100000000 implements MigrationInterface {
  name = 'AddFotoPerfilToUsuarios1795100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `usuarios` ADD `foto` varchar(500) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `usuarios` DROP COLUMN `foto`');
  }
}
