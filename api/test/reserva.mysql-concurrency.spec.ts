import { INestApplication } from '@nestjs/common';
import {
  createTestingApp,
  ENDERECO,
  login,
  makeCpf,
  post,
} from './helpers.js';

const HOUR = 60 * 60 * 1000;
const future = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe('Reservation serialization (MySQL integration only)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clientId: number;
  let carId: number;

  beforeAll(async () => {
    app = await createTestingApp();
    adminToken = await login(app, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
    const suffix = `${Date.now()}`.slice(-5);
    const client = await post<{ id: number }>(app, '/clientes', {
      name: `Cliente concorrência ${suffix}`,
      email: `cliente-concorrencia-${suffix}@locamais.test`,
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PF', cpf: makeCpf(suffix.padStart(9, '1')),
        data_nascimento: '1990-01-01', endereco: ENDERECO,
      },
    }, adminToken);
    if (client.status !== 201) throw new Error(`Client fixture failed: ${JSON.stringify(client.body)}`);
    clientId = client.body.id;
    const car = await post<{ id: number }>(app, '/carros', {
      placa: `TST${suffix.slice(-1)}A${suffix.slice(-2)}`,
      modelo: 'Corolla', marca: 'Toyota', categoria: 'Sedan', ano: 2024, valorDiaria: 100,
    }, adminToken);
    if (car.status !== 201) throw new Error(`Car fixture failed: ${JSON.stringify(car.body)}`);
    carId = car.body.id;
  }, 30000);

  afterAll(async () => { await app?.close(); });

  it('accepts only one simultaneous overlapping reservation for the same vehicle', async () => {
    const dataRetirada = future(24);
    const dataDevolucao = future(72);
    const payload = { dataRetirada, dataDevolucao, client_id: clientId, car_id: carId };
    const responses = await Promise.all([
      post(app, '/reservas', payload, adminToken),
      post(app, '/reservas', payload, adminToken),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  });
});
