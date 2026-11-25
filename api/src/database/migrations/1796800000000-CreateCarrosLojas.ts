import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Stores permanent pickup eligibility. Existing cars intentionally start without associations. */
export class CreateCarrosLojas1796800000000 implements MigrationInterface {
  name = 'CreateCarrosLojas1796800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE carros_lojas (
      carro_id int NOT NULL,
      loja_id int NOT NULL,
      PRIMARY KEY (carro_id, loja_id),
      INDEX idx_carros_lojas_loja_id (loja_id),
      CONSTRAINT fk_carros_lojas_carro FOREIGN KEY (carro_id) REFERENCES carros(id) ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT fk_carros_lojas_loja FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE ON UPDATE NO ACTION
    ) ENGINE=InnoDB`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `carros_lojas`');
  }
}
