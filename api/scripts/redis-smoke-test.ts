import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { RedisModule } from '../src/redis/redis.module.js';
import { RedisService } from '../src/redis/redis.service.js';

/**
 * Smoke test de integração com o Memurai (Redis).
 *
 * Utiliza o `RedisModule` real e o `RedisService` por injeção de dependência
 * do NestJS. Valida as operações SET, GET, JSON, EXISTS, TTL e DEL contra o
 * Memurai rodando em `127.0.0.1:6379`.
 *
 * Não altera entidades, controllers ou serviços de negócio existentes.
 */
async function main() {
  let module: TestingModule | null = null;
  const testKeys: string[] = [];

  const registerKey = (key: string) => testKeys.push(key);

  try {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: ['.env'],
          isGlobal: true,
        }),
        RedisModule.forRoot(),
      ],
    }).compile();

    const redis = module.get<RedisService>(RedisService);
    const client = redis.getClient();

    // -------------------------------------------------------
    // 1. PING — confirma que o Memurai responde
    // -------------------------------------------------------
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error(`PING retornou "${pong}", esperado "PONG"`);
    }
    console.log('✓ PING: Memurai respondeu com PONG');

    const prefix = 'locamais:smoke-test';

    // -------------------------------------------------------
    // 2. SET — armazena uma chave com valor string
    // -------------------------------------------------------
    const stringKey = `${prefix}:string`;
    registerKey(stringKey);
    await redis.set(stringKey, 'valor-teste-string');
    console.log(`✓ SET: chave "${stringKey}" armazenada`);

    // -------------------------------------------------------
    // 3. GET — recupera o valor string e compara
    // -------------------------------------------------------
    const recuperado = await redis.get<string>(stringKey);
    if (recuperado !== 'valor-teste-string') {
      throw new Error(
        `GET retornou "${recuperado}", esperado "valor-teste-string"`,
      );
    }
    console.log(`✓ GET: valor recuperado corretamente ("${recuperado}")`);

    // -------------------------------------------------------
    // 4. SET/GET com objeto JSON — serialização/desserialização
    // -------------------------------------------------------
    const jsonKey = `${prefix}:json`;
    registerKey(jsonKey);
    const objeto = { id: 42, nome: 'LocaMais Smoke', ativo: true };
    await redis.set(jsonKey, objeto);
    console.log(`✓ SET: objeto JSON armazenado em "${jsonKey}"`);

    const recuperadoJson = await redis.get<{
      id: number;
      nome: string;
      ativo: boolean;
    }>(jsonKey);
    if (
      !recuperadoJson ||
      recuperadoJson.id !== 42 ||
      recuperadoJson.nome !== 'LocaMais Smoke' ||
      recuperadoJson.ativo !== true
    ) {
      throw new Error(
        `GET JSON retornou valor inesperado: ${JSON.stringify(recuperadoJson)}`,
      );
    }
    console.log(
      `✓ GET JSON: objeto desserializado corretamente (${JSON.stringify(recuperadoJson)})`,
    );

    // -------------------------------------------------------
    // 5. EXISTS — confirma que a chave existe
    // -------------------------------------------------------
    const existeString = await redis.exists(stringKey);
    const existeJson = await redis.exists(jsonKey);
    if (!existeString || !existeJson) {
      throw new Error(
        `EXISTS falhou: string=${existeString}, json=${existeJson}`,
      );
    }
    console.log(`✓ EXISTS: ambas as chaves existem`);

    // -------------------------------------------------------
    // 6. TTL — armazena chave com expiração de 2 segundos
    // -------------------------------------------------------
    const ttlKey = `${prefix}:ttl`;
    registerKey(ttlKey);
    await redis.set(ttlKey, 'expira-em-2s', 2);
    console.log(`✓ SET com TTL: chave "${ttlKey}" armazena com expiração de 2s`);

    const existeAntes = await redis.exists(ttlKey);
    if (!existeAntes) {
      throw new Error('EXISTS falhou: chave com TTL não existe imediatamente após o SET');
    }
    console.log(`✓ EXISTS (antes da expiração): chave "${ttlKey}" ainda existe`);

    // Aguarda 3 segundos para garantir a expiração
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const existeDepois = await redis.exists(ttlKey);
    if (existeDepois) {
      throw new Error(
        `EXISTS após expiração: chave "${ttlKey}" ainda existe (esperava false)`,
      );
    }
    console.log(`✓ EXISTS (após expiração): chave "${ttlKey}" expirou corretamente`);

    // -------------------------------------------------------
    // 7. DEL — remove uma chave e confirma ausência
    // -------------------------------------------------------
    await redis.del(stringKey);
    const existeStringAposDel = await redis.exists(stringKey);
    if (existeStringAposDel) {
      throw new Error(
        `DEL falhou: chave "${stringKey}" ainda existe após remoção`,
      );
    }
    console.log(`✓ DEL: chave "${stringKey}" removida com sucesso`);

    console.log('\n✅ Todos os testes de integração Redis passaram.');
  } catch (error) {
    console.error('\n❌ Falha na validação de integração Redis:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    // Remove todas as chaves de teste, inclusive em caso de falha
    if (module) {
      try {
        const redis = module.get<RedisService>(RedisService);
        if (testKeys.length > 0) {
          await redis.getClient().del(...testKeys);
          console.log(`🧹 Limpeza: ${testKeys.length} chave(s) de teste removida(s).`);
        }
      } catch (cleanupError) {
        console.error(
          '⚠️  Aviso: falha na limpeza das chaves de teste:',
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        );
      }

      try {
        await module.close();
        console.log('🔌 Contexto NestJS encerrado e conexão Redis fechada.');
      } catch (closeError) {
        console.error(
          '⚠️  Aviso: falha ao encerrar o contexto NestJS:',
          closeError instanceof Error ? closeError.message : String(closeError),
        );
      }
    }
  }
}

main();
