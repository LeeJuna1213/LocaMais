const database = process.env.MYSQL_TEST_DATABASE_NAME;
if (!database || !/_test$/i.test(database) || database === process.env.DATABASE_NAME) {
  throw new Error('Set MYSQL_TEST_DATABASE_NAME to a dedicated database ending in _test; it must differ from DATABASE_NAME.');
}

process.env.DATABASE_TYPE = 'mysql';
process.env.DATABASE_NAME = database;
process.env.DATABASE_HOST = process.env.MYSQL_TEST_HOST ?? process.env.DATABASE_HOST ?? 'localhost';
process.env.DATABASE_PORT = process.env.MYSQL_TEST_PORT ?? process.env.DATABASE_PORT ?? '3306';
process.env.DATABASE_USERNAME = process.env.MYSQL_TEST_USERNAME ?? process.env.DATABASE_USERNAME;
process.env.DATABASE_PASSWORD = process.env.MYSQL_TEST_PASSWORD ?? process.env.DATABASE_PASSWORD;
process.env.DATABASE_SYNCHRONIZE = 'true';
process.env.DATABASE_LOGGING = 'false';
process.env.JWT_SECRET = 'locamais-mysql-concurrency-test-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.BCRYPT_ROUNDS = '4';
process.env.ADMIN_NAME = 'Admin Concorrência';
process.env.ADMIN_EMAIL = `admin-${Date.now()}@locamais.test`;
process.env.ADMIN_PASSWORD = 'SenhaAdmin1!';
