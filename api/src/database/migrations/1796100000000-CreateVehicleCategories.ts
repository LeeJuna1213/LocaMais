import type { MigrationInterface, QueryRunner } from 'typeorm';

const normalizeName = (name: string): string => name.normalize('NFC').trim().replace(/\s+/g, ' ');
const keyFor = (name: string): string => normalizeName(name).toLocaleLowerCase('pt-BR');

export class CreateVehicleCategories1796100000000 implements MigrationInterface {
  name = 'CreateVehicleCategories1796100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const isMySql = queryRunner.connection.options.type === 'mysql';
    if (isMySql) {
      await queryRunner.query(`CREATE TABLE categorias (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        nome varchar(50) NOT NULL,
        nome_normalizado varchar(100) NOT NULL,
        CONSTRAINT uq_categorias_nome_normalizado UNIQUE (nome_normalizado)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await queryRunner.query('ALTER TABLE carros ADD categoria_id int NULL');
    } else {
      await queryRunner.query(`CREATE TABLE categorias (
        id integer PRIMARY KEY AUTOINCREMENT,
        nome varchar(50) NOT NULL,
        nome_normalizado varchar(100) NOT NULL UNIQUE
      )`);
      await queryRunner.query('ALTER TABLE carros ADD COLUMN categoria_id integer NULL');
    }

    const existingRows = await queryRunner.query(
      `SELECT DISTINCT categoria FROM carros WHERE categoria IS NOT NULL AND TRIM(categoria) <> ''`,
    ) as Array<{ categoria: string }>;
    const byKey = new Map<string, string>();
    for (const row of existingRows) {
      const nome = normalizeName(row.categoria);
      if (nome) byKey.set(keyFor(nome), byKey.get(keyFor(nome)) ?? nome);
    }
    if (!byKey.has(keyFor('Sem categoria'))) byKey.set(keyFor('Sem categoria'), 'Sem categoria');

    for (const [nome_normalizado, nome] of byKey) {
      await queryRunner.query(
        'INSERT INTO categorias (nome, nome_normalizado) VALUES (?, ?)',
        [nome, nome_normalizado],
      );
    }

    const categories = await queryRunner.query('SELECT id, nome_normalizado FROM categorias') as Array<{ id: number; nome_normalizado: string }>;
    const idByKey = new Map(categories.map((category) => [category.nome_normalizado, category.id]));
    const vehicles = await queryRunner.query('SELECT id, categoria FROM carros') as Array<{ id: number; categoria: string | null }>;
    for (const vehicle of vehicles) {
      const rawName = normalizeName(vehicle.categoria ?? '');
      const nome = rawName || 'Sem categoria';
      const id = idByKey.get(keyFor(nome));
      if (!id) throw new Error(`Não foi possível migrar a categoria legada do veículo ${vehicle.id}`);
      await queryRunner.query(
        'UPDATE carros SET categoria_id = ?, categoria = ? WHERE id = ?',
        [id, nome, vehicle.id],
      );
    }

    if (isMySql) {
      await queryRunner.query('ALTER TABLE carros MODIFY categoria_id int NOT NULL');
      await queryRunner.query('ALTER TABLE carros ADD INDEX idx_carros_categoria_id (categoria_id)');
      await queryRunner.query(`ALTER TABLE carros ADD CONSTRAINT fk_carros_categoria
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type === 'mysql') {
      await queryRunner.query('ALTER TABLE carros DROP FOREIGN KEY fk_carros_categoria');
      await queryRunner.query('ALTER TABLE carros DROP INDEX idx_carros_categoria_id');
      await queryRunner.query('ALTER TABLE carros DROP COLUMN categoria_id');
    } else {
      await queryRunner.query('ALTER TABLE carros DROP COLUMN categoria_id');
    }
    await queryRunner.query('DROP TABLE categorias');
  }
}
