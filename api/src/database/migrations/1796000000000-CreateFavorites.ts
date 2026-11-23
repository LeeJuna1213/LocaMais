import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFavorites1796000000000 implements MigrationInterface {
  name = 'CreateFavorites1796000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'mysql') {
      await queryRunner.query(`CREATE TABLE favoritos (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        client_id int NOT NULL,
        car_id int NOT NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_favoritos_cliente_carro UNIQUE (client_id, car_id),
        CONSTRAINT fk_favoritos_cliente FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE CASCADE,
        CONSTRAINT fk_favoritos_carro FOREIGN KEY (car_id) REFERENCES carros(id) ON DELETE CASCADE
      )`);
    } else {
      await queryRunner.query(`CREATE TABLE favoritos (
        id integer PRIMARY KEY AUTOINCREMENT,
        client_id integer NOT NULL,
        car_id integer NOT NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_favoritos_cliente_carro UNIQUE (client_id, car_id),
        CONSTRAINT fk_favoritos_cliente FOREIGN KEY (client_id) REFERENCES clientes(id) ON DELETE CASCADE,
        CONSTRAINT fk_favoritos_carro FOREIGN KEY (car_id) REFERENCES carros(id) ON DELETE CASCADE
      )`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE favoritos'); }
}
