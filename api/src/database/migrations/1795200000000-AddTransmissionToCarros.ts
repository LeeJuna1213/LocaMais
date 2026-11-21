import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransmissionToCarros1795200000000 implements MigrationInterface {
  name = 'AddTransmissionToCarros1795200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `carros` ADD `cambio` varchar(20) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `carros` DROP COLUMN `cambio`');
  }
}
