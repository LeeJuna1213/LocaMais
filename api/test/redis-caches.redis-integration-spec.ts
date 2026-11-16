import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { createTestingApp, get, login, makeCpf, patch, post, ENDERECO } from './helpers.js';
import { REDIS_CLIENT } from '../src/redis/redis.constants.js';
import { RedisService } from '../src/redis/redis.service.js';
import { Revisao } from '../src/revisao/entities/revisao.entity.js';

type JsonObject = Record<string, any>;
type CacheCase = {
  key: string;
  path: string;
  ttl: number;
  tables: string[];
  check?: (body: JsonObject) => void;
};

const ttlByResource = {
  usuario: 300,
  cliente: 300,
  endereco: 600,
  revisao: 300,
  vistoria: 600,
  carro: 60,
  reserva: 120,
} as const;

describe('integração HTTP dos caches Redis (MySQL + Memurai reais)', () => {
  let app: INestApplication;
  let token: string;
  let authUserId: number;
  let redis: Redis;
  let redisService: RedisService;
  let dataSource: DataSource;
  let ids: {
    user: number; client: number; address: number; car: number;
    reservation: string; rental: string; inspection: string;
    otherReservation: string; cancelReservation: string; cancelRental: string; cancelInspection: string;
  };
  const created: {
    user?: number; client?: number; address?: number; car?: number;
    reservations: string[]; rentals: string[]; inspections: string[]; revisions: string[];
  } = { reservations: [], rentals: [], inspections: [], revisions: [] };
  const runTag = `redis-it-${Date.now()}`;
  const ownedKeys = new Set<string>();

  beforeAll(async () => {
    app = await createTestingApp();
    dataSource = app.get(DataSource);
    redis = app.get<Redis>(REDIS_CLIENT);
    redisService = app.get(RedisService);
    token = await login(app, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
    const jwtPayload = await app.get(JwtService).verifyAsync<{ sub: number }>(token);
    authUserId = jwtPayload.sub;

    const clientResponse = await post<JsonObject>(app, '/clientes', {
      name: `Cliente ${runTag}`,
      email: `${runTag}@locamais.test`,
      password: 'ClienteIntegration1!',
      cliente: {
        tipo_pessoa: 'PF',
        cpf: makeCpf(String(Date.now()).slice(-9).padStart(9, '1')),
        data_nascimento: '1990-01-01',
        endereco: { ...ENDERECO, logradouro: `Rua ${runTag}` },
      },
    }, token);
    expect(clientResponse.status).toBe(201);
    const client = clientResponse.body;
    const user = client.user as JsonObject;
    const address = client.address as JsonObject;
    created.user = user.id;
    created.client = client.id;
    created.address = address.id;

    const carResponse = await post<JsonObject>(app, '/carros', {
      placa: `IT${String(Date.now()).slice(-6)}`,
      modelo: 'Integration', marca: 'LocaMais', categoria: 'Hatch',
      ano: 2024, valorDiaria: 150,
    }, token);
    expect(carResponse.status).toBe(201);
    const car = carResponse.body;
    created.car = car.id;

    const pickup = new Date(Date.now() + 5 * 86400000).toISOString();
    const returnDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const reservationResponse = await post<JsonObject>(app, '/reservas', {
      dataRetirada: pickup, dataDevolucao: returnDate,
      client_id: client.id, car_id: car.id,
    }, token);
    expect(reservationResponse.status).toBe(201);
    const reservation = reservationResponse.body;
    created.reservations.push(reservation.id);
    const confirmed = await patch<JsonObject>(app, `/reservas/${reservation.id}`, {
      status: 'confirmada',
    }, token);
    expect(confirmed.status).toBe(200);

    const rentalResponse = await post<JsonObject>(app, '/locacoes', {
      reservation_id: reservation.id,
    }, token);
    expect(rentalResponse.status).toBe(201);
    const rental = rentalResponse.body;
    created.rentals.push(rental.id);
    const inspectionResponse = await post<JsonObject>(app, '/vistorias', {
      locacaoId: rental.id, tipo: 'retirada', observacoes: `Inicial ${runTag}`, fotos: '[]',
    }, token);
    expect(inspectionResponse.status).toBe(201);
    created.inspections.push(inspectionResponse.body.id);

    const createScheduledRental = async (startDay: number, endDay: number) => {
      const scheduled = await post<JsonObject>(app, '/reservas', {
        dataRetirada: new Date(Date.now() + startDay * 86400000).toISOString(),
        dataDevolucao: new Date(Date.now() + endDay * 86400000).toISOString(),
        client_id: client.id,
        car_id: car.id,
      }, token);
      expect(scheduled.status).toBe(201);
      created.reservations.push(scheduled.body.id);
      return scheduled.body;
    };

    const otherReservation = await createScheduledRental(8, 9);
    const cancellationReservation = await createScheduledRental(10, 11);
    expect((await patch(app, `/reservas/${cancellationReservation.id}`, { status: 'confirmada' }, token)).status).toBe(200);
    const cancellationRentalResponse = await post<JsonObject>(app, '/locacoes', {
      reservation_id: cancellationReservation.id,
    }, token);
    expect(cancellationRentalResponse.status).toBe(201);
    created.rentals.push(cancellationRentalResponse.body.id);
    const cancellationInspectionResponse = await post<JsonObject>(app, '/vistorias', {
      locacaoId: cancellationRentalResponse.body.id,
      tipo: 'retirada',
      observacoes: `Cancelamento ${runTag}`,
      fotos: '[]',
    }, token);
    expect(cancellationInspectionResponse.status).toBe(201);
    created.inspections.push(cancellationInspectionResponse.body.id);

    ids = {
      user: user.id, client: client.id, address: address.id, car: car.id,
      reservation: reservation.id, rental: rental.id,
      inspection: inspectionResponse.body.id,
      otherReservation: otherReservation.id,
      cancelReservation: cancellationReservation.id,
      cancelRental: cancellationRentalResponse.body.id,
      cancelInspection: cancellationInspectionResponse.body.id,
    };
  }, 60000);

  afterAll(async () => {
    if (!app) return;
    for (const key of ownedKeys) {
      let cursor = '0';
      do {
        const [next, found] = await redis.scan(cursor, 'MATCH', key, 'COUNT', 100);
        cursor = next;
        if (found.includes(key)) await redis.del(key);
      } while (cursor !== '0');
    }
    for (const id of created.inspections) await dataSource.query('DELETE FROM vistorias WHERE id = ?', [id]);
    for (const id of created.rentals) await dataSource.query('DELETE FROM locacoes WHERE id = ?', [id]);
    for (const id of created.reservations) await dataSource.query('DELETE FROM reservas WHERE id = ?', [id]);
    for (const id of created.revisions) await dataSource.query('DELETE FROM revisoes WHERE id = ?', [id]);
    if (created.address) await dataSource.query('DELETE FROM enderecos WHERE id = ?', [created.address]);
    if (created.client) await dataSource.query('DELETE FROM clientes WHERE id = ?', [created.client]);
    if (created.user) await dataSource.query('DELETE FROM usuarios WHERE id = ?', [created.user]);
    if (created.car) await dataSource.query('DELETE FROM carros WHERE id = ?', [created.car]);
    await dataSource.query('DELETE FROM usuarios WHERE email = ?', [process.env.ADMIN_EMAIL]);
    await app.close();
  });

  async function verifyCache<T extends JsonObject>(
    key: string,
    ttl: number,
    requestPath: string,
    readTables: string[],
    tokenValue = token,
  ): Promise<T> {
    ownedKeys.add(key);
    await redis.del(key);
    const originalLogQuery = dataSource.logger.logQuery.bind(dataSource.logger);
    const originalGet = redisService.get.bind(redisService);
    const originalSet = redisService.set.bind(redisService);
    const queries: Array<{ sql: string; parameters?: unknown[]; tables: string[]; authentication: boolean }> = [];
    const cacheReads: Array<{ key: string; value: unknown }> = [];
    const cacheWrites: Array<{ key: string; ttl?: number }> = [];
    const tablesInQuery = (sql: string): string[] =>
      [...sql.matchAll(/\b(?:FROM|JOIN)\s+[`"]?([\w]+)/gi)].map((match) => match[1].toLowerCase());

    dataSource.logger.logQuery = (sql: string, parameters?: unknown[]) => {
      const tables = tablesInQuery(sql);
      const authentication = tables.includes('usuarios') &&
        JSON.stringify(parameters ?? []).includes(String(authUserId));
      queries.push({ sql, parameters, tables, authentication });
      originalLogQuery(sql, parameters);
    };
    redisService.get = async <V>(requestedKey: string): Promise<V | null> => {
      const value = await originalGet<V>(requestedKey);
      if (requestedKey === key) cacheReads.push({ key: requestedKey, value });
      return value;
    };
    redisService.set = async (writtenKey: string, value: unknown, expiration?: number): Promise<void> => {
      if (writtenKey === key) cacheWrites.push({ key: writtenKey, ttl: expiration });
      await originalSet(writtenKey, value, expiration);
    };

    const diagnostic = (stage: string) => JSON.stringify({
      endpoint: requestPath,
      stage,
      redisReads: cacheReads.map(({ key: readKey, value }) => ({ key: readKey, hit: value !== null })),
      redisWrites: cacheWrites,
      sql: queries.map(({ sql, parameters, tables, authentication }) => ({ sql, parameters, tables, authentication })),
    }, null, 2);
    try {
      const miss = await get<T>(app, requestPath, tokenValue);
      expect(miss.status).toBe(200);
      expect(cacheReads.some((read) => read.key === key && read.value === null), diagnostic('MISS deve ler a chave e receber null')).toBe(true);
      expect(await redis.exists(key)).toBe(1);
      expect(cacheWrites.some((write) => write.key === key && write.ttl === ttl), diagnostic('MISS deve gravar a chave com TTL esperado')).toBe(true);
      const raw = await redis.get(key);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw!) as T;
      expect(stored).toMatchObject(miss.body);
      const remaining = await redis.ttl(key);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(ttl);

      const missResourceQueries = queries.filter((query) =>
        !query.authentication && query.tables.some((table) => readTables.includes(table)),
      );
      cacheReads.length = 0;
      cacheWrites.length = 0;
      queries.length = 0;
      const hit = await get<T>(app, requestPath, tokenValue);
      expect(hit.status).toBe(200);
      expect(hit.body).toEqual(miss.body);
      expect(cacheReads.some((read) => read.key === key && read.value !== null), diagnostic('HIT deve retornar valor da chave Redis')).toBe(true);
      expect(queries.filter((query) => !query.authentication && query.tables.some((table) => readTables.includes(table))), diagnostic('SQL não-autenticação no HIT'))
        .toHaveLength(0);
      expect(missResourceQueries.length, diagnostic('MISS deve consultar tabelas do recurso')).toBeGreaterThan(0);

      await redis.del(key);
      cacheReads.length = 0;
      cacheWrites.length = 0;
      queries.length = 0;
      const rebuilt = await get<T>(app, requestPath, tokenValue);
      expect(rebuilt.status).toBe(200);
      expect(cacheReads.some((read) => read.key === key && read.value === null), diagnostic('Reconstrução deve iniciar em MISS')).toBe(true);
      expect(queries.some((query) => !query.authentication && query.tables.some((table) => readTables.includes(table))), diagnostic('MISS de reconstrução deve consultar o recurso')).toBe(true);
      expect(await redis.exists(key)).toBe(1);
      expect(cacheWrites.some((write) => write.key === key && write.ttl === ttl), diagnostic('Reconstrução deve restaurar SET com TTL')).toBe(true);
      return rebuilt.body;
    } finally {
      dataSource.logger.logQuery = originalLogQuery;
      redisService.get = originalGet;
      redisService.set = originalSet;
    }
  }

  it('exige autenticação e mantém autorização real antes de servir caches protegidos', async () => {
    expect((await get(app, `/usuarios/${ids.user}`)).status).toBe(401);
    const clienteLogin = await login(app, `${runTag}@locamais.test`, 'ClienteIntegration1!');
    expect((await get(app, `/usuarios/${ids.user}`, clienteLogin)).status).toBe(200);
    expect((await get(app, `/usuarios/${ids.user}`, token)).status).toBe(200);
  });

  it('valida as sete chaves, JSON, TTL, HIT instrumentado e reconstrução após MISS', async () => {
    await verifyCache(`locamais:usuario:${ids.user}`, ttlByResource.usuario, `/usuarios/${ids.user}`, ['usuarios', 'clientes', 'enderecos']);
    await verifyCache(`locamais:cliente:${ids.client}`, ttlByResource.cliente, `/clientes/${ids.client}`, ['clientes', 'usuarios', 'enderecos']);
    await verifyCache(`locamais:endereco:${ids.address}`, ttlByResource.endereco, `/enderecos/${ids.address}`, ['enderecos', 'clientes', 'usuarios']);
    await verifyCache(`locamais:revisao:carro:${ids.car}`, ttlByResource.revisao, `/revisoes/carro/${ids.car}/status`, ['carros', 'revisoes']);
    await verifyCache(`locamais:vistoria:${ids.inspection}`, ttlByResource.vistoria, `/vistorias/${ids.inspection}`, ['vistorias', 'locacoes', 'reservas', 'clientes']);
    await verifyCache(`locamais:carro:${ids.car}`, ttlByResource.carro, `/carros/${ids.car}`, ['carros']);
    await verifyCache(`locamais:reserva:${ids.reservation}`, ttlByResource.reserva, `/reservas/${ids.reservation}`, ['reservas', 'clientes', 'carros']);
  });

  it('invalida e reconstrói cada cache afetado após PATCH HTTP de usuário', async () => {
    const own = { key: `locamais:usuario:${ids.user}`, path: `/usuarios/${ids.user}`, ttl: 300, tables: ['usuarios', 'clientes', 'enderecos'], check: (body: JsonObject) => expect(body.name).toBe(`Atualizado ${runTag}`) };
    const dependent = { key: `locamais:cliente:${ids.client}`, path: `/clientes/${ids.client}`, ttl: 300, tables: ['clientes', 'usuarios', 'enderecos'], check: (body: JsonObject) => expect(body.user.name).toBe(`Atualizado ${runTag}`) };
    await runPatchScenario([own, dependent], () => patch(app, `/usuarios/${ids.user}`, { name: `Atualizado ${runTag}` }, token));
  });

  it('invalida cliente, usuário, reserva e vistoria após PATCH HTTP de cliente', async () => {
    const own = { key: `locamais:cliente:${ids.client}`, path: `/clientes/${ids.client}`, ttl: 300, tables: ['clientes', 'usuarios', 'enderecos'], check: (body: JsonObject) => expect(body.cpf).toBe(makeCpf('987654321')) };
    const dependents = [
      { key: `locamais:usuario:${ids.user}`, path: `/usuarios/${ids.user}`, ttl: 300, tables: ['usuarios', 'clientes', 'enderecos'], check: (body: JsonObject) => expect(body.client.cpf).toBe(makeCpf('987654321')) },
      { key: `locamais:reserva:${ids.reservation}`, path: `/reservas/${ids.reservation}`, ttl: 120, tables: ['reservas', 'clientes', 'carros'], check: (body: JsonObject) => expect(body.client.cpf).toBe(makeCpf('987654321')) },
      { key: `locamais:vistoria:${ids.inspection}`, path: `/vistorias/${ids.inspection}`, ttl: 600, tables: ['vistorias', 'locacoes', 'reservas', 'clientes'], check: (body: JsonObject) => expect(body.locacao.reservation.client.cpf).toBe(makeCpf('987654321')) },
    ];
    await runPatchScenario([own, ...dependents], () => patch(app, `/clientes/${ids.client}`, { cpf: makeCpf('987654321') }, token));
  });

  it('invalida endereço, cliente e usuário após PATCH HTTP de endereço', async () => {
    const own = { key: `locamais:endereco:${ids.address}`, path: `/enderecos/${ids.address}`, ttl: 600, tables: ['enderecos', 'clientes', 'usuarios'], check: (body: JsonObject) => expect(body.bairro).toBe(`Bairro ${runTag}`) };
    const dependents = [
      { key: `locamais:cliente:${ids.client}`, path: `/clientes/${ids.client}`, ttl: 300, tables: ['clientes', 'usuarios', 'enderecos'], check: (body: JsonObject) => expect(body.address.bairro).toBe(`Bairro ${runTag}`) },
      { key: `locamais:usuario:${ids.user}`, path: `/usuarios/${ids.user}`, ttl: 300, tables: ['usuarios', 'clientes', 'enderecos'], check: (body: JsonObject) => expect(body.client.address.bairro).toBe(`Bairro ${runTag}`) },
    ];
    await runPatchScenario([own, ...dependents], () => patch(app, `/enderecos/${ids.address}`, { bairro: `Bairro ${runTag}` }, token));
  });

  it('invalida carro e reservas associadas após PATCH HTTP de carro', async () => {
    const own = { key: `locamais:carro:${ids.car}`, path: `/carros/${ids.car}`, ttl: 60, tables: ['carros'], check: (body: JsonObject) => expect(body.modelo).toBe(`Modelo ${runTag}`) };
    const dependent = { key: `locamais:reserva:${ids.reservation}`, path: `/reservas/${ids.reservation}`, ttl: 120, tables: ['reservas', 'clientes', 'carros'], check: (body: JsonObject) => expect(body.car.modelo).toBe(`Modelo ${runTag}`) };
    await runPatchScenario([own, dependent], () => patch(app, `/carros/${ids.car}`, { modelo: `Modelo ${runTag}` }, token));
  });

  it('ao criar revisão invalida status, carro e todas as reservas do veículo', async () => {
    const statusCache: CacheCase = {
      key: `locamais:revisao:carro:${ids.car}`,
      path: `/revisoes/carro/${ids.car}/status`, ttl: 300,
      tables: ['carros', 'revisoes'],
    };
    const affected: CacheCase[] = [
      { key: `locamais:carro:${ids.car}`, path: `/carros/${ids.car}`, ttl: 60, tables: ['carros'] },
      ...reservationCases(),
      statusCache,
    ];
    for (const cache of affected) await verifyCache(cache.key, cache.ttl, cache.path, cache.tables);
    expect(await redis.exists(`locamais:carro:${ids.car}`)).toBe(1);

    const response = await post<JsonObject>(app, '/revisoes', {
      data: new Date().toISOString(),
      descricao: `Revisão de integração ${runTag}`,
      km: 24500,
      valor: 450,
      carroId: ids.car,
    }, token);
    expect(response.status).toBe(201);
    const revisionId = response.body.id as string;
    created.revisions.push(revisionId);

    const [storedReview] = await dataSource.query(
      'SELECT km, carro_id FROM revisoes WHERE id = ?',
      [revisionId],
    );
    const [storedCar] = await dataSource.query(
      'SELECT quilometragem FROM carros WHERE id = ?',
      [ids.car],
    );
    expect(Number(storedReview.km)).toBe(24500);
    expect(Number(storedCar.quilometragem)).toBe(24500);
    for (const cache of affected) expect(await redis.exists(cache.key)).toBe(0);

    for (const cache of affected) {
      const body = await verifyCache<JsonObject>(cache.key, cache.ttl, cache.path, cache.tables);
      cache.check?.(body);
    }
    const carBody = await get<JsonObject>(app, `/carros/${ids.car}`, token);
    expect(carBody.body.quilometragem).toBe(24500);
    for (const reservation of [ids.reservation, ids.otherReservation, ids.cancelReservation]) {
      const body = await get<JsonObject>(app, `/reservas/${reservation}`, token);
      expect(body.body.car.quilometragem).toBe(24500);
    }
    const reviewStatus = await get<JsonObject>(app, statusCache.path, token);
    expect(reviewStatus.body.ultimaRevisaoKm).toBe(24500);
    expect(reviewStatus.body.quilometragemAtual).toBe(24500);
  });

  it('ao atualizar descrição de revisão invalida somente o status de revisão', async () => {
    const reviewRepository = dataSource.getRepository(Revisao);
    const review = reviewRepository.create({
      data: new Date(),
      descricao: `Revisão para PATCH ${runTag}`,
      km: 24500,
      valor: 450,
      carro_id: ids.car,
    });
    const persistedReview = await reviewRepository.save(review);
    const revisionId = persistedReview.id;
    created.revisions.push(revisionId);
    expect(revisionId).toBeTruthy();
    const [existingReview] = await dataSource.query(
      'SELECT id FROM revisoes WHERE id = ?',
      [revisionId],
    );
    expect(existingReview?.id).toBe(revisionId);

    const statusCache: CacheCase = {
      key: `locamais:revisao:carro:${ids.car}`,
      path: `/revisoes/carro/${ids.car}/status`, ttl: 300,
      tables: ['carros', 'revisoes'],
    };
    const carKey = `locamais:carro:${ids.car}`;
    const reservationKey = `locamais:reserva:${ids.reservation}`;
    await verifyCache(statusCache.key, statusCache.ttl, statusCache.path, statusCache.tables);
    await verifyCache(carKey, 60, `/carros/${ids.car}`, ['carros']);
    await verifyCache(reservationKey, 120, `/reservas/${ids.reservation}`, ['reservas', 'clientes', 'carros']);

    const updatedDescription = `Descrição revisada ${runTag}`;
    const response = await patch<JsonObject>(app, `/revisoes/${revisionId}`, {
      descricao: updatedDescription,
    }, token);
    expect(response.status).toBe(200);
    expect(response.body.descricao).toBe(updatedDescription);
    const [storedReview] = await dataSource.query(
      'SELECT descricao FROM revisoes WHERE id = ?',
      [revisionId],
    );
    expect(storedReview.descricao).toBe(updatedDescription);

    expect(await redis.exists(statusCache.key)).toBe(0);
    expect(await redis.exists(carKey)).toBe(1);
    expect(await redis.exists(reservationKey)).toBe(1);
    const rebuiltStatus = await verifyCache<JsonObject>(statusCache.key, 300, statusCache.path, statusCache.tables);
    expect(rebuiltStatus.ultimaRevisaoKm).toBe(24500);
    expect(await redis.exists(carKey)).toBe(1);
    expect(await redis.exists(reservationKey)).toBe(1);
  });

  it('retirada invalida vistorias, carro e todas as reservas do mesmo veículo', async () => {
    const affected = rentalCacheCases(ids.reservation, ids.inspection);
    const revisionKey = `locamais:revisao:carro:${ids.car}`;
    for (const cache of affected) await verifyCache(cache.key, cache.ttl, cache.path, cache.tables);

    const response = await patch<JsonObject>(app, `/locacoes/${ids.rental}/retirada`, {}, token);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('em_andamento');
    expect(response.body.dataRetirada).not.toBeNull();
    const [storedRental] = await dataSource.query('SELECT status FROM locacoes WHERE id = ?', [ids.rental]);
    const [storedCar] = await dataSource.query('SELECT status FROM carros WHERE id = ?', [ids.car]);
    expect(storedRental.status).toBe('em_andamento');
    expect(storedCar.status).toBe('alugado');
    for (const cache of affected) expect(await redis.exists(cache.key)).toBe(0);
    expect(await redis.exists(revisionKey)).toBe(1);

    for (const cache of affected) {
      const body = await verifyCache<JsonObject>(cache.key, cache.ttl, cache.path, cache.tables);
      cache.check?.(body);
    }
    expect((await get<JsonObject>(app, `/carros/${ids.car}`, token)).body.status).toBe('alugado');
    for (const reservation of [ids.reservation, ids.otherReservation, ids.cancelReservation]) {
      expect((await get<JsonObject>(app, `/reservas/${reservation}`, token)).body.car.status).toBe('alugado');
    }
    expect((await get<JsonObject>(app, `/vistorias/${ids.inspection}`, token)).body.locacao.status).toBe('em_andamento');
  });

  it('devolução invalida vistorias, reserva de origem, carro e reservas do veículo', async () => {
    const affected = rentalCacheCases(ids.reservation, ids.inspection);
    const revisionKey = `locamais:revisao:carro:${ids.car}`;
    for (const cache of affected) await verifyCache(cache.key, cache.ttl, cache.path, cache.tables);

    const response = await patch<JsonObject>(app, `/locacoes/${ids.rental}/devolucao`, {}, token);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('concluida');
    expect(response.body.dataDevolucao).not.toBeNull();
    const [storedRental] = await dataSource.query('SELECT status FROM locacoes WHERE id = ?', [ids.rental]);
    const [storedCar] = await dataSource.query('SELECT status FROM carros WHERE id = ?', [ids.car]);
    const [storedReservation] = await dataSource.query('SELECT status FROM reservas WHERE id = ?', [ids.reservation]);
    expect(storedRental.status).toBe('concluida');
    expect(storedCar.status).toBe('disponivel');
    expect(storedReservation.status).toBe('concluida');
    for (const cache of affected) expect(await redis.exists(cache.key)).toBe(0);
    expect(await redis.exists(revisionKey)).toBe(1);

    for (const cache of affected) {
      const body = await verifyCache<JsonObject>(cache.key, cache.ttl, cache.path, cache.tables);
      cache.check?.(body);
    }
    for (const reservation of [ids.reservation, ids.otherReservation, ids.cancelReservation]) {
      expect((await get<JsonObject>(app, `/reservas/${reservation}`, token)).body.car.status).toBe('disponivel');
    }
    expect((await get<JsonObject>(app, `/reservas/${ids.reservation}`, token)).body.status).toBe('concluida');
    expect((await get<JsonObject>(app, `/vistorias/${ids.inspection}`, token)).body.locacao.status).toBe('concluida');
  });

  it('cancelamento invalida somente a vistoria e preserva caches de carro e reserva', async () => {
    const inspectionKey = `locamais:vistoria:${ids.cancelInspection}`;
    const carKey = `locamais:carro:${ids.car}`;
    const reservationKey = `locamais:reserva:${ids.cancelReservation}`;
    const inspection: CacheCase = {
      key: inspectionKey, path: `/vistorias/${ids.cancelInspection}`, ttl: 600,
      tables: ['vistorias', 'locacoes', 'reservas', 'clientes'],
    };
    await verifyCache(inspection.key, inspection.ttl, inspection.path, inspection.tables);
    await verifyCache(carKey, 60, `/carros/${ids.car}`, ['carros']);
    await verifyCache(reservationKey, 120, `/reservas/${ids.cancelReservation}`, ['reservas', 'clientes', 'carros']);

    const response = await patch<JsonObject>(app, `/locacoes/${ids.cancelRental}`, { status: 'cancelada' }, token);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelada');
    const [storedRental] = await dataSource.query('SELECT status FROM locacoes WHERE id = ?', [ids.cancelRental]);
    expect(storedRental.status).toBe('cancelada');

    expect(await redis.exists(inspectionKey)).toBe(0);
    expect(await redis.exists(carKey)).toBe(1);
    expect(await redis.exists(reservationKey)).toBe(1);
    const rebuilt = await verifyCache<JsonObject>(inspection.key, inspection.ttl, inspection.path, inspection.tables);
    expect(rebuilt.locacao.status).toBe('cancelada');
    expect(await redis.exists(carKey)).toBe(1);
    expect(await redis.exists(reservationKey)).toBe(1);
    expect((await get<JsonObject>(app, `/carros/${ids.car}`, token)).body.status).toBe('disponivel');
    expect((await get<JsonObject>(app, `/reservas/${ids.cancelReservation}`, token)).body.status).toBe('confirmada');
  });

  function reservationCases(): CacheCase[] {
    return [ids.reservation, ids.otherReservation, ids.cancelReservation].map((id) => ({
      key: `locamais:reserva:${id}`,
      path: `/reservas/${id}`,
      ttl: ttlByResource.reserva,
      tables: ['reservas', 'clientes', 'carros'],
    }));
  }

  function rentalCacheCases(reservationId: string, inspectionId: string): CacheCase[] {
    return [
      { key: `locamais:vistoria:${inspectionId}`, path: `/vistorias/${inspectionId}`, ttl: 600, tables: ['vistorias', 'locacoes', 'reservas', 'clientes'] },
      { key: `locamais:carro:${ids.car}`, path: `/carros/${ids.car}`, ttl: 60, tables: ['carros'] },
      ...[reservationId, ids.otherReservation, ids.cancelReservation].map((id) => ({
        key: `locamais:reserva:${id}`, path: `/reservas/${id}`, ttl: 120,
        tables: ['reservas', 'clientes', 'carros'],
      })),
    ];
  }

  async function runPatchScenario(
    caches: Array<CacheCase & { check: (body: JsonObject) => void }>,
    write: () => Promise<{ status: number; body: JsonObject }>,
  ): Promise<void> {
    for (const cache of caches) {
      ownedKeys.add(cache.key);
      const response = await get<JsonObject>(app, cache.path, token);
      expect(response.status).toBe(200);
      expect(await redis.exists(cache.key)).toBe(1);
    }

    expect((await write()).status).toBe(200);
    for (const cache of caches) expect(await redis.exists(cache.key)).toBe(0);

    for (const cache of caches) {
      const rebuilt = await verifyCache<JsonObject>(cache.key, cache.ttl, cache.path, cache.tables);
      cache.check(rebuilt);
      expect(await redis.exists(cache.key)).toBe(1);
    }
  }
});
