/**
 * Token de injeção dedicado para o cliente Redis (ioredis).
 *
 * Declarado em um arquivo independente para evitar dependência circular
 * entre `RedisModule` e `RedisService` (e `@InjectRedis()`) em ESM.
 *
 * Evita conflitos com outros providers e permite injeção direta via
 * `@Inject(REDIS_CLIENT)` ou pelo decorator `@InjectRedis()`.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
