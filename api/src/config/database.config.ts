import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export type SupportedDatabaseType = 'sqlite' | 'mysql';

/**
 * Le `DATABASE_TYPE` e devolve as opcoes do TypeORM correspondentes.
 *
 * O banco e definido inteiramente por `.env`, entao alternar entre SQLite
 * (desenvolvimento/testes) e MySQL (producao) e so trocar o valor da variavel.
 */
export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  const rawType = (config.get<string>('DATABASE_TYPE') ?? 'sqlite').toLowerCase();

  if (rawType !== 'sqlite' && rawType !== 'mysql') {
    throw new Error(
      `DATABASE_TYPE invalido: "${rawType}". Use "sqlite" ou "mysql".`,
    );
  }

  const common = {
    autoLoadEntities: true,
    synchronize: config.get<string>('DATABASE_SYNCHRONIZE') !== 'false',
    logging: config.get<string>('DATABASE_LOGGING') === 'true',
  };

  if (rawType === 'sqlite') {
    return {
      type: 'better-sqlite3',
      database: resolveSqlitePath(config.get<string>('DATABASE_FILE')),
      ...common,
    };
  }

  return {
    type: 'mysql',
    host: config.get<string>('DATABASE_HOST') ?? 'localhost',
    port: Number(config.get<string>('DATABASE_PORT') ?? 3306),
    username: config.get<string>('DATABASE_USERNAME'),
    password: config.get<string>('DATABASE_PASSWORD'),
    database: config.get<string>('DATABASE_NAME'),
    ...common,
  };
}

/**
 * Garante que o diretorio do arquivo SQLite exista.
 *
 * O better-sqlite3 nao cria diretorios: sem isso o primeiro boot falha com
 * `SQLITE_CANTOPEN` assim que o caminho for `./data/...`.
 */
function resolveSqlitePath(databaseFile?: string): string {
  const target = databaseFile || './data/locadora.sqlite';

  // `:memory:` e os URIs de memoria nao tocam o disco.
  if (target === ':memory:' || target.startsWith('file::memory:')) {
    return target;
  }

  const absolute = resolve(process.cwd(), target);
  mkdirSync(dirname(absolute), { recursive: true });
  return absolute;
}