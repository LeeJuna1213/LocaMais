import { INestApplication } from '@nestjs/common';
import { createTestingApp, get, login, post } from './helpers.js';

interface VehicleResponse {
  id: number;
  quilometragem: number;
  proximaVistoriaKm: number | null;
  vistoriaPendente: boolean;
}

describe('Vistorias periódicas por veículo (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let clientToken: string;
  let carId: number;
  let overLimitCarId: number;

  beforeAll(async () => {
    process.env.ADMIN_NAME = 'Admin Vistorias Periódicas';
    process.env.ADMIN_EMAIL = 'admin.vistoria-periodica@locamais.test';
    process.env.ADMIN_PASSWORD = 'SenhaAdmin1!';
    app = await createTestingApp();
    adminToken = await login(app, process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);

    const client = await post<{ id: number }>(app, '/clientes', {
      name: 'Cliente sem acesso à gestão de vistorias',
      email: 'cliente.vistoria-periodica@locamais.test',
      password: 'senha-teste-segura',
      cliente: { tipo_pessoa: 'PF', cpf: '52998224725', data_nascimento: '1990-01-01', endereco: {
        logradouro: 'Rua de teste', numero: '1', bairro: 'Centro', cidade: 'Niteroi', uf: 'RJ', cep: '24000000',
      } },
    }, adminToken);
    expect(client.status).toBe(201);
    clientToken = await login(app, 'cliente.vistoria-periodica@locamais.test', 'senha-teste-segura');

    const createCar = async (placa: string, nextKm: number): Promise<number> => {
      const result = await post<{ id: number }>(app, '/carros', {
        placa, modelo: 'Veículo controlado de teste', marca: 'LocaMais', categoria: 'Teste',
        ano: 2026, valorDiaria: 100, proximaVistoriaKm: nextKm,
      }, adminToken);
      expect(result.status).toBe(201);
      return result.body.id;
    };
    carId = await createCar('VTST001', 50000);
    overLimitCarId = await createCar('VTST002', 60000);
  }, 30000);

  afterAll(async () => {
    await app?.close();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_NAME;
  });

  it('detecta abaixo do limite, limite exato e quilometragem acima do limite com dados de teste isolados', async () => {
    const under = await post(app, '/revisoes', {
      data: '2026-11-01T10:00:00.000Z', descricao: 'Odômetro de teste abaixo do limite', km: 49999, valor: 0, carroId: carId,
    }, adminToken);
    expect(under.status).toBe(201);
    expect((await get<VehicleResponse>(app, `/carros/${carId}`, adminToken)).body.vistoriaPendente).toBe(false);

    const exact = await post(app, '/revisoes', {
      data: '2026-11-02T10:00:00.000Z', descricao: 'Odômetro de teste no limite', km: 50000, valor: 0, carroId: carId,
    }, adminToken);
    expect(exact.status).toBe(201);
    expect((await get<VehicleResponse>(app, `/carros/${carId}`, adminToken)).body).toMatchObject({
      quilometragem: 50000, proximaVistoriaKm: 50000, vistoriaPendente: true,
    });

    const over = await post(app, '/revisoes', {
      data: '2026-11-03T10:00:00.000Z', descricao: 'Odômetro acima do limite', km: 65000, valor: 0, carroId: overLimitCarId,
    }, adminToken);
    expect(over.status).toBe(201);
    expect((await get<VehicleResponse>(app, `/carros/${overLimitCarId}`, adminToken)).body).toMatchObject({
      quilometragem: 65000, proximaVistoriaKm: 60000, vistoriaPendente: true,
    });
  });

  it('conclui a vistoria, salva histórico/custo e atualiza o próximo ciclo individual', async () => {
    const result = await post<{
      id: string; tipo: string; carro_id: number; km: number; valor: number; observacoes: string;
    }>(app, '/vistorias/veiculo', {
      carroId: carId, data: '2026-11-23', descricao: 'Vistoria fictícia: freios, pneus e iluminação',
      valor: 185.5, km: 50000, proximaVistoriaKm: 61234,
    }, adminToken);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      tipo: 'periodica', carro_id: carId, km: 50000, valor: 185.5,
      observacoes: 'Vistoria fictícia: freios, pneus e iluminação',
    });

    const vehicle = await get<VehicleResponse>(app, `/carros/${carId}`, adminToken);
    expect(vehicle.body).toMatchObject({ quilometragem: 50000, proximaVistoriaKm: 61234, vistoriaPendente: false });
    const history = await get<Array<{ id: string; carro_id: number; km: number }>>(app, `/vistorias/carro/${carId}`, adminToken);
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ id: result.body.id, carro_id: carId, km: 50000 });

    const report = await get<{ totalGeral: number; quantidadeGeral: number; porVeiculo: Array<{ carro_id: number; total: number; quantidade: number }> }>(
      app, '/vistorias/relatorio/custos?de=2026-11-23&ate=2026-11-23', adminToken,
    );
    expect(report.status).toBe(200);
    expect(report.body.totalGeral).toBe(185.5);
    expect(report.body.quantidadeGeral).toBe(1);
    expect(report.body.porVeiculo).toEqual(expect.arrayContaining([expect.objectContaining({ carro_id: carId, total: 185.5, quantidade: 1 })]));
  });

  it('rejeita acesso administrativo de cliente e leituras sem token', async () => {
    expect((await get(app, `/vistorias/carro/${carId}`, clientToken)).status).toBe(403);
    expect((await get(app, `/vistorias/carro/${carId}`)).status).toBe(401);
    expect((await post(app, '/vistorias/veiculo', {
      carroId: carId, data: '2026-11-23', descricao: 'Tentativa sem autorização', valor: 1, km: 50000, proximaVistoriaKm: 70000,
    }, clientToken)).status).toBe(403);
  });

  it('não grava histórico nem reseta ciclo quando a vistoria é inválida ou veículo não existe', async () => {
    const lowerMileage = await post(app, '/vistorias/veiculo', {
      carroId: carId, data: '2026-11-23', descricao: 'Quilometragem retrocedida', valor: 1, km: 49999, proximaVistoriaKm: 70000,
    }, adminToken);
    expect(lowerMileage.status).toBe(409);
    const missing = await post(app, '/vistorias/veiculo', {
      carroId: 999999, data: '2026-11-23', descricao: 'Veículo inexistente', valor: 1, km: 0, proximaVistoriaKm: 10000,
    }, adminToken);
    expect(missing.status).toBe(404);
    expect((await get<Array<{ id: string }>>(app, `/vistorias/carro/${carId}`, adminToken)).body).toHaveLength(1);
  });
});
