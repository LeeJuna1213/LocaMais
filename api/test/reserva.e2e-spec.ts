import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
  codigo: string;
  dataRetirada: string;
  dataDevolucao: string;
  status: string;
  valorTotal: number;
  client_id: number;
  car_id: number;
  loja_retirada_id?: number | null;
  lojaRetiradaSnapshot?: { nome: string; logradouro: string; numero: string; cidade: string; uf: string } | null;
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
  let pickupShopId: number;
  let inactiveShopId: number;

  let firstReservationId: string;
  let firstReservationCode: string;
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

    const activeShop = await post<{ id: number }>(app, '/lojas', {
      codigo: 'RESERVA-ATIVA', nome: 'Loja de Reserva', telefone: '+5521999990000', email: 'loja.ativa@exemplo.com',
      logradouro: 'Rua Central', numero: '10', bairro: 'Centro', cidade: 'Belford Roxo', uf: 'RJ', cep: '26130000', ativa: true,
    }, adminToken);
    const inactiveShop = await post<{ id: number }>(app, '/lojas', {
      codigo: 'RESERVA-INATIVA', nome: 'Loja Inativa', telefone: '+5521999990001', email: 'loja.inativa@exemplo.com',
      logradouro: 'Rua Antiga', numero: '20', bairro: 'Centro', cidade: 'Belford Roxo', uf: 'RJ', cep: '26130001', ativa: false,
    }, adminToken);
    expect(activeShop.status).toBe(201);
    expect(inactiveShop.status).toBe(201);
    pickupShopId = activeShop.body.id;
    inactiveShopId = inactiveShop.body.id;

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
      loja_retirada_id: pickupShopId,
      },
      clientToken,
    );

    expect(status).toBe(201);
    expect(body.status).toBe('pendente');
    expect(body.client_id).toBe(clientId);
    expect(body.car_id).toBe(carId);
    expect(body.valorTotal).toBeCloseTo(301.5, 2);
    expect(body.loja_retirada_id).toBe(pickupShopId);
    expect(body.lojaRetiradaSnapshot).toMatchObject({ nome: 'Loja de Reserva', logradouro: 'Rua Central' });
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.codigo).toMatch(/^LOC-\d{6,}$/);
    expect(body.pagamentos).toHaveLength(1);
    expect(body.pagamentos[0]).toMatchObject({ status: 'pendente', valor: 301.5 });

    const byCode = await get<ReservaBody>(app, `/reservas/${body.codigo}`, clientToken);
    const byUuid = await get<ReservaBody>(app, `/reservas/${body.id}`, clientToken);
    expect(byCode.status).toBe(200);
    expect(byCode.body.id).toBe(body.id);
    expect(byUuid.status).toBe(200);
    expect(byUuid.body.codigo).toBe(body.codigo);

    const notifications = await get<Array<{ id: string; tipo: string; lida_em: string | null }>>(app, '/notificacoes', clientToken);
    const createdNotification = notifications.body.find((item) => item.tipo === 'reserva_criada');
    expect(createdNotification).toBeDefined();
    expect(createdNotification?.lida_em).toBeNull();
    const unreadBefore = (await get<{ count: number }>(app, '/notificacoes/nao-lidas/contagem', clientToken)).body.count;
    expect(unreadBefore).toBeGreaterThan(0);
    const forbiddenRead = await patch(app, `/notificacoes/${createdNotification?.id}/lida`, {}, otherClientToken);
    expect(forbiddenRead.status).toBe(404);
    expect((await patch(app, `/notificacoes/${createdNotification?.id}/lida`, {}, clientToken)).status).toBe(200);
    expect((await get<{ count: number }>(app, '/notificacoes/nao-lidas/contagem', clientToken)).body.count).toBe(unreadBefore - 1);

    firstReservationId = body.id;
    firstReservationCode = body.codigo;
    const allReservations = await get<ReservaBody[]>(app, '/reservas', adminToken);
    const codes = allReservations.body.map((reservation) => reservation.codigo);
    expect(new Set(codes).size).toBe(codes.length);

    const attemptedCodeChange = await patch(app, `/reservas/${body.id}`, { codigo: 'LOC-999999' }, adminToken);
    expect(attemptedCodeChange.status).toBe(400);
    expect((await get<ReservaBody>(app, `/reservas/${body.id}`, adminToken)).body.codigo).toBe(firstReservationCode);
  });

  it('expõe somente lojas ativas para retirada e rejeita loja inativa na reserva', async () => {
    const active = await get<Array<{ id: number }>>(app, '/lojas/ativas', clientToken);
    expect(active.status).toBe(200);
    expect(active.body.map((shop) => shop.id)).toContain(pickupShopId);
    expect(active.body.map((shop) => shop.id)).not.toContain(inactiveShopId);

    const start = futureIso(200);
    const attempt = await post(app, '/reservas', {
      dataRetirada: start,
      dataDevolucao: addHours(start, 24),
      client_id: clientId,
      car_id: carId,
      loja_retirada_id: inactiveShopId,
    }, clientToken);
    expect(attempt.status).toBe(409);
  });

  it('cota valores no backend com diária, subtotal e taxa de serviço vigentes', async () => {
    const start = futureIso(240);
    const quote = await get<{ valorDiaria: number; diarias: number; valorSubtotal: number; taxaServico: number; valorTotal: number }>(
      app,
      `/reservas/estimativa?car_id=${carId}&dataRetirada=${encodeURIComponent(start)}&dataDevolucao=${encodeURIComponent(addHours(start, 24))}`,
      clientToken,
    );
    const car = await get<CarroBody>(app, `/carros/${carId}`, adminToken);
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ valorDiaria: car.body.valorDiaria, diarias: 1, valorSubtotal: car.body.valorDiaria });
    expect(quote.body.valorTotal).toBeCloseTo(quote.body.valorSubtotal + quote.body.taxaServico, 2);
  });

  it('persiste favoritos por cliente, sem duplicar ou expor favoritos de outro cliente', async () => {
    const first = await post<{ id: number; client_id: number; car_id: number }>(app, `/favoritos/${carId}`, {}, clientToken);
    expect(first.status).toBe(201);
    expect(first.body.car_id).toBe(carId);
    const repeated = await post<{ id: number }>(app, `/favoritos/${carId}`, {}, clientToken);
    expect(repeated.status).toBe(201);
    expect(repeated.body.id).toBe(first.body.id);

    const own = await get<Array<{ car_id: number; car: { id: number; modelo: string; foto: string | null } }>>(app, '/favoritos', clientToken);
    expect(own.body.filter((item) => item.car_id === carId)).toHaveLength(1);
    expect(own.body.find((item) => item.car_id === carId)?.car).toMatchObject({ id: carId, modelo: 'Corolla' });
    const other = await get<Array<{ car_id: number }>>(app, '/favoritos', otherClientToken);
    expect(other.body.some((item) => item.car_id === carId)).toBe(false);

    const removed = await del(app, `/favoritos/${carId}`, clientToken);
    expect(removed.status).toBe(200);
    const after = await get<Array<{ car_id: number }>>(app, '/favoritos', clientToken);
    expect(after.body.some((item) => item.car_id === carId)).toBe(false);
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
    expect(body.codigo).toBe(firstReservationCode);

    // Guarda o novo período para os testes de disponibilidade/cancelamento.
    firstStart = newStart;
    firstEnd = newEnd;
  });

  it('bloqueia confirmação administrativa enquanto o pagamento está pendente', async () => {
    const confirmed = await patch<ReservaBody>(
      app,
      `/reservas/${firstReservationId}`,
      { status: 'confirmada' },
      adminToken,
    );

    expect(confirmed.status).toBe(409);
    expect(confirmed.body.status).not.toBe('confirmada');
  });

  it('admin confirma a reserva paga e congela o período', async () => {
    const paid = await post<{ id: string; status: string }>(app, '/pagamentos/meus', {
      reservation_id: firstReservationId,
      metodo: 'pix',
    }, clientToken);
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('aprovado');
    const paidAgain = await post<{ id: string; status: string }>(app, '/pagamentos/meus', { reservation_id: firstReservationId, metodo: 'pix' }, clientToken);
    expect(paidAgain.status).toBe(201);
    expect(paidAgain.body.id).toBe(paid.body.id);
    const receipt = await get<{ codigoReserva?: string; status: string }>(app, `/pagamentos/${paid.body.id}/comprovante`, clientToken);
    expect(receipt.status).toBe(200);
    expect(receipt.body.codigoReserva).toBe(firstReservationCode);

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
    const car = await post<CarroBody>(app, '/carros', {
      placa: 'RSV2A23', modelo: 'Yaris', marca: 'Toyota', categoria: 'Hatch', ano: 2024, valorDiaria: 42,
    }, adminToken);
    expect(car.status).toBe(201);
    const pickup = futureIso(45);
    const reserved = await post<ReservaBody>(app, '/reservas', {
      dataRetirada: pickup, dataDevolucao: addHours(pickup, 24), client_id: clientId, car_id: car.body.id,
    }, clientToken);
    expect(reserved.status).toBe(201);

    const cancelled = await patch<ReservaBody>(
      app,
      `/reservas/${reserved.body.id}/cancelar`,
      {},
      clientToken,
    );

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelada');

    const again = await patch(
      app,
      `/reservas/${reserved.body.id}/cancelar`,
      {},
      clientToken,
    );
    expect(again.status).toBe(409);

    const updateCancelled = await patch(
      app,
      `/reservas/${reserved.body.id}`,
      { dataDevolucao: addHours(pickup, 25) },
      adminToken,
    );
    expect(updateCancelled.status).toBe(409);

    const availability = await get<DisponibilidadeBody>(
      app,
      queryAvailability(car.body.id, pickup, addHours(pickup, 24)),
      clientToken,
    );

    expect(availability.status).toBe(200);
    expect(availability.body.disponivel).toBe(true);
    expect(availability.body.conflito).toBeNull();
  });

  it('admin cancela reserva não paga sem gerar estorno e notifica o cliente', async () => {
    const start = futureIso(50);
    const created = await post<ReservaBody>(app, '/reservas', {
      dataRetirada: start, dataDevolucao: addHours(start, 24), client_id: clientId, car_id: carId,
    }, clientToken);
    expect(created.status).toBe(201);
    const cancelled = await patch<ReservaBody>(app, `/reservas/${created.body.id}/cancelar`, {}, adminToken);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelada');
    const dataSource = app.get(DataSource);
    const payments = await dataSource.query('SELECT id, status, comprovante_snapshot FROM pagamentos WHERE reservation_id = ?', [created.body.id]) as Array<{ id: string; status: string; comprovante_snapshot: string | null }>;
    const paymentIds = await dataSource.query('SELECT id FROM pagamentos WHERE reservation_id = ?', [created.body.id]) as Array<{ id: string }>;
    const refunds = await dataSource.query('SELECT id FROM estornos WHERE pagamento_id IN (SELECT id FROM pagamentos WHERE reservation_id = ?)', [created.body.id]) as unknown[];
    expect(payments.map((item) => item.status)).toEqual(['cancelado']);
    expect(payments[0].comprovante_snapshot).toBeNull();
    expect((await get(app, `/pagamentos/${payments[0].id}/comprovante`, clientToken)).status).toBe(409);
    expect(refunds).toHaveLength(0);
    const notifications = await get<Array<{ tipo: string; reserva_id: string }>>(app, '/notificacoes', clientToken);
    expect(notifications.body.some((item) => item.tipo === 'reserva_cancelada' && item.reserva_id === created.body.id)).toBe(true);
    expect(notifications.body.some((item) => item.tipo === 'pagamento_cancelado' && item.reserva_id === created.body.id && item.descricao.includes('Não há pagamento pendente'))).toBe(true);
    const pendingForStaff = await get<Array<{ id: string }>>(app, '/pagamentos?status=pendente', adminToken);
    const cancelledForStaff = await get<Array<{ id: string; status: string }>>(app, '/pagamentos?status=cancelado', adminToken);
    const cancelledForClient = await get<Array<{ id: string; status: string }>>(app, '/pagamentos/meus?status=cancelado', clientToken);
    const cancelledForOtherClient = await get<Array<{ id: string }>>(app, '/pagamentos/meus?status=cancelado', otherClientToken);
    const clientAll = await get<Array<{ id: string }>>(app, '/pagamentos/meus', clientToken);
    const today = new Date().toISOString().slice(0, 10);
    const clientByDate = await get<Array<{ id: string; status: string }>>(app, `/pagamentos/meus?status=cancelado&de=${today}&ate=${today}`, clientToken);
    expect(pendingForStaff.body.some((item) => item.id === paymentIds[0].id)).toBe(false);
    expect(cancelledForStaff.body.some((item) => item.id === paymentIds[0].id && item.status === 'cancelado')).toBe(true);
    expect(cancelledForClient.body.some((item) => item.id === paymentIds[0].id)).toBe(true);
    expect(cancelledForOtherClient.body.some((item) => item.id === paymentIds[0].id)).toBe(false);
    expect(clientAll.body.some((item) => item.id === paymentIds[0].id)).toBe(true);
    expect(clientByDate.body.some((item) => item.id === paymentIds[0].id && item.status === 'cancelado')).toBe(true);
    expect((await get(app, '/pagamentos?de=2026-12-30&ate=2026-01-01', adminToken)).status).toBe(400);
  });

  it('admin cancela reserva paga com estorno simulado e preserva o recibo original', async () => {
    const start = futureIso(55);
    const created = await post<ReservaBody>(app, '/reservas', {
      dataRetirada: start, dataDevolucao: addHours(start, 24), client_id: clientId, car_id: carId,
    }, clientToken);
    expect(created.status).toBe(201);
    const payment = await post<{ id: string; status: string; valor: number }>(app, '/pagamentos/meus', {
      reservation_id: created.body.id, metodo: 'cartao_credito',
    }, clientToken);
    expect(payment.body.status).toBe('aprovado');
    const originalReceipt = await get<{ reciboId: string; status: string }>(app, `/pagamentos/${payment.body.id}/comprovante`, clientToken);
    expect(originalReceipt.status).toBe(200);
    const cancelled = await patch<ReservaBody>(app, `/reservas/${created.body.id}/cancelar`, {}, adminToken);
    expect(cancelled.status).toBe(200);
    const dataSource = app.get(DataSource);
    const finance = await dataSource.query('SELECT p.status, e.valor, e.tipo FROM pagamentos p LEFT JOIN estornos e ON e.pagamento_id = p.id WHERE p.id = ?', [payment.body.id]) as Array<{ status: string; valor: number; tipo: string }>;
    expect(finance[0]).toMatchObject({ status: 'estornado', valor: payment.body.valor, tipo: 'simulado' });
    const refundedFilter = await get<Array<{ id: string; status: string }>>(app, '/pagamentos?status=estornado', adminToken);
    const pendingFilter = await get<Array<{ id: string }>>(app, '/pagamentos?status=pendente', adminToken);
    expect(refundedFilter.body.some((item) => item.id === payment.body.id && item.status === 'estornado')).toBe(true);
    expect(pendingFilter.body.some((item) => item.id === payment.body.id)).toBe(false);
    const afterRefundReceipt = await get<{ reciboId: string; status: string }>(app, `/pagamentos/${payment.body.id}/comprovante`, clientToken);
    expect(afterRefundReceipt.status).toBe(200);
    expect(afterRefundReceipt.body.reciboId).toBe(originalReceipt.body.reciboId);
    const notifications = await get<Array<{ tipo: string; reserva_id: string }>>(app, '/notificacoes', clientToken);
    expect(notifications.body.some((item) => item.tipo === 'estorno_realizado' && item.reserva_id === created.body.id)).toBe(true);
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

  it('inativa/reativa cliente, mantém gestão e bloqueia novas reservas pela API', async () => {
    const inactive = await patch<{ user: { active: boolean } }>(
      app,
      `/clientes/${otherClientId}/status`,
      { active: false },
      adminToken,
    );
    expect(inactive.status).toBe(200);
    expect(inactive.body.user.active).toBe(false);

    const listed = await get<Array<{ id: number; user: { active: boolean } }>>(
      app,
      '/clientes',
      adminToken,
    );
    expect(listed.body.find((client) => client.id === otherClientId)?.user.active).toBe(false);

    const start = futureIso(120);
    const rejected = await post(app, '/reservas', {
      dataRetirada: start,
      dataDevolucao: addHours(start, 24),
      client_id: otherClientId,
      car_id: carId,
    }, funcionarioToken);
    expect(rejected.status).toBe(409);

    const reactivated = await patch<{ user: { active: boolean } }>(
      app,
      `/clientes/${otherClientId}/status`,
      { active: true },
      adminToken,
    );
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.user.active).toBe(true);
    const refreshed = await get<Array<{ id: number; user: { active: boolean } }>>(
      app,
      '/clientes',
      adminToken,
    );
    expect(refreshed.body.find((client) => client.id === otherClientId)?.user.active).toBe(true);
  });

  it('exclui logicamente sem apagar cliente vinculado a reservas e histórico', async () => {
    const dataSource = app.get(DataSource);
    const before = await dataSource.query(
      'SELECT COUNT(*) AS total FROM reservas WHERE client_id = ?',
      [clientId],
    ) as Array<{ total: number }>;
    expect(Number(before[0].total)).toBeGreaterThan(0);

    const deleted = await del(app, `/clientes/${clientId}`, adminToken);
    expect(deleted.status).toBe(204);

    const after = await dataSource.query(
      'SELECT COUNT(*) AS total FROM reservas WHERE client_id = ?',
      [clientId],
    ) as Array<{ total: number }>;
    expect(Number(after[0].total)).toBe(Number(before[0].total));
    const client = await dataSource.query(
      'SELECT deleted_at FROM clientes WHERE id = ?',
      [clientId],
    ) as Array<{ deleted_at: string | null }>;
    expect(client[0].deleted_at).not.toBeNull();
  });
});
