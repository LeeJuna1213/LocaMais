import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationPaymentNotificationsAndRefunds1796700000000 implements MigrationInterface {
  name = 'ReservationPaymentNotificationsAndRefunds1796700000000';
  transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    const mysql = queryRunner.connection.options.type === 'mysql';
    if (mysql) {
      await this.setLocacaoNullable(queryRunner, true);
      await queryRunner.query('ALTER TABLE pagamentos ADD reservation_id char(36) NULL');
      await queryRunner.query('ALTER TABLE pagamentos ADD INDEX idx_pagamentos_reserva (reservation_id)');
      await queryRunner.query('ALTER TABLE pagamentos ADD CONSTRAINT fk_pagamentos_reserva FOREIGN KEY (reservation_id) REFERENCES reservas(id) ON DELETE RESTRICT');
      await queryRunner.query("ALTER TABLE pagamentos MODIFY status enum('pendente','aprovado','recusado','cancelado','estornado') NOT NULL DEFAULT 'pendente'");
      await queryRunner.query('ALTER TABLE reservas MODIFY status enum(\'pendente\',\'aguardando_confirmacao\',\'confirmada\',\'cancelada\',\'concluida\') NOT NULL DEFAULT \'pendente\'');
      await queryRunner.query('ALTER TABLE reservas ADD cancelada_em datetime NULL, ADD cancelada_por int NULL');
      await queryRunner.query('CREATE TABLE estornos (id char(36) NOT NULL PRIMARY KEY, pagamento_id char(36) NOT NULL UNIQUE, valor decimal(10,2) NOT NULL, tipo varchar(40) NOT NULL DEFAULT \'simulado\', data datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_estornos_pagamento FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id) ON DELETE RESTRICT) ENGINE=InnoDB');
      await queryRunner.query('CREATE TABLE notificacoes (id char(36) NOT NULL PRIMARY KEY, usuario_id int NOT NULL, reserva_id char(36) NULL, tipo varchar(100) NOT NULL, titulo varchar(180) NOT NULL, descricao text NOT NULL, created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, lida_em datetime NULL, INDEX idx_notificacoes_usuario_criada (usuario_id, created_at), CONSTRAINT fk_notificacoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE, CONSTRAINT fk_notificacoes_reserva FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE SET NULL) ENGINE=InnoDB');
    } else {
      await queryRunner.query('PRAGMA foreign_keys = OFF');
      await queryRunner.query('CREATE TABLE pagamentos__nova (id varchar(36) PRIMARY KEY, valor decimal(10,2) NOT NULL DEFAULT 0, metodo varchar NOT NULL, status varchar NOT NULL DEFAULT \'pendente\', data datetime NOT NULL, locacao_id varchar(36) NULL REFERENCES locacoes(id) ON DELETE RESTRICT, gateway_id varchar(36) NULL REFERENCES provedores_de_pagamento(id) ON DELETE SET NULL, comprovante_snapshot text NULL, created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, reservation_id varchar(36) NULL REFERENCES reservas(id) ON DELETE RESTRICT)');
      await queryRunner.query('INSERT INTO pagamentos__nova (id, valor, metodo, status, data, locacao_id, gateway_id, comprovante_snapshot, created_at, updated_at) SELECT id, valor, metodo, status, data, locacao_id, gateway_id, comprovante_snapshot, created_at, updated_at FROM pagamentos');
      await queryRunner.query('DROP TABLE pagamentos');
      await queryRunner.query('ALTER TABLE pagamentos__nova RENAME TO pagamentos');
      await queryRunner.query('CREATE INDEX idx_pagamentos_locacao ON pagamentos (locacao_id)');
      await queryRunner.query('CREATE INDEX idx_pagamentos_reserva ON pagamentos (reservation_id)');
      await queryRunner.query('UPDATE reservas SET status = \'aguardando_confirmacao\' WHERE status = \'confirmada\' AND id IN (SELECT reservation_id FROM pagamentos WHERE status = \'aprovado\' AND reservation_id IS NOT NULL)');
      await queryRunner.query('ALTER TABLE reservas ADD COLUMN cancelada_em datetime NULL');
      await queryRunner.query('ALTER TABLE reservas ADD COLUMN cancelada_por integer NULL');
      await queryRunner.query('CREATE TABLE estornos (id varchar(36) PRIMARY KEY, pagamento_id varchar(36) NOT NULL UNIQUE REFERENCES pagamentos(id) ON DELETE RESTRICT, valor decimal(10,2) NOT NULL, tipo varchar(40) NOT NULL DEFAULT \'simulado\', data datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      await queryRunner.query('CREATE TABLE notificacoes (id varchar(36) PRIMARY KEY, usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, reserva_id varchar(36) NULL REFERENCES reservas(id) ON DELETE SET NULL, tipo varchar(100) NOT NULL, titulo varchar(180) NOT NULL, descricao text NOT NULL, created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, lida_em datetime NULL)');
      await queryRunner.query('CREATE INDEX idx_notificacoes_usuario_criada ON notificacoes (usuario_id, created_at)');
      await queryRunner.query('PRAGMA foreign_keys = ON');
      const violations = await queryRunner.query('PRAGMA foreign_key_check') as unknown[];
      if (violations.length) throw new Error('Migration deixou violações de chaves estrangeiras no SQLite.');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasRefunds = Number((await queryRunner.query('SELECT COUNT(*) AS total FROM estornos'))[0]?.total ?? 0);
    const hasNotifications = Number((await queryRunner.query('SELECT COUNT(*) AS total FROM notificacoes'))[0]?.total ?? 0);
    const hasReservationPayments = Number((await queryRunner.query('SELECT COUNT(*) AS total FROM pagamentos WHERE reservation_id IS NOT NULL'))[0]?.total ?? 0);
    if (hasRefunds || hasNotifications || hasReservationPayments) throw new Error('Migration não pode ser revertida enquanto houver histórico de estornos, notificações ou pagamentos de reserva.');
    if (queryRunner.connection.options.type === 'mysql') {
      await queryRunner.query('DROP TABLE notificacoes');
      await queryRunner.query('DROP TABLE estornos');
      await queryRunner.query('ALTER TABLE reservas DROP COLUMN cancelada_por');
      await queryRunner.query('ALTER TABLE reservas DROP COLUMN cancelada_em');
      await queryRunner.query("ALTER TABLE reservas MODIFY status enum('pendente','confirmada','cancelada','concluida') NOT NULL DEFAULT 'pendente'");
      await queryRunner.query('ALTER TABLE pagamentos DROP FOREIGN KEY fk_pagamentos_reserva');
      await queryRunner.query('ALTER TABLE pagamentos DROP INDEX idx_pagamentos_reserva');
      await queryRunner.query('ALTER TABLE pagamentos DROP COLUMN reservation_id');
      await queryRunner.query("ALTER TABLE pagamentos MODIFY status enum('pendente','aprovado','recusado','cancelado') NOT NULL DEFAULT 'pendente'");
      await this.setLocacaoNullable(queryRunner, false);
    } else {
      await queryRunner.query('DROP TABLE notificacoes');
      await queryRunner.query('DROP TABLE estornos');
      await queryRunner.query('ALTER TABLE reservas DROP COLUMN cancelada_por');
      await queryRunner.query('ALTER TABLE reservas DROP COLUMN cancelada_em');
      await queryRunner.query('DROP INDEX idx_pagamentos_reserva');
      await queryRunner.query('ALTER TABLE pagamentos DROP COLUMN reservation_id');
    }
  }

  private async setLocacaoNullable(queryRunner: QueryRunner, nullable: boolean): Promise<void> {
    const constraints = await queryRunner.query(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pagamentos' AND COLUMN_NAME = 'locacao_id' AND REFERENCED_TABLE_NAME IS NOT NULL",
    ) as Array<{ CONSTRAINT_NAME: string }>;
    for (const { CONSTRAINT_NAME: name } of constraints) {
      if (!/^[A-Za-z0-9_$]+$/.test(name)) throw new Error('Nome inesperado para a FK de pagamentos.locacao_id.');
      await queryRunner.query(`ALTER TABLE pagamentos DROP FOREIGN KEY \`${name}\``);
    }
    await queryRunner.query(`ALTER TABLE pagamentos MODIFY locacao_id char(36) ${nullable ? 'NULL' : 'NOT NULL'}`);
    if (constraints.length) {
      await queryRunner.query('ALTER TABLE pagamentos ADD CONSTRAINT fk_pagamentos_locacao FOREIGN KEY (locacao_id) REFERENCES locacoes(id) ON DELETE RESTRICT');
    }
  }
}
