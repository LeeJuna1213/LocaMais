import type { MigrationInterface, QueryRunner } from 'typeorm';
import { Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreatePasswordResetTokens1795000000000 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1795000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(new Table({
      name: 'password_reset_tokens',
      columns: [
        { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
        { name: 'user_id', type: 'int', isNullable: false },
        { name: 'token_hash', type: 'varchar', length: '64', isNullable: false },
        { name: 'expires_at', type: 'datetime', isNullable: false },
        { name: 'used_at', type: 'datetime', isNullable: true },
        { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
      indices: [
        new TableIndex({ name: 'UQ_password_reset_tokens_token_hash', columnNames: ['token_hash'], isUnique: true }),
        new TableIndex({ name: 'IDX_password_reset_tokens_user_id', columnNames: ['user_id'] }),
      ],
      foreignKeys: [new TableForeignKey({
        name: 'FK_password_reset_tokens_user',
        columnNames: ['user_id'],
        referencedTableName: 'usuarios',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })],
    }), true);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('password_reset_tokens', true);
  }
}
