import { INestApplication } from '@nestjs/common';

import {
  createTestingApp,
  del,
  ENDERECO,
  get,
  login,
  makeCpf,
  patch,
  post,
} from './helpers.js';

interface ClienteBody {
  id: number;
  user: { id: number; email: string; type: string };
}

interface CarroBody {
  id: number;
  placa: string;
  status: string;
  valorDiaria: number;
  lugares: number;
  descricao: string | null;
}

interface ReservaBody {
  id: string;
  dataRetirada: string;
  dataDevolucao: string;
  status: string;
  valorTotal: number;
  client_id: number;
  car_id: number;
  client?: { id: number; user_id: number } | null;
  car?: { id: number; valorDiaria: number } | null;
}

interface DisponibilidadeBody {
  car_id: number;
  dataRetirada: string;
  dataDevolucao: string;
  disponivel: boolean;
  motivo: string | null;
  conflito: {
    id: string;
    dataRetirada: string;
    dataDevolucao: string;
    status: string;
  } | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Gera uma data futura com segundos/milissegundos zerados.
 *
 * O SQLite/TypeORM pode truncar precisão de datetime; zerar a parte fracionária
 * evita diferenças artificiais nas comparações de disponibilidade.
 */
function futureIso(dayOffset: number, hourOffset = 0): string {
  const base = new Date();
  base.setUTCMilliseconds(0);
  base.setUTCSeconds(0);
  return new Date(
    base.getTime() + dayOffset * DAY + hourOffset * HOUR,
  ).toISOString();
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * HOUR).toISOString();
}

function queryAvailability(carId: number, start: string, end: string): string {
  return (
    `/reservas/disponibilidade?car_id=${carId}` +
    `&dataRetirada=${encodeURIComponent(start)}` +
    `&dataDevolucao=${encodeURIComponent(end)}`
  );
}

/**
 * Teste de integração das reservas.
 *
 * Sobe o AppModule real com SQLite em memória. O foco é validar:
 * - cálculo do valor no servidor;
 * - conflito de calendário e transição de fronteira;
 * - autorização por papel/dono;
 * - transições de status e cancelamento lógico;
 * - bloqueio de remoção de carro com histórico de reservas.
 */
