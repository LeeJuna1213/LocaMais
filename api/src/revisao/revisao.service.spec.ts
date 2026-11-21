import { ConflictException, NotFoundException } from '@nestjs/common';

import { RevisaoService } from './revisao.service.js';
import { CarroService } from '../carro/carro.service.js';
import { Carro } from '../carro/entities/carro.entity.js';
import { Revisao } from './entities/revisao.entity.js';
import { StatusRevisao } from './enums/status-revisao.enum.js';

/**
 * Testes do `RevisaoService`.
 *
 * `redisService` e mantido como objeto de `vi.fn()` para preservar os
 * metodos `.mockResolvedValue` / `.mockRejectedValue` / `.mock.calls` no tipo
 * do TypeScript. Nao ha criacao de segunda conexao ioredis nem novo
 * RedisModule: o `RedisService` global do modulo `redis` e injetado diretamente.
 *
 * O cache e aplicado somente a `verificarRevisaoPeriodica` (GET
 * /revisoes/carro/:carroId/status, TTL 300s, chave
 * `locamais:revisao:carro:{carroId}`). O calculo de status depende de
 * `carro.quilometragem` + ultima revisao por `data DESC`.
 */
describe('RevisaoService', () => {
  let service: RevisaoService;
  let revisoesRepository: any;
  let dataSource: any;
  let transactionManager: any;
  let carroService: CarroService;
  let carroFindOneMock: ReturnType<typeof vi.fn>;
  let redisService: any;
  let cacheInvalidation: any;

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
    const aggregateQuery = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    revisoesRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn().mockImplementation((dto: any) => dto),
      save: vi.fn().mockImplementation((entity: any) => entity),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      createQueryBuilder: vi.fn().mockReturnValue(aggregateQuery),
      aggregateQuery,
    };

    transactionManager = {
      findOne: vi.fn().mockImplementation((entity: unknown) =>
        entity === Carro ? Promise.resolve(mockCarro) : Promise.resolve(null),
      ),
      save: vi.fn().mockImplementation(async (entity: any) => entity),
    };
    dataSource = {
      transaction: vi.fn().mockImplementation(async (cb: any) => {
        return cb(transactionManager);
      }),
    };

    carroFindOneMock = vi.fn().mockResolvedValue(mockCarro);
    carroService = {
      findOne: carroFindOneMock,
      findAll: vi.fn().mockResolvedValue([mockCarro]),
    } as any;

    redisService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(1),
    };
    cacheInvalidation = {
      invalidateRevisionDependents: vi.fn().mockResolvedValue(undefined),
    };

    service = new RevisaoService(
      revisoesRepository,
      dataSource,
      carroService,
      redisService,
      cacheInvalidation,
    );
  });

  /**
   * Regras de negocio do calculo de status (sem cache). O status e calculado
   * a cada consulta, respeitando intervalo de 10.000 km e margem de 1.000 km.
   */
  describe('verificarRevisaoPeriodica', () => {
    // Veiculo sem nenhuma revisao registrada => SEM_HISTORICO.
    it('deve retornar SEM_HISTORICO quando o veiculo nao possui revisao', async () => {
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(null);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.SEM_HISTORICO);
      expect(resultado.ultimaRevisaoKm).toBeNull();
      expect(resultado.proximaRevisaoPrevista).toBeNull();
    });

    // Quilometragem abaixo do limite => EM_DIA.
    it('deve retornar EM_DIA quando o veiculo nao atingiu o intervalo', async () => {
      mockCarro.quilometragem = 17000;
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.EM_DIA);
      expect(resultado.ultimaRevisaoKm).toBe(10000);
      expect(resultado.proximaRevisaoPrevista).toBe(20000);
    });

    // Dentro da margem de 1.000 km antes do limite => PROXIMA.
    it('deve retornar PROXIMA quando o veiculo esta dentro da margem de 1000 km', async () => {
      mockCarro.quilometragem = 19200;
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.PROXIMA);
      expect(resultado.proximaRevisaoPrevista).toBe(20000);
    });

    // Atingiu ou ultrapassou o limite => PENDENTE.
    it('deve retornar PENDENTE quando o veiculo atingiu o limite', async () => {
      mockCarro.quilometragem = 20500;
      carroService.findOne = vi.fn().mockResolvedValue(mockCarro);
      revisoesRepository.findOne = vi.fn().mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.PENDENTE);
      expect(resultado.proximaRevisaoPrevista).toBe(20000);
    });

    // Veiculo inexistente => NotFoundException, sem acionar o Redis.
    it('deve lançar NotFoundException quando o veiculo nao existe', async () => {
      carroService.findOne = vi.fn().mockRejectedValue(
        new NotFoundException('veiculo com ID 999 nao encontrado'),
      );

      await expect(service.verificarRevisaoPeriodica(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * `verificarRevisaoPeriodica` com cache Redis.
   * Padrao: HIT retorna do Redis sem MySQL; MISS consulta o MySQL e grava com
   * TTL 300. Falhas no Redis fazem fallback para o MySQL e nao bloqueiam a
   * resposta. A autorizacao e tratada no Controller, nao aqui.
   */
  describe('verificarRevisaoPeriodica com cache', () => {
    const statusEmCache = {
      carroId: 1,
      placa: 'ABC-1234',
      quilometragemAtual: 17000,
      ultimaRevisaoKm: 10000,
      proximaRevisaoPrevista: 20000,
      situacao: StatusRevisao.EM_DIA,
    };

    // Cache HIT: devolve o valor do Redis sem consultar CarroService nem Repositorio.
    it('deve retornar dados do cache em HIT sem consultar o MySQL', async () => {
      redisService.get.mockResolvedValue(statusEmCache);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(redisService.get).toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
      );
      expect(carroFindOneMock).not.toHaveBeenCalled();
      expect(revisoesRepository.findOne).not.toHaveBeenCalled();
      expect(resultado).toEqual(statusEmCache);
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 300 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      redisService.get.mockResolvedValue(null);
      const carroFindOne = vi
        .fn()
        .mockResolvedValue({ ...mockCarro, quilometragem: 17000 });
      carroService.findOne = carroFindOne;
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(redisService.get).toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
      );
      expect(carroFindOne).toHaveBeenCalledWith(1);
      expect(revisoesRepository.findOne).toHaveBeenCalledWith({
        where: { carro_id: 1 },
        order: { data: 'DESC' },
      });
      expect(resultado.situacao).toBe(StatusRevisao.EM_DIA);
      expect(redisService.set).toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
        resultado,
        300,
      );
    });

    // O TTL gravado deve ser exatamente 300 segundos (5 minutos).
    it('deve armazenar no cache com TTL de exatamente 300 segundos', async () => {
      redisService.get.mockResolvedValue(null);
      carroService.findOne = vi
        .fn()
        .mockResolvedValue({ ...mockCarro, quilometragem: 17000 });
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      await service.verificarRevisaoPeriodica(1);

      const [, , ttl] = redisService.set.mock.calls[0];
      expect(ttl).toBe(300);
    });

    // O payload armazenado e exatamente o objeto de resposta do endpoint,
    // sem entidades ou dados adicionais.
    it('deve armazenar exatamente o objeto de resposta, sem dados adicionais', async () => {
      redisService.get.mockResolvedValue(null);
      carroService.findOne = vi
        .fn()
        .mockResolvedValue({ ...mockCarro, quilometragem: 15000 });
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);
      const payload = redisService.set.mock.calls[0][1];

      expect(payload).toEqual(resultado);
      expect(Object.keys(payload).sort()).toEqual([
        'carroId',
        'placa',
        'proximaRevisaoPrevista',
        'quilometragemAtual',
        'situacao',
        'ultimaRevisaoKm',
      ]);
    });

    // Falha de leitura do Redis: segue para o MySQL normalmente.
    it('deve fazer fallback para o MySQL quando o Redis falhar na leitura', async () => {
      redisService.get.mockRejectedValue(new Error('Redis indisponível'));
      const carroFindOne = vi
        .fn()
        .mockResolvedValue({ ...mockCarro, quilometragem: 17000 });
      carroService.findOne = carroFindOne;
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(carroFindOne).toHaveBeenCalledWith(1);
      expect(resultado.situacao).toBe(StatusRevisao.EM_DIA);
    });

    // Falha de gravacao no Redis: nao impede o retorno da resposta.
    it('nao deve impedir o retorno quando o Redis falhar na gravacao', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('Redis indisponível'));
      carroService.findOne = vi
        .fn()
        .mockResolvedValue({ ...mockCarro, quilometragem: 17000 });
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      const resultado = await service.verificarRevisaoPeriodica(1);

      expect(resultado.situacao).toBe(StatusRevisao.EM_DIA);
    });
  });

  /**
   * `create` registra uma revisao, atualiza `carro.quilometragem` e, apos o
   * commit no MySQL, invalida `locamais:revisao:carro:{carroId}`.
   */
  describe('create', () => {
    const dto = {
      data: '2026-11-10T10:00:00.000Z',
      descricao: 'Troca de oleo e filtros',
      km: 15000,
      valor: 250,
      carroId: 1,
    };

    // Criacao bem-sucedida atualiza a quilometragem do carro.
    it('deve registrar uma revisao com sucesso e atualizar quilometragem do carro', async () => {
      let transactionCommitted = false;
      dataSource.transaction.mockImplementation(async (cb: any) => {
        const result = await cb(transactionManager);
        transactionCommitted = true;
        return result;
      });
      redisService.del.mockImplementation(async () => {
        expect(transactionCommitted).toBe(true);
        return 1;
      });
      cacheInvalidation.invalidateRevisionDependents.mockImplementation(async () => {
        expect(transactionCommitted).toBe(true);
      });
      transactionManager.findOne.mockImplementation((entity: unknown) =>
        entity === Carro ? Promise.resolve(mockCarro) : Promise.resolve(null),
      );
      mockCarro.quilometragem = 10000;

      const resultado = await service.create(dto);

      expect(resultado.descricao).toBe(dto.descricao);
      expect(resultado.km).toBe(dto.km);
      expect(resultado.valor).toBe(dto.valor);
      expect(mockCarro.quilometragem).toBe(dto.km);
      expect(transactionManager.findOne).toHaveBeenNthCalledWith(1, Carro, {
        where: { id: dto.carroId },
      });
      expect(transactionManager.findOne).toHaveBeenNthCalledWith(2, Revisao, {
        where: { carro_id: dto.carroId },
        order: { data: 'DESC' },
      });
      expect(carroFindOneMock).not.toHaveBeenCalled();
      expect(transactionManager.save).toHaveBeenCalledTimes(2);
      expect(transactionManager.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ carro_id: dto.carroId }));
      expect(transactionManager.save).toHaveBeenNthCalledWith(2, mockCarro);
      expect(cacheInvalidation.invalidateRevisionDependents).toHaveBeenCalledWith(dto.carroId);
    });

    // A criacao altera a ultima revisao e a quilometragem => invalida o cache.
    it('deve invalidar o cache do status do carro apos criar revisao', async () => {
      transactionManager.findOne.mockImplementation((entity: unknown) =>
        entity === Carro
          ? Promise.resolve({ ...mockCarro, quilometragem: 10000 })
          : Promise.resolve(null),
      );

      await service.create(dto);

      expect(redisService.del).toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
      );
      expect(cacheInvalidation.invalidateRevisionDependents).toHaveBeenCalledWith(1);
    });

    // Se a criacao falhar no MySQL (km invalido), nada e gravado e nada e
    // invalidado no Redis.
    it('nao deve invalidar o cache quando a criacao falhar', async () => {
      transactionManager.findOne.mockImplementation((entity: unknown) =>
        entity === Carro ? Promise.resolve(mockCarro) : Promise.resolve(mockUltimaRevisao),
      );

      const dtoInvalido = {
        data: '2026-11-10T10:00:00.000Z',
        descricao: 'Troca de oleo e filtros',
        km: 5000, // inferior a 10000 da ultima revisao
        valor: 250,
        carroId: 1,
      };

      await expect(service.create(dtoInvalido)).rejects.toThrow(ConflictException);

      expect(transactionManager.save).not.toHaveBeenCalled();
      expect(redisService.del).not.toHaveBeenCalled();
      expect(cacheInvalidation.invalidateRevisionDependents).not.toHaveBeenCalled();
    });

    // Regra de negocio: km nao pode ser inferior ao da ultima revisao.
    it('deve impedir revisao com km inferior à ultima revisão', async () => {
      transactionManager.findOne.mockImplementation((entity: unknown) =>
        entity === Carro ? Promise.resolve(mockCarro) : Promise.resolve(mockUltimaRevisao),
      );

      const dtoInvalido = {
        data: '2026-11-10T10:00:00.000Z',
        descricao: 'Troca de oleo e filtros',
        km: 5000, // inferior a 10000 da ultima revisao
        valor: 250,
        carroId: 1,
      };

      await expect(service.create(dtoInvalido)).rejects.toThrow(ConflictException);
    });

    // Carro inexistente => NotFoundException, sem invalidar cache.
    it('deve lançar NotFoundException quando o carro nao existe', async () => {
      transactionManager.findOne.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(transactionManager.save).not.toHaveBeenCalled();
      expect(redisService.del).not.toHaveBeenCalled();
    });

    // Falha na invalidação nao desfaz a criacao ja confirmada no MySQL.
    it('nao deve impedir a criacao quando a invalidacao falhar no Redis', async () => {
      transactionManager.findOne.mockImplementation((entity: unknown) =>
        entity === Carro
          ? Promise.resolve({ ...mockCarro, quilometragem: 10000 })
          : Promise.resolve(null),
      );
      redisService.del.mockRejectedValue(new Error('Redis indisponível'));

      await expect(service.create(dto)).resolves.toBeDefined();
    });

    it('não invalida caches se a transação falhar antes do commit', async () => {
      dataSource.transaction.mockRejectedValue(new Error('falha de persistência'));

      await expect(service.create(dto)).rejects.toThrow('falha de persistência');

      expect(redisService.del).not.toHaveBeenCalled();
      expect(cacheInvalidation.invalidateRevisionDependents).not.toHaveBeenCalled();
    });
  });

  /**
   * `update` e `remove` invalidadam `locamais:revisao:carro:{carroId}` apos
   * a escrita ser confirmada no MySQL. A `data` da revisao pode alterar qual
   * e a ultima considerada no calculo, portanto qualquer update invalida.
   */
  describe('update e remove com invalidacao de cache', () => {
    // Mudanca na revisao pode alterar a ultima considerada => invalida o cache.
    it('deve invalidar o cache do status do carro apos atualizar revisao', async () => {
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      await service.update('rev-ultima', { descricao: 'Nova descricao' });

      expect(revisoesRepository.update).toHaveBeenCalledWith(
        { id: 'rev-ultima' },
        { descricao: 'Nova descricao' },
      );
      expect(redisService.del).toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
      );
      expect(cacheInvalidation.invalidateRevisionDependents).toHaveBeenCalledWith(1);
    });

    // Exclusao pode alterar a ultima revisao => invalida o cache.
    it('deve invalidar o cache do status do carro apos remover revisao', async () => {
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      await service.remove('rev-ultima');

      expect(revisoesRepository.remove).toHaveBeenCalledWith(
        mockUltimaRevisao,
      );
      expect(redisService.del).toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
      );
    });

    // Revisao inexistente => NotFoundException antes de qualquer gravacao/invalidacao.
    it('nao deve invalidar o cache quando a revisao nao existir', async () => {
      revisoesRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('inexistente', { descricao: 'Nova' }),
      ).rejects.toThrow(NotFoundException);
      await expect(service.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );

      expect(redisService.del).not.toHaveBeenCalled();
      expect(cacheInvalidation.invalidateRevisionDependents).not.toHaveBeenCalled();
    });

    // Falha na invalidação nao desfaz a atualizacao confirmada no MySQL.
    it('deve retornar a revisao atualizada mesmo quando a invalidacao falhar', async () => {
      const revisaoAtualizada = {
        ...mockUltimaRevisao,
        descricao: 'Atualizada',
      };
      revisoesRepository.findOne
        .mockResolvedValueOnce(mockUltimaRevisao)
        .mockResolvedValueOnce(revisaoAtualizada);
      redisService.del.mockRejectedValue(new Error('Redis indisponível'));

      const resultado = await service.update('rev-ultima', {
        descricao: 'Atualizada',
      });

      expect(resultado).toEqual(revisaoAtualizada);
    });

    // Falha na invalidação nao impede a remocao confirmada no MySQL.
    it('nao deve impedir a remocao quando a invalidacao falhar no Redis', async () => {
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);
      redisService.del.mockRejectedValue(new Error('Redis indisponível'));

      await expect(service.remove('rev-ultima')).resolves.toBeUndefined();
      expect(revisoesRepository.remove).toHaveBeenCalledWith(
        mockUltimaRevisao,
      );
    });
  });

  /**
   * `consultarSituacaoRevisaoVeiculos` lista o status de todos os veiculos,
   * reaproveitando o cache de cada carro (cada `verificarRevisaoPeriodica`
   * consulta o Redis primeiro). O formato de retorno e preservado.
   */
  describe('consultarSituacaoRevisaoVeiculos com cache', () => {
    // Segunda chamada encontra o cache e nao consulta o MySQL novamente.
    it('deve preservar o formato de resposta e reaproveitar o cache entre os veiculos', async () => {
      redisService.get = vi.fn().mockImplementation(async () => valorCacheado);
      redisService.set = vi.fn().mockImplementation(
        async (_key: string, valor: any) => {
          valorCacheado = valor;
        },
      );
      let valorCacheado: any = null;

      const carroFindOne = vi.fn().mockResolvedValue({
        ...mockCarro,
        quilometragem: 17000,
      });
      carroService.findOne = carroFindOne;
      revisoesRepository.findOne.mockResolvedValue(mockUltimaRevisao);

      const primeiro = await service.consultarSituacaoRevisaoVeiculos();
      const segundo = await service.consultarSituacaoRevisaoVeiculos();

      expect(primeiro).toHaveLength(1);
      expect(primeiro[0]).toEqual({
        carroId: 1,
        placa: 'ABC-1234',
        quilometragemAtual: 17000,
        ultimaRevisaoKm: 10000,
        proximaRevisaoPrevista: 20000,
        situacao: StatusRevisao.EM_DIA,
      });
      // O segundo consulta encontra o cache e nao consulta o MySQL novamente.
      expect(segundo).toEqual(primeiro);
      expect(carroFindOne).toHaveBeenCalledTimes(1);
      expect(revisoesRepository.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('relatório de custos de revisão', () => {
    it('agrupa registros distintos por veículo e soma os custos reais sem NaN', async () => {
      const query = revisoesRepository.aggregateQuery;
      query.getRawMany.mockResolvedValue([
        { carro_id: '1', quantidade: '3', total: '1250.00' },
        { carro_id: 2, quantidade: '2', total: '850.00' },
        { carro_id: 3, quantidade: '1', total: null },
      ]);

      await expect(service.resumirCustosPorVeiculo()).resolves.toEqual({
        porVeiculo: [
          { carro_id: 1, quantidade: 3, total: 1250 },
          { carro_id: 2, quantidade: 2, total: 850 },
          { carro_id: 3, quantidade: 1, total: 0 },
        ],
        totalGeral: 2100,
        quantidadeGeral: 6,
      });
      expect(query.addSelect).toHaveBeenCalledWith('COUNT(DISTINCT revisao.id)', 'quantidade');
      expect(query.addSelect).toHaveBeenCalledWith('COALESCE(SUM(revisao.valor), 0)', 'total');
    });
  });
});
