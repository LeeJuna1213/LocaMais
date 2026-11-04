import { NotFoundException } from '@nestjs/common';

import { RevisaoService } from './revisao.service.js';
import { CarroService } from '../carro/carro.service.js';
import { StatusRevisao } from './enums/status-revisao.enum.js';

describe('RevisaoService', () => {
  let service: RevisaoService;
  let revisoesRepository: any;
  let dataSource: any;
  let carroService: CarroService;

  const mockCarro = {
    id: 1,
    placa: 'ABC-1234',
    modelo: 'Sedan',
    marca: 'Marca',
    categoria: 'Economico',
    ano: 2025,
    status: 'disponivel',
    valorDiaria: 100,
    quilometragem: 15000,
    save: vi.fn(),
  };

  const mockUltimaRevisao = {
    id: 'rev-ultima',
    data: new Date('2026-01-01T00:00:00.000Z'),
    descricao: 'Troca de oleo',
    km: 10000,
    valor: 200,
    carro_id: 1,
  };

  beforeEach(() => {
    revisoesRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn().mockImplementation((dto: any) => dto),
      save: vi.fn().mockImplementation((entity: any) => entity),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: vi.fn().mockImplementation(async (cb: any) => {
        const manager = revisoesRepository;
        return cb(manager);
      }),
    };

    carroService = {
      findOne: vi.fn().mockResolvedValue(mockCarro),
      findAll: vi.fn().mockResolvedValue([mockCarro]),
    } as any;

    service = new RevisaoService(
      revisoesRepository,
      dataSource,
      carroService,
    );
  });

  describe('verificarRevisaoPeriodica', () => {
    it('deve retornar SEM_HISTORICO quando o veiculo nao possui revisao', async () => {
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(null);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.SEM_HISTORICO);
      expect(resultado.ultimaRevisaoKm).toBeNull();
      expect(resultado.proximaRevisaoPrevista).toBeNull();
    });

    it('deve retornar EM_DIA quando o veiculo nao atingiu o intervalo', async () => {
      mockCarro.quilometragem = 17000;
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.EM_DIA);
      expect(resultado.ultimaRevisaoKm).toBe(10000);
      expect(resultado.proximaRevisaoPrevista).toBe(20000);
    });

    it('deve retornar PROXIMA quando o veiculo esta dentro da margem de 1000 km', async () => {
      mockCarro.quilometragem = 19200;
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.PROXIMA);
      expect(resultado.proximaRevisaoPrevista).toBe(20000);
    });

    it('deve retornar PENDENTE quando o veiculo atingiu o limite', async () => {
      mockCarro.quilometragem = 20500;
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.PENDENTE);
      expect(resultado.proximaRevisaoPrevista).toBe(20000);
    });

    it('deve lançar NotFoundException quando o veiculo nao existe', async () => {
      carroService.findOne = vi.fn().mockRejectedValue(
        new NotFoundException('veiculo com ID 999 nao encontrado'),
      );

      await expect(service.verificarRevisaoPeriodica(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const dto = {
      data: '2026-11-10T10:00:00.000Z',
      descricao: 'Troca de oleo e filtros',
      km: 15000,
      valor: 250,
      carroId: 1,
    };

    it('deve registrar uma revisao com sucesso e atualizar quilometragem do carro', async () => {
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(null);
      mockCarro.quilometragem = 10000;

      const resultado = await service.create(dto);

      expect(resultado.descricao).toBe(dto.descricao);
      expect(resultado.km).toBe(dto.km);
      expect(resultado.valor).toBe(dto.valor);
      expect(mockCarro.quilometragem).toBe(dto.km);
    });

    it('deve impedir revisao com km inferior à ultima revisão', async () => {
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(mockUltimaRevisao);

      const dtoInvalido = {
        data: '2026-11-10T10:00:00.000Z',
        descricao: 'Troca de oleo e filtros',
        km: 5000, // inferior a 10000 da ultima revisao
        valor: 250,
        carroId: 1,
      };

      await expect(service.create(dtoInvalido)).rejects.toThrow();
    });

    it('deve lançar NotFoundException quando o carro nao existe', async () => {
      carroService.findOne = vi.fn().mockRejectedValue(
        new NotFoundException('veiculo com ID 999 nao encontrado'),
      );

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });
  });
});