describe('Reservas (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;
  let otherClientToken: string;
  let funcionarioToken: string;
  let incompleteClientToken: string;
  let clientId: number;
  let otherClientId: number;
  let carId: number;

  let firstReservationId: string;
  let firstStart: string;
  let firstEnd: string;

  beforeAll(async () => {
    const adminEmail = 'admin.reservas@locamais.test';
    const adminPassword = 'SenhaAdmin1!';

    process.env.ADMIN_NAME = 'Admin Reservas';
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.ADMIN_PASSWORD = adminPassword;

    app = await createTestingApp();
    adminToken = await login(app, adminEmail, adminPassword);

    const client = await post<ClienteBody>(
      app,
      '/clientes',
      {
        name: 'Cliente Reserva',
        email: 'cliente.reserva@exemplo.com',
        password: 'senha-secreta',
        cliente: {
          tipo_pessoa: 'PF',
          cpf: makeCpf('123456789'),
          data_nascimento: '1990-01-01',
          endereco: ENDERECO,
        },
      },
      adminToken,
    );

    if (client.status !== 201) {
      throw new Error(
        `nao foi possivel criar o cliente de teste: ${JSON.stringify(client.body)}`,
      );
    }

    clientId = client.body.id;
    clientToken = await login(
      app,
      'cliente.reserva@exemplo.com',
      'senha-secreta',
    );
    await patch(app, '/clientes/me', {
      telefone: '+5521999990000',
      cnh_numero: '12345678901',
      cnh_validade: '2030-12-31',
    }, clientToken);

    const otherClient = await post<ClienteBody>(
      app,
      '/clientes',
      {
        name: 'Outro Cliente Reserva',
        email: 'outro.cliente.reserva@exemplo.com',
        password: 'senha-secreta',
        cliente: {
          tipo_pessoa: 'PF',
          cpf: makeCpf('987654321'),
          data_nascimento: '1991-02-02',
          endereco: ENDERECO,
        },
      },
      adminToken,
    );

    if (otherClient.status !== 201) {
      throw new Error(
        `nao foi possivel criar o segundo cliente: ${JSON.stringify(otherClient.body)}`,
      );
    }

    otherClientId = otherClient.body.id;
    otherClientToken = await login(
      app,
      'outro.cliente.reserva@exemplo.com',
      'senha-secreta',
    );
    await patch(app, '/clientes/me', {
      telefone: '+5521999990001',
      cnh_numero: '10987654321',
      cnh_validade: '2030-12-31',
    }, otherClientToken);

    const incompleteClient = await post<ClienteBody>(app, '/clientes', {
      name: 'Cliente Cadastro Pendente',
      email: 'cliente.incompleto@exemplo.com',
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PF',
        cpf: makeCpf('192837465'),
        data_nascimento: '1992-03-04',
        endereco: ENDERECO,
      },
    }, adminToken);
    if (incompleteClient.status !== 201) throw new Error(`nao foi possivel criar cliente incompleto: ${JSON.stringify(incompleteClient.body)}`);
    incompleteClientToken = await login(app, 'cliente.incompleto@exemplo.com', 'senha-secreta');

    const funcionario = await post<{ id: number }>(
      app,
      '/usuarios',
      {
        name: 'Funcionário Reserva',
        email: 'funcionario.reserva@locamais.test',
        password: 'SenhaFuncionario1!',
        type: 'funcionario',
      },
      adminToken,
    );
    if (funcionario.status !== 201) {
      throw new Error(`nao foi possivel criar funcionario: ${JSON.stringify(funcionario.body)}`);
    }
    funcionarioToken = await login(app, 'funcionario.reserva@locamais.test', 'SenhaFuncionario1!');

    const car = await post<CarroBody>(
      app,
      '/carros',
      {
        placa: 'RSV1A23',
        modelo: 'Corolla',
        marca: 'Toyota',
        categoria: 'Sedan',
        lugares: 5,
        descricao: 'Sedan de teste da frota',
        ano: 2024,
        valorDiaria: 100.5,
      },
      adminToken,
    );

    if (car.status !== 201) {
      throw new Error(
        `nao foi possivel criar o carro de teste: ${JSON.stringify(car.body)}`,
      );
    }

    carId = car.body.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_NAME;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  it('consulta disponibilidade livre antes de existir reserva', async () => {
    const start = futureIso(10);
    const end = addHours(start, 48);

    const { status, body } = await get<DisponibilidadeBody>(
      app,
      queryAvailability(carId, start, end),
      clientToken,
    );

    expect(status).toBe(200);
    expect(body.car_id).toBe(carId);
    expect(body.disponivel).toBe(true);
    expect(body.motivo).toBeNull();
    expect(body.conflito).toBeNull();
  });

  it('bloqueia reserva incompleta com pendências e permite tentar novamente após salvar CNH e telefone', async () => {
    const initial = await get<{ completo: boolean; pendencias: string[] }>(app, '/clientes/me/completude', incompleteClientToken);
    expect(initial.status).toBe(200);
    expect(initial.body.completo).toBe(false);
    expect(initial.body.pendencias).toContain('telefone');
    expect(initial.body.pendencias).toContain('cnh');

    const start = futureIso(100);
    const blocked = await post<{ code: string; pendencias: string[] }>(app, '/reservas', {
      dataRetirada: start,
      dataDevolucao: addHours(start, 24),
      client_id: initial.body && (await get<{ client: { id: number } }>(app, '/autenticacao/me', incompleteClientToken)).body.client.id,
      car_id: carId,
    }, incompleteClientToken);
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('CLIENT_PROFILE_INCOMPLETE');
    expect(blocked.body.pendencias).toEqual(expect.arrayContaining(['telefone', 'cnh']));

    await patch(app, '/clientes/me', {
      telefone: '+5521988880000',
      cnh_numero: '12345098765',
      cnh_validade: '2030-12-31',
    }, incompleteClientToken);
    const complete = await get<{ completo: boolean; pendencias: string[] }>(app, '/clientes/me/completude', incompleteClientToken);
    expect(complete.body).toEqual({ completo: true, pendencias: [] });

    const retried = await post<ReservaBody>(app, '/reservas', {
      dataRetirada: start,
      dataDevolucao: addHours(start, 24),
      client_id: (await get<{ client: { id: number } }>(app, '/autenticacao/me', incompleteClientToken)).body.client.id,
      car_id: carId,
    }, incompleteClientToken);
    expect(retried.status).toBe(201);
  });

  it('cliente não autenticado recebe 401 ao tentar criar uma reserva', async () => {
    const start = futureIso(80);
    const response = await post(app, '/reservas', {
      dataRetirada: start,
      dataDevolucao: addHours(start, 24),
      client_id: clientId,
      car_id: carId,
    });
    expect(response.status).toBe(401);
  });

  it('funcionário cria reserva para o cliente selecionado, não para o próprio usuário', async () => {
    const start = futureIso(90);
    const { status, body } = await post<ReservaBody>(
      app,
      '/reservas',
      {
        dataRetirada: start,
        dataDevolucao: addHours(start, 24),
        client_id: clientId,
        car_id: carId,
      },
      funcionarioToken,
    );
    expect(status).toBe(201);
    expect(body.client_id).toBe(clientId);
    expect(body.client?.user_id).not.toBeUndefined();
    expect(body.status).toBe('pendente');
  });

  it('GET /carros retorna lugares e descrição persistidos e PATCH atualiza os dois campos', async () => {
    const initial = await get<CarroBody>(app, `/carros/${carId}`, adminToken);
    expect(initial.status).toBe(200);
    expect(initial.body.lugares).toBe(5);
    expect(initial.body.descricao).toBe('Sedan de teste da frota');

    const updated = await patch<CarroBody>(app, `/carros/${carId}`, {
      lugares: 7,
      descricao: 'Sedan revisado com sete lugares',
    }, adminToken);
    expect(updated.status).toBe(200);
    expect(updated.body.lugares).toBe(7);
    expect(updated.body.descricao).toBe('Sedan revisado com sete lugares');

    const readback = await get<CarroBody>(app, `/carros/${carId}`, adminToken);
    expect(readback.body).toMatchObject({ lugares: 7, descricao: 'Sedan revisado com sete lugares' });
  });

  it('cliente cria reserva para si e o servidor calcula o valor', async () => {
    firstStart = futureIso(10);
    firstEnd = addHours(firstStart, 50); // 50h => 3 diárias

    const { status, body } = await post<ReservaBody>(
      app,
      '/reservas',
      {
        dataRetirada: firstStart,
        dataDevolucao: firstEnd,
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );

    expect(status).toBe(201);
    expect(body.status).toBe('pendente');
    expect(body.client_id).toBe(clientId);
    expect(body.car_id).toBe(carId);
    expect(body.valorTotal).toBeCloseTo(301.5, 2);
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    firstReservationId = body.id;
  });

  it('impede cliente de reservar para outro cliente (403)', async () => {
    const { status } = await post(
      app,
      '/reservas',
      {
        dataRetirada: firstStart,
        dataDevolucao: firstEnd,
        client_id: otherClientId,
        car_id: carId,
      },
      clientToken,
    );

    expect(status).toBe(403);
  });

  it('bloqueia sobreposição e aceita início exatamente no fim da outra reserva', async () => {
    const overlapStart = addHours(firstStart, 1);
    const overlapEnd = addHours(firstStart, 2);

    const overlap = await post(
      app,
      '/reservas',
      {
        dataRetirada: overlapStart,
        dataDevolucao: overlapEnd,
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );

    expect(overlap.status).toBe(409);

    // A reserva começa exatamente quando a primeira termina: a regra usa
    // intervalos semiabertos e não deve considerar conflito nesse instante.
    const boundary = await post<ReservaBody>(
      app,
      '/reservas',
      {
        dataRetirada: firstEnd,
        dataDevolucao: addHours(firstEnd, 24),
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );

    expect(boundary.status).toBe(201);
    expect(boundary.body.status).toBe('pendente');
  });

  it('consulta disponibilidade retorna o conflito e a reserva bloqueante', async () => {
    const { status, body } = await get<DisponibilidadeBody>(
      app,
      queryAvailability(
        carId,
        addHours(firstStart, 1),
        addHours(firstStart, 2),
      ),
      clientToken,
    );

    expect(status).toBe(200);
    expect(body.disponivel).toBe(false);
    expect(body.motivo).toBe('conflito');
    expect(body.conflito?.id).toBe(firstReservationId);
  });

  it('cliente só lista e consulta as próprias reservas', async () => {
    const otherList = await get<ReservaBody[]>(
      app,
      '/reservas',
      otherClientToken,
    );

    expect(otherList.status).toBe(200);
    expect(otherList.body).toEqual([]);

    const forbidden = await get(
      app,
      `/reservas/${firstReservationId}`,
      otherClientToken,
    );
    expect(forbidden.status).toBe(403);

    const own = await get<ReservaBody>(
      app,
      `/reservas/${firstReservationId}`,
      clientToken,
    );
    expect(own.status).toBe(200);
    expect(own.body.id).toBe(firstReservationId);

    const all = await get<ReservaBody[]>(app, '/reservas', adminToken);
    expect(all.status).toBe(200);
    expect(
      all.body.some((reservation) => reservation.id === firstReservationId),
    ).toBe(true);
  });

  it('cliente não pode usar o PATCH administrativo (403)', async () => {
    const { status } = await patch(
      app,
      `/reservas/${firstReservationId}`,
      { dataDevolucao: addHours(firstEnd, 1) },
      clientToken,
    );

    expect(status).toBe(403);
  });

  it('admin altera o período pendente e o valor é recalculado', async () => {
    const newStart = futureIso(30);
    const newEnd = addHours(newStart, 48); // 48h => 2 diárias

    const { status, body } = await patch<ReservaBody>(
      app,
      `/reservas/${firstReservationId}`,
      {
        dataRetirada: newStart,
        dataDevolucao: newEnd,
      },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.status).toBe('pendente');
    expect(body.valorTotal).toBeCloseTo(201, 2);

    // Guarda o novo período para os testes de disponibilidade/cancelamento.
    firstStart = newStart;
    firstEnd = newEnd;
  });

  it('admin confirma a reserva e congela o período', async () => {
    const confirmed = await patch<ReservaBody>(
      app,
      `/reservas/${firstReservationId}`,
      { status: 'confirmada' },
      adminToken,
    );

    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('confirmada');

    const dateChange = await patch(
      app,
      `/reservas/${firstReservationId}`,
      { dataDevolucao: addHours(firstEnd, 1) },
      adminToken,
    );
    expect(dateChange.status).toBe(409);

    const statusDowngrade = await patch(
      app,
      `/reservas/${firstReservationId}`,
      { status: 'pendente' },
      adminToken,
    );
    expect(statusDowngrade.status).toBe(409);

    const cancelThroughGenericPatch = await patch(
      app,
      `/reservas/${firstReservationId}`,
      { status: 'cancelada' },
      adminToken,
    );
    expect(cancelThroughGenericPatch.status).toBe(400);
  });

  it('cliente cancela a própria reserva e ela deixa de bloquear o período', async () => {
    const cancelled = await patch<ReservaBody>(
      app,
      `/reservas/${firstReservationId}/cancelar`,
      {},
      clientToken,
    );

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelada');

    const again = await patch(
      app,
      `/reservas/${firstReservationId}/cancelar`,
      {},
      clientToken,
    );
    expect(again.status).toBe(409);

    const updateCancelled = await patch(
      app,
      `/reservas/${firstReservationId}`,
      { dataDevolucao: addHours(firstEnd, 1) },
      adminToken,
    );
    expect(updateCancelled.status).toBe(409);

    const availability = await get<DisponibilidadeBody>(
      app,
      queryAvailability(carId, firstStart, firstEnd),
      clientToken,
    );

    expect(availability.status).toBe(200);
    expect(availability.body.disponivel).toBe(true);
    expect(availability.body.conflito).toBeNull();
  });

  it('não remove fisicamente um carro que possui reservas', async () => {
    const removed = await del(app, `/carros/${carId}`, adminToken);
    expect(removed.status).toBe(409);
  });

  it('valida período, UUID, cliente, carro e campos não permitidos', async () => {
    const start = futureIso(5);
    const end = addHours(start, -1);

    const invalidPeriod = await post(
      app,
      '/reservas',
      {
        dataRetirada: start,
        dataDevolucao: end,
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );
    expect(invalidPeriod.status).toBe(400);

    const pastStart = futureIso(-2);
    const past = await post(
      app,
      '/reservas',
      {
        dataRetirada: pastStart,
        dataDevolucao: addHours(pastStart, 24),
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );
    expect(past.status).toBe(400);

    const invalidUuid = await get(
      app,
      '/reservas/nao-e-um-uuid',
      adminToken,
    );
    expect(invalidUuid.status).toBe(400);

    const missingCar = await post(
      app,
      '/reservas',
      {
        dataRetirada: futureIso(5),
        dataDevolucao: futureIso(6),
        client_id: clientId,
        car_id: 999999,
      },
      clientToken,
    );
    expect(missingCar.status).toBe(404);

    const missingClient = await post(
      app,
      '/reservas',
      {
        dataRetirada: futureIso(5),
        dataDevolucao: futureIso(6),
        client_id: 999999,
        car_id: carId,
      },
      adminToken,
    );
    expect(missingClient.status).toBe(404);

    const forbiddenField = await post(
      app,
      '/reservas',
      {
        dataRetirada: futureIso(5),
        dataDevolucao: futureIso(6),
        client_id: clientId,
        car_id: carId,
        valorTotal: 1,
      },
      clientToken,
    );
    expect(forbiddenField.status).toBe(400);
  });
});
