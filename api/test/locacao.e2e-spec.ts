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

interface ClienteBody {
  id: number;
  user: { id: number; email: string; type: string };
}

interface CarroBody {
  id: number;
  placa: string;
  status: string;
  valorDiaria: number;
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
  let reservationCode: string;
  let pendingReservationId: string;
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

    const client = await post<ClienteBody>(
      app,
      '/clientes',
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
    await patch(app, '/clientes/me', {
      telefone: '+5521999991111',
      cnh_numero: '12345678901',
      cnh_validade: '2030-12-31',
    }, clientToken);

    const car = await post<CarroBody>(
      app,
      '/carros',
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
    const created = await post<ReservaBody>(
      app,
      '/reservas',
      { dataRetirada: start, dataDevolucao: end, client_id: clientId, car_id: carId },
      clientToken,
    );
    if (created.status !== 201) {
      throw new Error(`nao foi possivel criar a reserva: ${JSON.stringify(created.body)}`);
    }
    reservationId = created.body.id;
    reservationCode = created.body.codigo;
    expect(reservationCode).toMatch(/^LOC-\d{6,}$/);

    const payment = await post(app, '/pagamentos/meus', { reservation_id: reservationId, metodo: 'pix' }, clientToken);
    if (payment.status !== 201) throw new Error(`nao foi possivel pagar a reserva: ${JSON.stringify(payment.body)}`);

    const confirmed = await patch<ReservaBody>(
      app,
      `/reservas/${reservationId}`,
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
    const pendente = await post<ReservaBody>(
      app,
      '/reservas',
      {
        dataRetirada: futureIso(20),
        dataDevolucao: addHours(futureIso(20), 24),
        client_id: clientId,
        car_id: carId,
      },
      clientToken,
    );
    expect(pendente.status).toBe(201);
    pendingReservationId = pendente.body.id;

    const { status } = await post(
      app,
      '/locacoes',
      { reservation_id: pendente.body.id },
      clientToken,
    );
    expect(status).toBe(409);
  });

  it('não cria locação para reserva cancelada (409)', async () => {
    const paraCancelar = await post<ReservaBody>(
      app,
      '/reservas',
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
      `/reservas/${paraCancelar.body.id}/cancelar`,
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
    const reservations = await get<Array<{ id: string; locacao?: { id: string } | null }>>(
      app,
      '/reservas',
      adminToken,
    );
    expect(reservations.body.find((reservation) => reservation.id === reservationId)?.locacao?.id).toBe(locacaoId);
  });

  it('lista pagamentos apenas do cliente e conserva o snapshot do comprovante aprovado', async () => {
    const created = await post<{ id: string; status: string }>(app, '/pagamentos', {
      locacaoId,
      metodo: 'pix',
      valor: 75,
    }, adminToken);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pendente');

    const pending = await get<Array<{ id: string; status: string }>>(app, '/pagamentos/meus', clientToken);
    expect(pending.status).toBe(200);
    expect(pending.body).toContainEqual(expect.objectContaining({ id: created.body.id, status: 'pendente' }));
    const pendingReceipt = await get(app, `/pagamentos/${created.body.id}/comprovante`, clientToken);
    expect(pendingReceipt.status).toBe(409);

    const confirmed = await patch<{ status: string }>(app, `/pagamentos/${created.body.id}/confirmar`, {}, adminToken);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('aprovado');

    const receipt = await get<{ pagamentoId: string; locacaoId: string; codigoReserva: string; valorPago: number; status: string; cliente: string; veiculo: string; placa: string }>(
      app,
      `/pagamentos/${created.body.id}/comprovante`,
      clientToken,
    );
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      pagamentoId: created.body.id,
      locacaoId,
      codigoReserva: reservationCode,
      valorPago: 75,
      status: 'aprovado',
      cliente: 'Cliente Locacao',
      veiculo: 'Honda Civic',
      placa: 'LOC1A23',
    });

    const other = await post<ClienteBody>(app, '/clientes', {
      name: 'Cliente Sem Pagamentos',
      email: 'sem.pagamentos@exemplo.com',
      password: 'senha-secreta',
      cliente: { tipo_pessoa: 'PF', cpf: makeCpf('876543219'), data_nascimento: '1992-02-02', endereco: ENDERECO },
    }, adminToken);
    expect(other.status).toBe(201);
    const otherToken = await login(app, 'sem.pagamentos@exemplo.com', 'senha-secreta');
    const isolated = await get<Array<{ id: string }>>(app, '/pagamentos/meus', otherToken);
    expect(isolated.status).toBe(200);
    expect(isolated.body).toEqual([]);
    const forbiddenReceipt = await get(app, `/pagamentos/${created.body.id}/comprovante`, otherToken);
    expect(forbiddenReceipt.status).toBe(404);

    const reread = await get<typeof receipt.body>(app, `/pagamentos/${created.body.id}/comprovante`, clientToken);
    expect(reread.body).toEqual(receipt.body);
  });

