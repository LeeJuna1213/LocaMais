import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLojas1795500000000 implements MigrationInterface {
  name = 'CreateLojas1795500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const autoIncrement = queryRunner.connection.options.type === 'mysql' ? 'int NOT NULL AUTO_INCREMENT' : 'integer PRIMARY KEY AUTOINCREMENT';
    const primary = queryRunner.connection.options.type === 'mysql' ? 'PRIMARY KEY' : '';
    await queryRunner.query(`CREATE TABLE lojas (
      id ${autoIncrement} ${primary},
      codigo varchar(30) NOT NULL UNIQUE,
      nome varchar(150) NOT NULL,
      telefone varchar(20) NOT NULL,
      email varchar(180) NOT NULL,
      logradouro varchar(200) NOT NULL,
      numero varchar(20) NOT NULL,
      complemento varchar(100) NULL,
      bairro varchar(100) NOT NULL,
      cidade varchar(100) NOT NULL,
      uf varchar(2) NOT NULL,
      cep varchar(8) NOT NULL,
      ativa boolean NOT NULL DEFAULT 1,
      created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE lojas');
  }
}
