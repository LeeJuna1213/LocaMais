import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVehicleInspectionSchedule1796400000000 implements MigrationInterface {
  name = 'AddVehicleInspectionSchedule1796400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const mysql = queryRunner.connection.options.type === 'mysql';
    if (mysql) {
      await queryRunner.query('ALTER TABLE carros ADD proximaVistoriaKm int NULL');
      await queryRunner.query('ALTER TABLE vistorias MODIFY tipo enum(\'retirada\',\'devolucao\',\'periodica\') NOT NULL');
      await queryRunner.query('ALTER TABLE vistorias ADD carro_id int NULL');
      await queryRunner.query('ALTER TABLE vistorias ADD km int NULL');
      await queryRunner.query('ALTER TABLE vistorias ADD valor decimal(10,2) NULL');
      await queryRunner.query('ALTER TABLE vistorias ADD INDEX idx_vistorias_carro_tipo_data (carro_id, tipo, data)');
      await queryRunner.query('ALTER TABLE vistorias ADD CONSTRAINT fk_vistorias_carro FOREIGN KEY (carro_id) REFERENCES carros(id) ON DELETE RESTRICT');
    } else {
      await queryRunner.query('ALTER TABLE carros ADD COLUMN proximaVistoriaKm integer NULL');
      await queryRunner.query('ALTER TABLE vistorias ADD COLUMN carro_id integer NULL REFERENCES carros(id) ON DELETE RESTRICT');
      await queryRunner.query('ALTER TABLE vistorias ADD COLUMN km integer NULL');
      await queryRunner.query('ALTER TABLE vistorias ADD COLUMN valor decimal(10,2) NULL');
      await queryRunner.query('CREATE INDEX idx_vistorias_carro_tipo_data ON vistorias (carro_id, tipo, data)');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const periodicRows = await queryRunner.query("SELECT COUNT(*) AS total FROM vistorias WHERE tipo = 'periodica'") as Array<{ total: number | string }>;
    if (Number(periodicRows[0]?.total ?? 0) > 0) {
      throw new Error('Não é possível reverter a migration: há vistorias periódicas registradas.');
    }
    if (queryRunner.connection.options.type === 'mysql') {
      await queryRunner.query('ALTER TABLE vistorias DROP FOREIGN KEY fk_vistorias_carro');
      await queryRunner.query('ALTER TABLE vistorias DROP INDEX idx_vistorias_carro_tipo_data');
      await queryRunner.query('ALTER TABLE vistorias DROP COLUMN valor');
      await queryRunner.query('ALTER TABLE vistorias DROP COLUMN km');
      await queryRunner.query('ALTER TABLE vistorias DROP COLUMN carro_id');
      await queryRunner.query('ALTER TABLE vistorias MODIFY tipo enum(\'retirada\',\'devolucao\') NOT NULL');
      await queryRunner.query('ALTER TABLE carros DROP COLUMN proximaVistoriaKm');
    } else {
      await queryRunner.query('DROP INDEX idx_vistorias_carro_tipo_data');
      await queryRunner.query('ALTER TABLE vistorias DROP COLUMN valor');
      await queryRunner.query('ALTER TABLE vistorias DROP COLUMN km');
      await queryRunner.query('ALTER TABLE vistorias DROP COLUMN carro_id');
      await queryRunner.query('ALTER TABLE carros DROP COLUMN proximaVistoriaKm');
    }
  }
}
