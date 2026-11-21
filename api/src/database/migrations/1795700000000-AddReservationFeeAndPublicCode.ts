import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservationFeeAndPublicCode1795700000000 implements MigrationInterface {
  name = 'AddReservationFeeAndPublicCode1795700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE reservas ADD codigo varchar(20) NULL UNIQUE');
    await queryRunner.query('ALTER TABLE reservas ADD valorSubtotal decimal(10,2) NOT NULL DEFAULT 0');
    await queryRunner.query('ALTER TABLE reservas ADD taxaServico decimal(10,2) NOT NULL DEFAULT 0');
    await queryRunner.query(`CREATE TABLE reservation_public_code_sequence (
      id int NOT NULL AUTO_INCREMENT PRIMARY KEY
    )`);
    const existing = await queryRunner.query('SELECT id FROM reservas ORDER BY created_at ASC, id ASC');
    for (const row of existing as Array<{ id: string }>) {
      await queryRunner.query('INSERT INTO reservation_public_code_sequence () VALUES ()');
      const [{ id: codeId }] = await queryRunner.query('SELECT LAST_INSERT_ID() AS id');
      await queryRunner.query('UPDATE reservas SET codigo = ?, valorSubtotal = valorTotal WHERE id = ?', [
        `RES-${String(codeId).padStart(6, '0')}`, row.id,
      ]);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE reservation_public_code_sequence');
    await queryRunner.query('ALTER TABLE reservas DROP COLUMN taxaServico');
    await queryRunner.query('ALTER TABLE reservas DROP COLUMN valorSubtotal');
    await queryRunner.query('ALTER TABLE reservas DROP COLUMN codigo');
  }
}
