import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFotoToCarros1763400000000 implements MigrationInterface {
  name = 'AddFotoToCarros1763400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `carros` ADD `foto` varchar(500) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `carros` DROP COLUMN `foto`');
  }
}
