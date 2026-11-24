import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renomeia tabelas legadas sem recriá-las. O MySQL/InnoDB preserva dados,
 * índices e constraints, além de atualizar referências de chaves estrangeiras
 * quando uma tabela referenciada muda de nome. As migrations históricas que
 * criaram os nomes antigos permanecem imutáveis; esta migration também é
 * executada em bancos novos ao final do histórico.
 */
export class RenameTablesToPortuguese1796500000000 implements MigrationInterface {
  name = 'RenameTablesToPortuguese1796500000000';

  private readonly renames: ReadonlyArray<readonly [string, string]> = [
    ['password_reset_tokens', 'tokens_redefinicao_senha'],
    ['reservation_public_code_sequence', 'sequencia_codigos_publicos_reserva'],
    ['gateways_de_pagamento', 'provedores_de_pagamento'],
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [oldName, newName] of this.renames) {
      await this.renameTable(queryRunner, oldName, newName);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [oldName, newName] of [...this.renames].reverse()) {
      await this.renameTable(queryRunner, newName, oldName);
    }
  }

  private async renameTable(
    queryRunner: QueryRunner,
    from: string,
    to: string,
  ): Promise<void> {
    const fromExists = await queryRunner.hasTable(from);
    const toExists = await queryRunner.hasTable(to);

    // MySQL commits DDL statements individually. Skipping an already completed
    // rename lets TypeORM safely retry if a later rename failed mid-migration.
    if (!fromExists && toExists) return;
    if (!fromExists) {
      throw new Error(`Tabela esperada para renomeação não encontrada: ${from}`);
    }
    if (toExists) {
      throw new Error(`A tabela de destino já existe; renomeação cancelada: ${to}`);
    }

    await queryRunner.renameTable(from, to);
  }
}
