import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from './redis.constants.js';

/**
 * Serviço de cache com Redis (Memurai).
 *
 * Oferece métodos tipados para operações de chave-valor com serialização JSON
 * automática. Destinado a dados temporários de cache, sessões e filas — nunca
 * a dados permanentes de negócio.
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * Recupera um valor pela chave. Retorna `null` quando a chave não existe.
   */
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return this.deserialize<T>(raw);
  }

  /**
   * Armazena um valor pela chave, com TTL opcional em segundos.
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = this.serialize(value);
    if (ttl !== undefined && ttl > 0) {
      await this.client.set(key, serialized, 'EX', ttl);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Remove uma chave do Redis.
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Verifica se uma chave existe no Redis.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Define o tempo de expiração (TTL) de uma chave existente, em segundos.
   */
  async expire(key: string, ttl: number): Promise<void> {
    await this.client.expire(key, ttl);
  }

  /**
   * Retorna o cliente ioredis original.
   *
   * Use apenas quando o `RedisService` não cobrir a operação desejada.
   * Evite usar `KEYS` em produção.
   */
  getClient(): Redis {
    return this.client;
  }

  private serialize(value: unknown): string {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  private deserialize<T>(raw: string): T | null {
    if (raw === 'null' || raw === 'undefined') return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }
}
