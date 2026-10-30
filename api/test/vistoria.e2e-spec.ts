import { INestApplication } from '@nestjs/common';

import {
  createTestingApp,
  ENDERECO,
  get,
  login,
  makeCpf,
  patch,
  post,
} from './helpers.js';

interface ClientBody {
  id: number;
  user: { id: number; email: string; type: string };
}

interface CarBody {
  id: number;
  placa: string;
  status: string;
  valorDiaria: number;
}

interface ReservationBody {
  id: string;
  dataRetirada: string;
  dataDevolucao: string;
  status: string;
  valorTotal: number;
  client_id: number;
  car_id: number;
}

interface LocacaoBody {
  id: string;
  dataRetirada: string | null;
  dataDevolucao: string | null;
  valorTotal: number;
  status: string;
  reservation_id: string;
}

interface VistoriaBody {
  id: string;
  tipo: string;
  data: string;
  observacoes: string | null;
  fotos: string;
  locacao_id: string;
  locacao: LocacaoBody | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function futureIso(dayOffset: number, hourOffset = 0): string {
  const base = new Date();
  base.setUTCMilliseconds(0);
  base.setUTCSeconds(0);
  return new Date(base.getTime() + dayOffset * DAY + hourOffset * HOUR).toISOString();
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * HOUR).toISOString();
}

function fotosJson(urls: string[]): string {
  return JSON.stringify(urls);
}

/**
 * Teste de integração das vistorias.
 *
 * Sobe o AppModule real com SQLite em memória e valida as regras de negócio:
 * - criação apenas para locação existente e acessível;
 * - vistoria de retirada exige locacao aguardando_retirada;
 * - vistoria de devolucao exige locacao em_andamento;
 * - data registrada pelo backend;
 * - atualizacao apenas de observacoes/fotos;
 * - consulta do historico por locação;
 * - controle de acesso por dono da locação.
 */
