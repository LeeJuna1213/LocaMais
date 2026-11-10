import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from './redis.constants.js';

/**
 * Decorator para injetar diretamente o cliente ioredis.
 *
 * Exemplo:
 *   constructor(@InjectRedis() private readonly redis: Redis) {}
 */
export const InjectRedis = () => Inject(REDIS_CLIENT);
