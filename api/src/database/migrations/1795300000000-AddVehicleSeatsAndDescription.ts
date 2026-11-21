import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleSeatsAndDescription1795300000000 implements MigrationInterface {
  name = 'AddVehicleSeatsAndDescription1795300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `carros` ADD `lugares` int NULL');
    await queryRunner.query('ALTER TABLE `carros` ADD `descricao` varchar(1000) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `carros` DROP COLUMN `descricao`');
    await queryRunner.query('ALTER TABLE `carros` DROP COLUMN `lugares`');
  }
}
