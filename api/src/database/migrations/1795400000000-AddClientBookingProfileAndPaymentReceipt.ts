import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientBookingProfileAndPaymentReceipt1795400000000 implements MigrationInterface {
  name = 'AddClientBookingProfileAndPaymentReceipt1795400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `clientes` ADD `telefone` varchar(20) NULL');
    await queryRunner.query('ALTER TABLE `clientes` ADD `cnh_numero` varchar(11) NULL');
    await queryRunner.query('ALTER TABLE `clientes` ADD `cnh_validade` date NULL');
    await queryRunner.query('ALTER TABLE `pagamentos` ADD `comprovante_snapshot` text NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `pagamentos` DROP COLUMN `comprovante_snapshot`');
    await queryRunner.query('ALTER TABLE `clientes` DROP COLUMN `cnh_validade`');
    await queryRunner.query('ALTER TABLE `clientes` DROP COLUMN `cnh_numero`');
    await queryRunner.query('ALTER TABLE `clientes` DROP COLUMN `telefone`');
  }
}
