import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPickupShopToReservations1795900000000 implements MigrationInterface {
  name = 'AddPickupShopToReservations1795900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `reservas` ADD `loja_retirada_id` int NULL');
    await queryRunner.query('ALTER TABLE `reservas` ADD `lojaRetiradaSnapshot` text NULL');
    await queryRunner.query('ALTER TABLE `reservas` ADD CONSTRAINT `fk_reservas_pickup_shop` FOREIGN KEY (`loja_retirada_id`) REFERENCES `lojas`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION');
    await queryRunner.query('CREATE INDEX `idx_reservas_pickup_shop` ON `reservas` (`loja_retirada_id`)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `idx_reservas_pickup_shop` ON `reservas`');
    await queryRunner.query('ALTER TABLE `reservas` DROP FOREIGN KEY `fk_reservas_pickup_shop`');
    await queryRunner.query('ALTER TABLE `reservas` DROP COLUMN `lojaRetiradaSnapshot`');
    await queryRunner.query('ALTER TABLE `reservas` DROP COLUMN `loja_retirada_id`');
  }
}