  it('cliente não cria locação para reserva de outro cliente (403)', async () => {
    const outraReserva = await post<ReservaBody>(
      app,
      '/reservas',
      {
        dataRetirada: futureIso(30),
        dataDevolucao: addHours(futureIso(30), 24),
        client_id: clientId,
        car_id: carId,
      },
      adminToken,
    );
    expect(outraReserva.status).toBe(201);
    const otherPayment = await post(app, '/pagamentos/meus', { reservation_id: outraReserva.body.id, metodo: 'pix' }, clientToken);
    expect(otherPayment.status).toBe(201);
    await patch<ReservaBody>(
      app,
      `/reservas/${outraReserva.body.id}`,
      { status: 'confirmada' },
      adminToken,
    );

    await post<ClienteBody>(
      app,
      '/clientes',
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
      { descricaoAvaria: 'Risco profundo na porta traseira direita e pequeno amassado próximo à maçaneta.' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.status).toBe('concluida');
    expect(body.dataRetirada).not.toBeNull();
    expect(body.dataDevolucao).not.toBeNull();
    // Devolvido dentro do prazo: o adicional é zero, então o total continua o da reserva.
    expect(body.valorTotal).toBeCloseTo(300, 2);
  });

  it('consulta e edita a descrição da avaria persistida como vistoria de devolução', async () => {
    const inspections = await get<Array<{ id: string; tipo: string; observacoes: string }>>(
      app,
      `/vistorias/locacao/${locacaoId}`,
      adminToken,
    );
    expect(inspections.status).toBe(200);
    expect(inspections.body).toHaveLength(1);
    expect(inspections.body[0]).toMatchObject({
      tipo: 'devolucao',
      observacoes: 'Risco profundo na porta traseira direita e pequeno amassado próximo à maçaneta.',
    });

    const edited = await patch<{ observacoes: string }>(app, `/vistorias/${inspections.body[0].id}`, {
      observacoes: 'Descrição revisada: risco na porta traseira direita.',
    }, adminToken);
    expect(edited.status).toBe(200);
    expect(edited.body.observacoes).toBe('Descrição revisada: risco na porta traseira direita.');
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

  it('permite finalizar devolução sem descrição de avaria', async () => {
    const payment = await post(app, '/pagamentos/meus', { reservation_id: pendingReservationId, metodo: 'pix' }, clientToken);
    expect(payment.status).toBe(201);
    const confirmed = await patch<ReservaBody>(app, `/reservas/${pendingReservationId}`, { status: 'confirmada' }, adminToken);
    expect(confirmed.status).toBe(200);
    const created = await post<LocacaoBody>(app, '/locacoes', { reservation_id: pendingReservationId }, adminToken);
    expect(created.status).toBe(201);
    const pickup = await patch<LocacaoBody>(app, `/locacoes/${created.body.id}/retirada`, {}, adminToken);
    expect(pickup.status).toBe(200);
    const returned = await patch<LocacaoBody>(app, `/locacoes/${created.body.id}/devolucao`, {}, adminToken);
    expect(returned.status).toBe(200);

    const inspections = await get<Array<{ observacoes: string | null }>>(
      app,
      `/vistorias/locacao/${created.body.id}`,
      adminToken,
    );
    expect(inspections.status).toBe(200);
    expect(inspections.body).toEqual([]);
  });

  it('persiste cancelamento, invalida cache da reserva, preserva histórico e bloqueia devolução', async () => {
    const start = futureIso(40);
    const createdReservation = await post<ReservaBody>(app, '/reservas', {
      dataRetirada: start,
      dataDevolucao: addHours(start, 24),
      client_id: clientId,
      car_id: carId,
    }, clientToken);
    expect(createdReservation.status).toBe(201);
    const payment = await post(app, '/pagamentos/meus', { reservation_id: createdReservation.body.id, metodo: 'pix' }, clientToken);
    expect(payment.status).toBe(201);
    const confirmed = await patch<ReservaBody>(app, `/reservas/${createdReservation.body.id}`, {
      status: 'confirmada',
    }, adminToken);
    expect(confirmed.status).toBe(200);

    const rental = await post<LocacaoBody>(app, '/locacoes', {
      reservation_id: createdReservation.body.id,
    }, adminToken);
    expect(rental.status).toBe(201);
    expect(rental.body.status).toBe('aguardando_retirada');

    // Popula a leitura de reserva antes da transição; o GET posterior deve
    // reconstruir os dados após a invalidação feita depois do save no banco.
    const cachedReservation = await get<{ id: string; status: string; locacao: { status: string } }>(
      app, `/reservas/${createdReservation.body.id}`, adminToken,
    );
    expect(cachedReservation.status).toBe(200);

    const cancelled = await patch<LocacaoBody>(app, `/locacoes/${rental.body.id}`, {
      status: 'cancelada',
    }, adminToken);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelada');

    const reread = await get<LocacaoBody>(app, `/locacoes/${rental.body.id}`, adminToken);
    expect(reread.status).toBe(200);
    expect(reread.body.status).toBe('cancelada');

    const reservationAfter = await get<{ id: string; status: string; locacao: { status: string } }>(
      app, `/reservas/${createdReservation.body.id}`, adminToken,
    );
    expect(reservationAfter.status).toBe(200);
    // Os ciclos são independentes: cancelar a locação não cancela a reserva.
    expect(reservationAfter.body.status).toBe('confirmada');
    expect(reservationAfter.body.locacao.status).toBe('cancelada');

    const history = await get<LocacaoBody[]>(app, '/locacoes', adminToken);
    expect(history.body).toContainEqual(expect.objectContaining({ id: rental.body.id, status: 'cancelada' }));

    const returnAttempt = await patch(app, `/locacoes/${rental.body.id}/devolucao`, {}, adminToken);
    expect(returnAttempt.status).toBe(409);
  });
});
