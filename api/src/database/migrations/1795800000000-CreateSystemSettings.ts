import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemSettings1795800000000 implements MigrationInterface {
  name = 'CreateSystemSettings1795800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE configuracoes_sistema (
      chave varchar(100) NOT NULL PRIMARY KEY,
      valor decimal(10,2) NOT NULL,
      updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    await queryRunner.query("INSERT INTO configuracoes_sistema (chave, valor) VALUES ('taxa_servico', 0)");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE configuracoes_sistema');
  }
}
