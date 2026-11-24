
/**
 * DataSource utilizado exclusivamente para execucao de migrations do TypeORM.
 *
 * Reutiliza as mesmas opcoes de conexao definidas em
 * `src/config/database.config.ts` (buildTypeOrmOptions), garantindo que o
 * banco de dados, o driver, o host, a porta e as credenciais sejam exatamente
 * os mesmos usados pela aplicacao em tempo de execucao.
 *
 * Nao armazena credenciais: todos os valores sao lidos de variaveis de
 * ambiente (.env).
 *
 * O diretorio de migrations e apontado para src/database/migrations, onde
 * ficam os arquivos de versao do esquema do banco.
 */


import { DataSource } from 'typeorm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * DataSource utilizado exclusivamente para execucao de migrations do TypeORM.
 *
 * Reutiliza as configuracoes de conexao definidas por variaveis de ambiente.
 */
const isMySQL = process.env.DATABASE_TYPE === 'mysql';

const migrationPath = join(currentDirectory, 'migrations', '*.{ts,js}');

export const AppDataSource = new DataSource(
  isMySQL
    ? {
        type: 'mysql',
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: Number(process.env.DATABASE_PORT ?? 3306),
        username: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
        logging: process.env.DATABASE_LOGGING === 'true',
        migrationsTransactionMode: 'each',
        migrations: [migrationPath],
      }
    : {
        type: 'better-sqlite3',
        database: process.env.DATABASE_FILE ?? './data/locadora.sqlite',
        synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
        logging: process.env.DATABASE_LOGGING === 'true',
        migrationsTransactionMode: 'each',
        migrations: [migrationPath],
      },
) as DataSource;
