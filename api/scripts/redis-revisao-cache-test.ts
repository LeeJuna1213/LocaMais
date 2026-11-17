import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import { RedisModule } from '../src/redis/redis.module.js';
import { RedisService } from '../src/redis/redis.service.js';
import { RevisaoService } from '../src/revisao/revisao.service.js';
import { CarroService } from '../src/carro/carro.service.js';
import { StatusRevisao } from '../src/revisao/enums/status-revisao.enum.js';
import { StatusVeiculo } from '../src/carro/enums/status-veiculo.enum.js';

/**
 * Validação temporária da integração do cache de status de revisão com o
 * Memurai real, incluindo as invalidações cruzadas a partir do módulo carro.
 *
 * Usa o RedisModule/RedisService reais e simula Repositorys para isolar o
 * banco de dados.
 */
async function main() {
  let module: TestingModule | null = null;
  const carroId = 424242;
  const cacheKey = `locamais:revisao:carro:${carroId}`;

  try {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ envFilePath: ['.env'], isGlobal: true }),
        RedisModule.forRoot(),
      ],
    }).compile();

    const redis = module.get<RedisService>(RedisService);
    const client = redis.getClient();

    const pong: string = await client.ping();
    if (pong !== 'PONG') throw new Error(`PING retornou "${pong}"`);
    console.log('✓ PING: Memurai respondeu com PONG');

    // =======================================================================
    // 1. RevisaoService: MISS grava no Redis com TTL 300
    // =======================================================================
    const carro = { id: carroId, placa: 'TST-4242', quilometragem: 17000 };
    const ultimaRevisao = { id: 'rev-teste', km: 10000, carro_id: carroId };

    let carroFindOneCalls = 0;
    const revisoesRepository = {
      findOne: async () => ultimaRevisao,
      find: async () => [],
      update: async () => undefined,
      remove: async () => undefined,
    };
    const carroService = {
      findOne: async () => {
        carroFindOneCalls += 1;
        return carro;
      },
      findAll: async () => [carro],
    };

    const service = new RevisaoService(
      revisoesRepository as any,
      {} as any,
      carroService as any,
      redis,
      { invalidateRevisionDependents: async () => undefined } as any,
    );

    const primeiro = await service.verificarRevisaoPeriodica(carroId);
    if (primeiro.situacao !== StatusRevisao.EM_DIA) {
      throw new Error(`situacao inesperada: ${primeiro.situacao}`);
    }

    const existe = await client.exists(cacheKey);
    if (!existe) throw new Error(`chave "${cacheKey}" nao foi criada`);
    console.log(`✓ MISS: chave "${cacheKey}" criada com o status calculado`);

    // 2. TTL exato configurado pelo service (300s)
    const ttl = await client.ttl(cacheKey);
    if (ttl !== 300) throw new Error(`TTL esperado 300, obtido ${ttl}`);
    console.log('✓ TTL: chave criada com expiracao de 300 segundos');

    // 3. HIT: nao consulta o MySQL novamente
    const chamadasAntes = carroFindOneCalls;
    const segundo = await service.verificarRevisaoPeriodica(carroId);
    if (carroFindOneCalls !== chamadasAntes) {
      throw new Error('HIT consultou o CarroService (MySQL) indevidamente');
    }
    if (JSON.stringify(segundo) !== JSON.stringify(primeiro)) {
      throw new Error('HIT retornou dados diferentes do valor cacheado');
    }
    console.log('✓ HIT: retornou do Redis sem consultar o MySQL');

    // 4. Invalidadacao apos remocao de revisao (revisao remove)
    await service.remove('rev-teste');
    const existeAposRemocao = await client.exists(cacheKey);
    if (existeAposRemocao) {
      throw new Error('chave de status nao foi invalidada apos remove()');
    }
    console.log('✓ INVALIDACAO: chave removida apos exclusao da revisao');

    // =======================================================================
    // 5. CarroService: alteracao de placa invalida cache de revisao (cruzada)
    // =======================================================================
    const carroId2 = 777;
    const key2 = `locamais:revisao:carro:${carroId2}`;
    const carro2 = {
      id: carroId2,
      placa: 'VEL-0001',
      status: StatusVeiculo.DISPONIVEL,
      quilometragem: 10000,
    };

    const carrosRepository2 = {
      findOne: async () => carro2,
      exists: async () => false,
      update: async () => undefined,
      delete: async () => undefined,
    };
    const reservasRepository2 = {
      exists: async () => false,
    };
    const carroService2 = new CarroService(
      carrosRepository2 as any,
      reservasRepository2 as any,
      redis,
      { invalidateCarDependents: async () => undefined } as any,
      {} as any,
    );

    // 5a. Placa alterada -> invalida
    await redis.set(key2, { antigo: true }, 300);
    if (!(await client.exists(key2))) {
      throw new Error(`chave "${key2}" nao estava definida`);
    }
    await carroService2.update(carroId2, { placa: 'NOV-0002' });
    if (await client.exists(key2)) {
      throw new Error('alteracao de placa nao invalidou a chave de revisao');
    }
    console.log(
      `✓ CRUZADA (PLACA): PATCH /carros/${carroId2} invalidou "${key2}"`,
    );

    // 5b. Atualizacao sem mudanca de placa -> NAO invalida
    await redis.set(key2, { atual: true }, 300);
    await carroService2.update(carroId2, { modelo: 'SUV' });
    if (!(await client.exists(key2))) {
      throw new Error(
        'atualizacao sem mudanca de placa invalidou a chave indevidamente',
      );
    }
    console.log(
      `✓ CRUZADA (PLACA): PATCH /carros/${carroId2} sem mudanca de placa nao invalidou`,
    );

    // 5c. Remocao do carro -> invalida
    await carroService2.remove(carroId2);
    if (await client.exists(key2)) {
      throw new Error('exclusao de carro nao invalidou a chave de revisao');
    }
    console.log(
      `✓ CRUZADA (REMOCAO): DELETE /carros/${carroId2} invalidou "${key2}"`,
    );

    // 5d. Falha de exclusao no MySQL -> NAO invalida
    await redis.set(key2, { devePermanecer: true }, 300);
    carrosRepository2.delete = async () => {
      throw new Error('db error');
    };
    try {
      await carroService2.remove(carroId2);
      throw new Error('remove deveria ter falhado');
    } catch {
      // esperado
    }
    if (!(await client.exists(key2))) {
      throw new Error('falha de exclusao invalidou a chave indevidamente');
    }
    console.log('✓ CRUZADA: falha de exclusao nao invalidou a chave');

    console.log('\n✅ Validacao do cache de revisao com Memurai real passou.');
  } catch (error) {
    console.error('\n❌ Falha na validacao do cache de revisao:');
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  } finally {
    if (module) {
      try {
        const client = module
          .get<RedisService>(RedisService)
          .getClient();
        await client.del(cacheKey, `locamais:revisao:carro:777`);
        console.log('🧹 Limpeza: chaves de teste removidas.');
      } catch (error) {
        console.error(
          '⚠️  Aviso: falha na limpeza:',
          error instanceof Error ? error.message : String(error),
        );
      }
      await module.close();
      console.log('🔌 Contexto NestJS encerrado e conexao Redis fechada.');
    }
  }
}

void main();
