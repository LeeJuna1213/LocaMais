import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import { buildRedisOptions } from '../config/redis.config.js';
import { REDIS_CLIENT } from './redis.constants.js';
import { RedisService } from './redis.service.js';

/**
 * Módulo Redis global e reutilizável.
 *
 * Cria uma única instância do cliente ioredis via `forRoot()` e a disponibiliza
 * para toda a aplicação. Implementa `OnModuleDestroy` para encerrar a conexão
 * com `QUIT` quando a aplicação for desligada, evitando conexões órfãs.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * Registra o cliente Redis como provider, utilizando as configurações
   * centralizadas em `buildRedisOptions`.
   */
  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS_CLIENT,
          useFactory: (config: ConfigService): Redis => {
            const options = buildRedisOptions(config);
            const client = new Redis(options);
            return client;
          },
          inject: [ConfigService],
        },
      ],
      exports: [REDIS_CLIENT],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
