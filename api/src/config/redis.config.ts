import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * Constrói as opções de conexão do ioredis a partir das variáveis de ambiente.
 *
 * A senha nunca é logada: quando ausente, é definida como `undefined` para que
 * o ioredis não envie credenciais.
 */
export function buildRedisOptions(config: ConfigService): RedisOptions {
  const host = config.get<string>('REDIS_HOST') ?? '127.0.0.1';
  const port = Number(config.get<string>('REDIS_PORT') ?? 6379);
  const password = config.get<string>('REDIS_PASSWORD') || undefined;

  return {
    host,
    port,
    password,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10000,
    retryStrategy: (times: number) => Math.min(times * 100, 3000),
  };
}
