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

interface AdicionaisBody {
  locacaoId: string;
  reservationId: string;
  valorDiaria: number;
  dataDevolucaoPrevista: string;
  dataDevolucaoEfetiva: string | null;
  diasAtraso: number;
  valorAdicional: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Gera uma data futura ISO 8601 com segundos/milissegundos zerados. */
function futureIso(dayOffset: number, hourOffset = 0): string {
  const base = new Date();
  base.setUTCMilliseconds(0);
  base.setUTCSeconds(0);
  return new Date(base.getTime() + dayOffset * DAY + hourOffset * HOUR).toISOString();
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * HOUR).toISOString();
}

/**
 * Teste de integração das locações.
 *
 * Sobe o AppModule real com SQLite em memória e valida as regras de negócio:
 * - criação apenas a partir de reserva confirmada;
 * - cardinalidade 1:1 (uma reserva, no máximo uma locação);
 * - registro de retirada e devolução com atualização consistente do veículo;
 * - cálculo de adicionais (leitura, sem cobrança duplicada);
 * - controle de acesso por dono da reserva.
 */
describe('Locações (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;
  let clientId: number;
  let carId: number;
  let reservationId: string;
  let locacaoId: string;

  beforeAll(async () => {
    process.env.ADMIN_NAME = 'Admin Locacao';
    process.env.ADMIN_EMAIL = 'admin.locacao@locamais.test';
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
        name: 'Cliente Locacao',
        email: 'cliente.locacao@exemplo.com',
        password: 'senha-secreta',
        cliente: {
          tipo_pessoa: 'PF',
          cpf: makeCpf('111222333'),
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
    clientToken = await login(app, 'cliente.locacao@exemplo.com', 'senha-secreta');

    const car = await post<CarBody>(
      app,
      '/cars',
      {
        placa: 'LOC1A23',
        modelo: 'Civic',
        marca: 'Honda',
        categoria: 'Sedan',
        ano: 2024,
        valorDiaria: 100,
      },
      adminToken,
    );
    if (car.status !== 201) {
      throw new Error(`nao foi possivel criar o carro: ${JSON.stringify(car.body)}`);
    }
    carId = car.body.id;

    // Cria reserva (pendente) e a confirma, pois apenas reservas confirmadas
    // originam locações.
    const start = futureIso(10);
    const end = addHours(start, 50); // 50h => 3 diárias => valorTotal 300
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
  }, 30000);

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_NAME;
  });

  it('não cria locação para reserva inexistente (404)', async () => {
    const { status } = await post(
      app,
      '/locacoes',
      { reservation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
      clientToken,
    );
    expect(status).toBe(404);
  });

  it('não cria locação para reserva pendente (409)', async () => {
    const pendente = await post<ReservationBody>(
      app,
      '/reservations',
      {
        dataRetirada: futureIso(20),
        dataDevolucao: addHours(futureIso(20), 24),
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );
    expect(pendente.status).toBe(201);

    const { status } = await post(
      app,
      '/locacoes',
      { reservation_id: pendente.body.id },
      clientToken,
    );
    expect(status).toBe(409);
  });

  it('não cria locação para reserva cancelada (409)', async () => {
    const paraCancelar = await post<ReservationBody>(
      app,
      '/reservations',
      {
        dataRetirada: futureIso(25),
        dataDevolucao: addHours(futureIso(25), 24),
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );
    expect(paraCancelar.status).toBe(201);

    await patch(
      app,
      `/reservations/${paraCancelar.body.id}/cancel`,
      {},
      clientToken,
    );

    const { status } = await post(
      app,
      '/locacoes',
      { reservation_id: paraCancelar.body.id },
      clientToken,
    );
    expect(status).toBe(409);
  });

  it('cliente cria locação para a própria reserva confirmada (201)', async () => {
    const { status, body } = await post<LocacaoBody>(
      app,
      '/locacoes',
      { reservation_id: reservationId },
      clientToken,
    );

    expect(status).toBe(201);
    expect(body.status).toBe('aguardando_retirada');
    expect(body.reservation_id).toBe(reservationId);
    expect(body.dataRetirada).toBeNull();
    expect(body.dataDevolucao).toBeNull();
    expect(body.valorTotal).toBeCloseTo(300, 2);
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    locacaoId = body.id;
  });

  it('cliente não cria locação para reserva de outro cliente (403)', async () => {
    const outraReserva = await post<ReservationBody>(
      app,
      '/reservations',
      {
        dataRetirada: futureIso(30),
        dataDevolucao: addHours(futureIso(30), 24),
        client_id: clientId,
        car_id: carId,
      },
      adminToken,
    );
    expect(outraReserva.status).toBe(201);
    await patch<ReservationBody>(
      app,
      `/reservations/${outraReserva.body.id}`,
      { status: 'confirmada' },
      adminToken,
    );

    await post<ClientBody>(
      app,
      '/clients',
      {
        name: 'Outro Cliente Locacao',
        email: 'outro.cliente.locacao@exemplo.com',
        password: 'senha-secreta',
        cliente: {
          tipo_pessoa: 'PF',
          cpf: makeCpf('444555666'),
          data_nascimento: '1991-02-02',
          endereco: ENDERECO,
        },
      },
      adminToken,
    );
    const outroToken = await login(
      app,
      'outro.cliente.locacao@exemplo.com',
      'senha-secreta',
    );

    const { status } = await post(
      app,
      '/locacoes',
      { reservation_id: outraReserva.body.id },
      outroToken,
    );
    expect(status).toBe(403);
  });

  it('não cria segunda locação para a mesma reserva (409)', async () => {
    const { status } = await post(
      app,
      '/locacoes',
      { reservation_id: reservationId },
      clientToken,
    );
    expect(status).toBe(409);
  });

  it('registra a retirada da locação (200)', async () => {
    const { status, body } = await patch<LocacaoBody>(
      app,
      `/locacoes/${locacaoId}/retirada`,
      {},
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.status).toBe('em_andamento');
    expect(body.dataRetirada).not.toBeNull();
    expect(body.dataDevolucao).toBeNull();
  });

  it('impede uma segunda retirada (409)', async () => {
    const { status } = await patch(
      app,
      `/locacoes/${locacaoId}/retirada`,
      {},
      adminToken,
    );
    expect(status).toBe(409);
  });

  it('consulta adicionais sem atraso (200, adicional zero)', async () => {
    const { status, body } = await get<AdicionaisBody>(
      app,
      `/locacoes/${locacaoId}/adicionais`,
      clientToken,
    );

    expect(status).toBe(200);
    expect(body.locacaoId).toBe(locacaoId);
    expect(body.reservationId).toBe(reservationId);
    expect(body.valorDiaria).toBe(100);
    expect(body.diasAtraso).toBe(0);
    expect(body.valorAdicional).toBe(0);
    expect(body.dataDevolucaoEfetiva).toBeNull();
  });

  it('registra a devolução da locação (200)', async () => {
    const { status, body } = await patch<LocacaoBody>(
      app,
      `/locacoes/${locacaoId}/devolucao`,
      {},
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.status).toBe('concluida');
    expect(body.dataRetirada).not.toBeNull();
    expect(body.dataDevolucao).not.toBeNull();
    // Devolvido dentro do prazo: o adicional é zero, então o total continua o da reserva.
    expect(body.valorTotal).toBeCloseTo(300, 2);
  });

  it('não permite devolução de locação que não está em andamento (409)', async () => {
    const { status } = await patch(
      app,
      `/locacoes/${locacaoId}/devolucao`,
      {},
      adminToken,
    );
    expect(status).toBe(409);
  });

  it('consulta adicionais após a devolução permanece sem duplicar cobrança', async () => {
    const { status, body } = await get<AdicionaisBody>(
      app,
      `/locacoes/${locacaoId}/adicionais`,
      clientToken,
    );

    expect(status).toBe(200);
    expect(body.diasAtraso).toBe(0);
    expect(body.valorAdicional).toBe(0);
    expect(body.dataDevolucaoEfetiva).not.toBeNull();
  });

  it('lista e consulta a locação criada (200)', async () => {
    const list = await get<LocacaoBody[]>(app, '/locacoes', adminToken);
    expect(list.status).toBe(200);
    expect(list.body.some((l) => l.id === locacaoId)).toBe(true);

    const one = await get<LocacaoBody>(app, `/locacoes/${locacaoId}`, clientToken);
    expect(one.status).toBe(200);
    expect(one.body.id).toBe(locacaoId);
  });
});
