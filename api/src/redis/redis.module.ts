import {
  DynamicModule,
  Global,
  Inject,
  Logger,
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
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    this.setupEventListeners();
  }

  /**
   * Registra o cliente Redis como provider, utilizando as configurações
   * centralizadas em `buildRedisOptions`.
   *
   * O ioredis inicia a conexão automaticamente ao ser instanciado
   * (`lazyConnect: false`, padrão). Não é necessário chamar `connect()`
   * manualmente — fazer isso causaria o erro
   * `"Redis is already connecting/connected"`.
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

  /**
   * Configura listeners de eventos do ioredis para observabilidade.
   *
   * Nenhum dado sensível (senha, token, chave de dados) é registrado nos logs.
   */
  private setupEventListeners(): void {
    this.client.on('connect', () => {
      this.logger.log('Conexão Redis estabelecida.');
    });

    this.client.on('ready', () => {
      this.logger.log('Cliente Redis pronto para operações.');
    });

    this.client.on('error', (err: unknown) => {
      this.logger.error(
        `Erro no cliente Redis: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    this.client.on('reconnecting', () => {
      this.logger.warn('Reconectando ao Redis...');
    });

    this.client.on('close', () => {
      this.logger.warn('Conexão Redis encerrada.');
    });

    this.client.on('end', () => {
      this.logger.log('Conexão Redis finalizada (end).');
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log('Conexão Redis encerrada com QUIT.');
    } catch (error) {
      this.logger.error(
        `Falha ao encerrar conexão Redis: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}
