import { ConflictException, NotFoundException } from '@nestjs/common';
import { Carro } from '../carro/entities/carro.entity.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { TipoVistoria } from './enums/tipo-vistoria.enum.js';
import { VistoriaService } from './vistoria.service.js';

describe('VistoriaService - inspeções periódicas por veículo', () => {
  let service: VistoriaService;
  let manager: any;
  let dataSource: any;
  let vistoriasRepository: any;
  let redis: any;
  let cacheInvalidation: any;
  let reportBuilder: any;
  const carro = {
    id: 12, placa: 'TESTE12', modelo: 'Carro isolado', marca: 'LocaMais',
    quilometragem: 50000, proximaVistoriaKm: 50000,
  };

  beforeEach(() => {
    Object.assign(carro, { quilometragem: 50000, proximaVistoriaKm: 50000 });
    manager = {
      findOne: vi.fn().mockResolvedValue(carro),
      save: vi.fn().mockImplementation(async (entity: any) => entity),
    };
    dataSource = {
      transaction: vi.fn(async (work: (tx: any) => unknown) => work(manager)),
      getRepository: vi.fn(() => ({ findOne: vi.fn().mockResolvedValue(carro) })),
    };
    reportBuilder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
    };
    vistoriasRepository = {
      create: vi.fn((value: any) => value),
      find: vi.fn().mockResolvedValue([]),
      createQueryBuilder: vi.fn(() => reportBuilder),
    };
    redis = { del: vi.fn().mockResolvedValue(1) };
    cacheInvalidation = { invalidateCarDependents: vi.fn().mockResolvedValue(undefined) };
    service = new VistoriaService(vistoriasRepository, {} as any, redis, dataSource, cacheInvalidation);
  });

  it('registra vistoria concluída, atualiza o odômetro e define próximo limite individual', async () => {
    const result = await service.createForVehicle({
      carroId: 12,
      data: '2026-11-23T12:00:00.000Z',
      descricao: 'Inspeção fictícia isolada',
      km: 50000,
      valor: 185.5,
      proximaVistoriaKm: 61000,
    });

    expect(manager.findOne).toHaveBeenCalledWith(Carro, { where: { id: 12 } });
    expect(result).toMatchObject({ tipo: TipoVistoria.PERIODICA, carro_id: 12, km: 50000, valor: 185.5 });
    expect(manager.save).toHaveBeenCalledTimes(2);
    expect(carro).toMatchObject({ quilometragem: 50000, proximaVistoriaKm: 61000 });
    expect(redis.del).toHaveBeenCalledWith('locamais:carro:12');
    expect(cacheInvalidation.invalidateCarDependents).toHaveBeenCalledWith(12);
  });

  it('não permite registrar quilometragem de vistoria abaixo do odômetro oficial', async () => {
    carro.quilometragem = 50001;
    await expect(service.createForVehicle({
      carroId: 12, data: '2026-11-23', descricao: 'Teste', km: 50000,
      valor: 100, proximaVistoriaKm: 60000,
    })).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('retorna 404 para veículo inexistente e não grava vistoria', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.createForVehicle({
      carroId: 999, data: '2026-11-23', descricao: 'Teste', km: 0,
      valor: 0, proximaVistoriaKm: 10000,
    })).rejects.toThrow(NotFoundException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('limita o histórico administrativo ao veículo informado', async () => {
    const actor = { id: 1, type: TipoUsuario.ADMIN } as any;
    await service.findByCarro(actor, 12);
    expect(vistoriasRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { carro_id: 12, tipo: TipoVistoria.PERIODICA },
    }));
  });

  it('agrupa somente vistorias periódicas concluídas no intervalo e preserva cada despesa', async () => {
    reportBuilder.getMany.mockResolvedValue([{
      id: 'v-1', tipo: TipoVistoria.PERIODICA, carro_id: 12, data: new Date('2026-11-10T12:00:00Z'),
      observacoes: 'Inspeção fictícia', km: 50000, valor: '185.50',
      carro: { id: 12, modelo: 'HB20', marca: 'Hyundai', placa: 'TESTE12' },
    }]);
    const report = await service.resumirCustosPorVeiculo({ de: '2026-11-01', ate: '2026-11-30' });
    expect(reportBuilder.where).toHaveBeenCalledWith('vistoria.tipo = :tipo', { tipo: TipoVistoria.PERIODICA });
    expect(reportBuilder.andWhere).toHaveBeenCalledWith('vistoria.data >= :de', { de: new Date('2026-11-01T00:00:00.000Z') });
    expect(reportBuilder.andWhere).toHaveBeenCalledWith('vistoria.data <= :ate', { ate: new Date('2026-11-30T23:59:59.999Z') });
    expect(report).toMatchObject({ totalGeral: 185.5, quantidadeGeral: 1 });
    expect(report.porVeiculo[0]).toMatchObject({ modelo: 'Hyundai HB20', placa: 'TESTE12', total: 185.5, quantidade: 1 });
    expect(report.porVeiculo[0].vistorias).toHaveLength(1);
  });
});