describe('Vistorias (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;
  let otherClientToken: string;
  let clientId: number;
  let otherClientId: number;
  let carId: number;

  let reservationId: string;
  let locacaoId: string;
  let retiradaVistoriaId: string;

  beforeAll(async () => {
    process.env.ADMIN_NAME = 'Admin Vistoria';
    process.env.ADMIN_EMAIL = 'admin.vistoria@locamais.test';
    process.env.ADMIN_PASSWORD = 'SenhaAdmin1!';

    app = await createTestingApp();
    adminToken = await login(
      app,
      process.env.ADMIN_EMAIL!,
      process.env.ADMIN_PASSWORD!,
    );

    const client = await post<ClientBody>(
      app,
      '/clients',
      {
        name: 'Cliente Vistoria',
        email: 'cliente.vistoria@exemplo.com',
        password: 'senha-secreta',
        cliente: {
          tipo_pessoa: 'PF',
          cpf: makeCpf('222333444'),
          data_nascimento: '1990-01-01',
          endereco: ENDERECO,
        },
      },
      adminToken,
    );
    if (client.status !== 201) {
      throw new Error(`nao foi possivel criar o cliente: ${JSON.stringify(client.body)}`);
    }
    clientId = client.body.id;
    clientToken = await login(app, 'cliente.vistoria@exemplo.com', 'senha-secreta');

    const otherClient = await post<ClientBody>(
      app,
      '/clients',
      {
        name: 'Outro Cliente Vistoria',
        email: 'outro.cliente.vistoria@exemplo.com',
        password: 'senha-secreta',
        cliente: {
          tipo_pessoa: 'PF',
          cpf: makeCpf('555666777'),
          data_nascimento: '1991-02-02',
          endereco: ENDERECO,
        },
      },
      adminToken,
    );
    if (otherClient.status !== 201) {
      throw new Error(`nao foi possivel criar o outro cliente: ${JSON.stringify(otherClient.body)}`);
    }
    otherClientId = otherClient.body.id;
    otherClientToken = await login(app, 'outro.cliente.vistoria@exemplo.com', 'senha-secreta');

    const car = await post<CarBody>(
      app,
      '/cars',
      {
        placa: 'VST1A23',
        modelo: 'Yaris',
        marca: 'Toyota',
        categoria: 'Hatch',
        ano: 2024,
        valorDiaria: 80,
      },
      adminToken,
    );
    if (car.status !== 201) {
      throw new Error(`nao foi possivel criar o carro: ${JSON.stringify(car.body)}`);
    }
    carId = car.body.id;

    // Cria reserva e confirma (apenas reservas confirmadas originam locacoes).
    const start = futureIso(10);
    const end = addHours(start, 50);
    const created = await post<ReservationBody>(
      app,
      '/reservations',
      { dataRetirada: start, dataDevolucao: end, client_id: clientId, car_id: carId },
      clientToken,
    );
    if (created.status !== 201) {
      throw new Error(`nao foi possivel criar a reserva: ${JSON.stringify(created.body)}`);
    }
    reservationId = created.body.id;

    const confirmed = await patch<ReservationBody>(
      app,
      `/reservations/${reservationId}`,
      { status: 'confirmada' },
      adminToken,
    );
    if (confirmed.status !== 200 || confirmed.body.status !== 'confirmada') {
      throw new Error(`nao foi possivel confirmar a reserva: ${JSON.stringify(confirmed.body)}`);
    }

    // Cria locação aguardando retirada.
    const locacao = await post<LocacaoBody>(
      app,
      '/locacoes',
      { reservation_id: reservationId },
      clientToken,
    );
    if (locacao.status !== 201) {
      throw new Error(`nao foi possivel criar a locacao: ${JSON.stringify(locacao.body)}`);
    }
    locacaoId = locacao.body.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_NAME;
  });

  it('não cria vistoria para locação inexistente (404)', async () => {
    const { status } = await post(
      app,
      '/vistorias',
      {
        tipo: 'retirada',
        observacoes: 'teste',
        fotos: '[]',
        locacaoId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
      clientToken,
    );
    expect(status).toBe(404);
  });

  it('cliente cria vistoria de retirada para locação aguardando retirada (201)', async () => {
    const { status, body } = await post<VistoriaBody>(
      app,
      '/vistorias',
      {
        tipo: 'retirada',
        observacoes: 'Veículo sem avarias. Combustível cheio.',
        fotos: fotosJson(['https://exemplo.com/f1.jpg']),
        locacaoId,
      },
      clientToken,
    );

    expect(status).toBe(201);
    expect(body.tipo).toBe('retirada');
    expect(body.locacao_id).toBe(locacaoId);
    expect(body.observacoes).toBe('Veículo sem avarias. Combustível cheio.');
    expect(JSON.parse(body.fotos)).toEqual(['https://exemplo.com/f1.jpg']);
    expect(body.data).not.toBeNull();
    // A data é registrada pelo backend, não vem do cliente.
    expect(new Date(body.data).getTime()).toBeCloseTo(Date.now(), -2);
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    retiradaVistoriaId = body.id;
  });

  it('cliente não cria vistoria para locação de outro cliente (403)', async () => {
    // Cria locação do outro cliente.
    const start2 = futureIso(20);
    const end2 = addHours(start2, 24);
    const res2 = await post<ReservationBody>(
      app,
      '/reservations',
      { dataRetirada: start2, dataDevolucao: end2, client_id: otherClientId, car_id: carId },
      otherClientToken,
    );
    expect(res2.status).toBe(201);
    await patch<ReservationBody>(
      app,
      `/reservations/${res2.body.id}`,
      { status: 'confirmada' },
      adminToken,
    );
    const loc2 = await post<LocacaoBody>(
      app,
      '/locacoes',
      { reservation_id: res2.body.id },
      otherClientToken,
    );
    expect(loc2.status).toBe(201);

    // O primeiro cliente tenta vistoriar a locação do segundo.
    const { status } = await post(
      app,
      '/vistorias',
      {
        tipo: 'retirada',
        observacoes: 'invasao',
        fotos: '[]',
        locacaoId: loc2.body.id,
      },
      clientToken,
    );
    expect(status).toBe(403);
  });

  it('registra a retirada e a locação passa para em_andamento (200)', async () => {
    const { status, body } = await patch<LocacaoBody>(
      app,
      `/locacoes/${locacaoId}/retirada`,
      {},
      adminToken,
    );
    expect(status).toBe(200);
    expect(body.status).toBe('em_andamento');
  });

  it('não cria vistoria de retirada quando locação não está aguardando retirada (409)', async () => {
    const { status } = await post(
      app,
      '/vistorias',
      {
        tipo: 'retirada',
        observacoes: 'duplicada',
        fotos: '[]',
        locacaoId,
      },
      adminToken,
    );
    expect(status).toBe(409);
  });

  it('cliente cria vistoria de devolução quando locação está em andamento (201)', async () => {
    const { status, body } = await post<VistoriaBody>(
      app,
      '/vistorias',
      {
        tipo: 'devolucao',
        observacoes: 'Novo arranque no para-choque.',
        fotos: fotosJson(['https://exemplo.com/f2.jpg']),
        locacaoId,
      },
      clientToken,
    );

    expect(status).toBe(201);
    expect(body.tipo).toBe('devolucao');
    expect(body.locacao_id).toBe(locacaoId);
    expect(body.observacoes).toBe('Novo arranque no para-choque.');
  });

  it('não cria vistoria de devolução quando locação não está em andamento (409)', async () => {
    // Cria uma locação ainda aguardando retirada.
    const start3 = futureIso(30);
    const end3 = addHours(start3, 24);
    const res3 = await post<ReservationBody>(
      app,
      '/reservations',
      { dataRetirada: start3, dataDevolucao: end3, client_id: clientId, car_id: carId },
      clientToken,
    );
    expect(res3.status).toBe(201);
    await patch<ReservationBody>(
      app,
      `/reservations/${res3.body.id}`,
      { status: 'confirmada' },
      adminToken,
    );
    const loc3 = await post<LocacaoBody>(
      app,
      '/locacoes',
      { reservation_id: res3.body.id },
      clientToken,
    );
    expect(loc3.status).toBe(201);

    const { status } = await post(
      app,
      '/vistorias',
      {
        tipo: 'devolucao',
        observacoes: 'nao pode',
        fotos: '[]',
        locacaoId: loc3.body.id,
      },
      clientToken,
    );
    expect(status).toBe(409);
  });

  it('consulta o histórico de vistorias da locação (200)', async () => {
    const { status, body } = await get<VistoriaBody[]>(
      app,
      `/vistorias/locacao/${locacaoId}`,
      clientToken,
    );

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.some((v) => v.id === retiradaVistoriaId)).toBe(true);
    expect(
      body.every((v) => v.locacao_id === locacaoId),
    ).toBe(true);
  });

  it('consulta uma vistoria pelo id (200)', async () => {
    const { status, body } = await get<VistoriaBody>(
      app,
      `/vistorias/${retiradaVistoriaId}`,
      clientToken,
    );

    expect(status).toBe(200);
    expect(body.id).toBe(retiradaVistoriaId);
    expect(body.tipo).toBe('retirada');
  });

  it('atualiza observacoes e fotos de uma vistoria (200)', async () => {
    const { status, body } = await patch<VistoriaBody>(
      app,
      `/vistorias/${retiradaVistoriaId}`,
      {
        observacoes: 'Observacao atualizada.',
        fotos: fotosJson(['https://exemplo.com/f3.jpg']),
      },
      clientToken,
    );

    expect(status).toBe(200);
    expect(body.observacoes).toBe('Observacao atualizada.');
    expect(JSON.parse(body.fotos)).toEqual(['https://exemplo.com/f3.jpg']);
    // tipo e data nao sao alterados.
    expect(body.tipo).toBe('retirada');
  });

  it('cliente não acessa vistoria de locação de outro cliente (403)', async () => {
    const { status } = await get(
      app,
      `/vistorias/${retiradaVistoriaId}`,
      otherClientToken,
    );
    expect(status).toBe(403);
  });

  it('lista todas as vistorias para admin (200)', async () => {
    const { status, body } = await get<VistoriaBody[]>(app, '/vistorias', adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });
});
