import { INestApplication } from '@nestjs/common';

import {
  createTestingApp,
  del,
  ENDERECO,
  get,
  login,
  makeCnpj,
  makeCpf,
  patch,
  post,
} from './helpers.js';

interface AuthBody {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    email: string;
    type: string;
    password?: string;
    client?: { tipo_pessoa: string; cpf?: string | null } | null;
  };
}

interface ClientBody {
  id: number;
  tipo_pessoa: string;
  cnpj?: string | null;
  razao_social?: string | null;
  user: { id: number; email: string; type: string };
  address: { id: number; numero: string; cep: string } | null;
}

interface CarBody {
  id: number;
  placa: string;
  status: string;
  valorDiaria: number;
}

/**
 * Teste de integração do fluxo principal.
 *
 * Sobe o AppModule real (com SQLite em memória e ValidationPipe global) e
 * exercita HTTP de ponta a ponta: registro público, login, autorização por
 * papel, cadastro de cliente PF/PJ, endereço e veículo.
 *
 * O admin inicial é criado pelo SeedAdminService no boot. Os testes rodam em
 * ordem dentro do mesmo arquivo, compartilhando o mesmo banco em memória.
 */
describe('Fluxo principal (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clienteToken: string;
  let clientePjId: number;
  let enderecoId: number;
  let cpfPf: string;

  beforeAll(async () => {
    // `test/setup.ts` removeu os admins do ambiente. Reintroduzimos valores
    // determinísticos para o seed criar um admin conhecido neste teste.
    const adminEmail = 'admin.e2e@locamais.test';
    const adminPassword = 'SenhaAdmin1!';

    process.env.ADMIN_NAME = 'Admin E2E';
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.ADMIN_PASSWORD = adminPassword;

    app = await createTestingApp();
    adminToken = await login(app, adminEmail, adminPassword);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.ADMIN_NAME;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  it('cadastra um cliente PF pelo auto-cadastro público', async () => {
    cpfPf = makeCpf('123456789');

    const { status, body } = await post<AuthBody>(app, '/auth/register', {
      name: 'Maria Silva',
      email: 'maria.e2e@exemplo.com',
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PF',
        cpf: cpfPf,
        data_nascimento: '1990-05-10',
        endereco: ENDERECO,
      },
    });

    expect(status).toBe(201);
    expect(body.token_type).toBe('Bearer');
    expect(body.user.type).toBe('cliente');
    expect(body.user.email).toBe('maria.e2e@exemplo.com');
    expect(body.user.password).toBeUndefined();
    expect(body.user.client?.tipo_pessoa).toBe('PF');

    clienteToken = body.access_token;
  });

  it('retorna o próprio usuário em /auth/me', async () => {
    const { status, body } = await get<{ email: string; password?: string }>(
      app,
      '/auth/me',
      clienteToken,
    );

    expect(status).toBe(200);
    expect(body.email).toBe('maria.e2e@exemplo.com');
    expect(body.password).toBeUndefined();
  });

  it('bloqueia cliente em rotas administrativas (403)', async () => {
    const users = await get(app, '/users', clienteToken);
    expect(users.status).toBe(403);

    const clients = await get(app, '/clients', clienteToken);
    expect(clients.status).toBe(403);

    const carCreate = await post(
      app,
      '/cars',
      {
        placa: 'XYZ9Z99',
        modelo: 'Fiesta',
        marca: 'Ford',
        categoria: 'Hatch',
        ano: 2020,
        valorDiaria: 100,
      },
      clienteToken,
    );
    expect(carCreate.status).toBe(403);

    // Leitura de veículos continua disponível para qualquer autenticado.
    const carList = await get(app, '/cars', clienteToken);
    expect(carList.status).toBe(200);
  });

  it('impede CPF duplicado no auto-cadastro (409)', async () => {
    const { status } = await post(app, '/auth/register', {
      name: 'Outra Pessoa',
      email: 'outra.e2e@exemplo.com',
      password: 'senha-secreta',
      cliente: {
        tipo_pessoa: 'PF',
        cpf: cpfPf,
        data_nascimento: '1991-01-01',
        endereco: ENDERECO,
      },
    });

    expect(status).toBe(409);
  });

  it('admin cadastra cliente PJ pelo endpoint de clientes', async () => {
    const { status, body } = await post<ClientBody>(
      app,
      '/clients',
      {
        name: 'Empresa Exemplo LTDA',
        email: 'empresa.e2e@exemplo.com',
        password: 'senha-secreta',
        cliente: {
          tipo_pessoa: 'PJ',
          cnpj: makeCnpj('112223330001'),
          razao_social: 'Empresa Exemplo LTDA',
          endereco: ENDERECO,
        },
      },
      adminToken,
    );

    expect(status).toBe(201);
    expect(body.tipo_pessoa).toBe('PJ');
    expect(body.user.email).toBe('empresa.e2e@exemplo.com');
    expect(body.address).not.toBeNull();

    if (!body.address) {
      throw new Error('cliente PJ criado sem endereco');
    }

    clientePjId = body.id;
    enderecoId = body.address.id;
  });

  it('admin lista e consulta clientes', async () => {
    const list = await get<ClientBody[]>(app, '/clients', adminToken);
    expect(list.status).toBe(200);
    expect(list.body.some((client) => client.id === clientePjId)).toBe(true);

    const detail = await get<ClientBody>(
      app,
      `/clients/${clientePjId}`,
      adminToken,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(clientePjId);
  });

  it('admin atualiza o endereço do cliente', async () => {
    const { status, body } = await patch<{ numero: string }>(
      app,
      `/addresses/${enderecoId}`,
      { numero: '456' },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.numero).toBe('456');
  });

  it('admin cria conta de funcionario pelo endpoint de usuarios', async () => {
    const created = await post<{
      id: number;
      type: string;
      client: unknown;
    }>(
      app,
      '/users',
      {
        name: 'Funcionario E2E',
        email: 'funcionario.e2e@exemplo.com',
        password: 'senha-secreta',
        type: 'funcionario',
      },
      adminToken,
    );

    expect(created.status).toBe(201);
    expect(created.body.type).toBe('funcionario');
    expect(created.body.client).toBeNull();
  });

  it('endpoint de usuarios recusa cadastro de cliente (400)', async () => {
    const created = await post(
      app,
      '/users',
      {
        name: 'Cliente via Users',
        email: 'cliente.users.e2e@exemplo.com',
        password: 'senha-secreta',
        type: 'cliente',
      },
      adminToken,
    );

    expect(created.status).toBe(400);
  });

  it('admin atualiza os dados cadastrais do cliente PJ', async () => {
    const updated = await patch<ClientBody>(
      app,
      `/clients/${clientePjId}`,
      { razao_social: 'Empresa Exemplo Atualizada LTDA' },
      adminToken,
    );

    expect(updated.status).toBe(200);
    expect(updated.body.razao_social).toBe('Empresa Exemplo Atualizada LTDA');
  });

  it('admin cria, lista, atualiza e remove um veículo disponível', async () => {
    const created = await post<CarBody>(
      app,
      '/cars',
      {
        placa: 'ABC1D23',
        modelo: 'Onix',
        marca: 'Chevrolet',
        categoria: 'Hatch',
        ano: 2024,
        valorDiaria: 120.5,
      },
      adminToken,
    );

    expect(created.status).toBe(201);
    expect(created.body.status).toBe('disponivel');

    const carId = created.body.id;

    const list = await get<CarBody[]>(app, '/cars', adminToken);
    expect(list.status).toBe(200);
    expect(list.body.some((car) => car.id === carId)).toBe(true);

    const updated = await patch<CarBody>(
      app,
      `/cars/${carId}`,
      { valorDiaria: 150 },
      adminToken,
    );
    expect(updated.status).toBe(200);

    const removed = await del(app, `/cars/${carId}`, adminToken);
    expect(removed.status).toBe(204);
  });

  it('não permite remover o endereço de um cliente (409)', async () => {
    const { status } = await del(app, `/addresses/${enderecoId}`, adminToken);
    expect(status).toBe(409);
  });

  it('admin desativa o cliente e o login passa a falhar (401)', async () => {
    const removed = await del(app, `/clients/${clientePjId}`, adminToken);
    expect(removed.status).toBe(204);

    const attempt = await post(app, '/auth/login', {
      email: 'empresa.e2e@exemplo.com',
      password: 'senha-secreta',
    });

    expect(attempt.status).toBe(401);
  });
});
