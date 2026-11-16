import mysql, { RowDataPacket } from 'mysql2/promise';

const expectedDatabase = 'locamais_cache_integration';
const databaseName = process.env.DATABASE_NAME;
const redisPort = Number(process.env.REDIS_PORT);
const databaseHost = process.env.DATABASE_HOST ?? 'localhost';

if (process.env.REDIS_INTEGRATION_TEST !== '1') {
  throw new Error('Defina REDIS_INTEGRATION_TEST=1 para executar a suíte.');
}

if (process.env.DATABASE_TYPE !== 'mysql' || databaseName !== expectedDatabase) {
  throw new Error(
    `A suíte exige DATABASE_TYPE=mysql e DATABASE_NAME=${expectedDatabase}; nenhum schema externo será limpo.`,
  );
}

if (process.env.DATABASE_SYNCHRONIZE !== 'true') {
  throw new Error(
    'Use DATABASE_SYNCHRONIZE=true somente no banco exclusivo de integração.',
  );
}

if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
  throw new Error('A suíte só aceita MySQL local para impedir escrita remota acidental.');
}

if (!Number.isInteger(redisPort) || redisPort < 1024 || redisPort === 6379) {
  throw new Error(
    'Defina REDIS_PORT para uma instância Memurai isolada em porta dedicada (não use 6379).',
  );
}

process.env.DATABASE_LOGGING = 'true';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'redis-integration-test-secret-only';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? '4';
process.env.ADMIN_NAME = process.env.ADMIN_NAME ?? 'Redis Integration Admin';
process.env.ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ?? 'redis-integration-admin@locamais.test';
process.env.ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ?? 'RedisIntegrationAdmin1!';

const connection = await mysql.createConnection({
  host: databaseHost,
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: expectedDatabase,
});
try {
  const [tables] = await connection.query<(RowDataPacket & { TABLE_NAME: string })[]>(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? LIMIT 1',
    [expectedDatabase],
  );
  for (const { TABLE_NAME } of tables) {
    const [rows] = await connection.query<(RowDataPacket & { rowCount: number })[]>(
      `SELECT COUNT(*) AS rowCount FROM ${mysql.escapeId(TABLE_NAME)}`,
    );
    if (Number(rows[0]?.rowCount ?? 0) > 0) {
      throw new Error(
        `A tabela ${TABLE_NAME} em ${expectedDatabase} contém dados; nenhum dado foi alterado.`,
      );
    }
  }
} finally {
  await connection.end();
}
