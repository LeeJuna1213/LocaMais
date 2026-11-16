import { ConflictException, NotFoundException } from '@nestjs/common';

import { CarroService } from './carro.service.js';
import { StatusVeiculo } from './enums/status-veiculo.enum.js';

describe('CarroService', () => {
  let service: CarroService;
  let carrosRepository: any;
  let reservasRepository: any;
  let redisService: any;
  let cacheInvalidation: any;

  const mockCarro = {
    id: 1,
    placa: 'ABC-1234',
    modelo: 'Sedan',
    marca: 'Marca',
    categoria: 'Economico',
    ano: 2025,
    status: StatusVeiculo.DISPONIVEL,
    valorDiaria: 100,
    quilometragem: 15000,
  };

  beforeEach(() => {
    carrosRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(mockCarro),
      exists: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockImplementation((dto: any) => dto),
      save: vi.fn().mockImplementation((entity: any) => entity),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    reservasRepository = {
      exists: vi.fn().mockResolvedValue(false),
    };

    redisService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(1),
    };
    cacheInvalidation = {
      invalidateCarDependents: vi.fn().mockResolvedValue(undefined),
    };

    service = new CarroService(
      carrosRepository,
      reservasRepository,
      redisService,
      cacheInvalidation,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Cache HIT / MISS no metodo `findOne` (GET /carros/:id, TTL 60s).
   * Estes testes explicam o contrato: HIT evita MySQL; MISS busca no MySQL e
   * tenta popular Redis. O Redis não é a fonte oficial nem pode derrubar GET.
   */
  describe('findOne com cache', () => {
    // Cache HIT: devolve o valor do Redis sem consultar o repositorio MySQL.
    it('deve retornar dados do cache em HIT sem consultar o MySQL', async () => {
      redisService.get.mockResolvedValue(mockCarro);

      const resultado = await service.findOne(1);

      expect(redisService.get).toHaveBeenCalledWith('locamais:carro:1');
      expect(carrosRepository.findOne).not.toHaveBeenCalled();
      expect(resultado).toEqual(mockCarro);
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 60 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      const resultado = await service.findOne(1);

      expect(redisService.get).toHaveBeenCalledWith('locamais:carro:1');
      expect(carrosRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(redisService.set).toHaveBeenCalledWith(
        'locamais:carro:1',
        resultado,
        60,
      );
      expect(resultado).toEqual(mockCarro);
    });

    // O TTL gravado deve ser exatamente 60 segundos.
    it('deve armazenar no cache com TTL de exatamente 60 segundos', async () => {
      redisService.get.mockResolvedValue(null);

      await service.findOne(1);

      const [, , ttl] = redisService.set.mock.calls[0];
      expect(ttl).toBe(60);
    });

    // Falha de leitura do Redis: segue para o MySQL normalmente.
    it('deve fazer fallback para MySQL quando o Redis falhar na leitura', async () => {
      redisService.get.mockRejectedValue(new Error('Redis indisponível'));
      redisService.set.mockResolvedValue(undefined);

      const resultado = await service.findOne(1);

      expect(carrosRepository.findOne).toHaveBeenCalled();
      expect(resultado).toEqual(mockCarro);
    });

    // Falha de gravacao no Redis: nao impede o retorno dos dados do MySQL.
    it('nao deve impedir o retorno quando o Redis falhar na gravacao', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('Redis indisponível'));

      const resultado = await service.findOne(1);

      expect(carrosRepository.findOne).toHaveBeenCalled();
      expect(resultado).toEqual(mockCarro);
    });

    // Carro inexistente: nem cache nem MySQL retornam dado => 404.
    it('deve retornar 404 quando carro nao existe em cache nem no MySQL', async () => {
      redisService.get.mockResolvedValue(null);
      carrosRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);

      expect(redisService.get).toHaveBeenCalledWith('locamais:carro:999');
      expect(carrosRepository.findOne).toHaveBeenCalledWith({
        where: { id: 999 },
      });
    });
  });

  describe('update', () => {
    // Toda edição muda a resposta do carro; só a troca de placa afeta revisão.
    it('deve atualizar o veiculo e invalidar o cache de revisao quando a placa muda', async () => {
      const dto = { placa: 'XYZ-9999' };

      const resultado = await service.update(1, dto);

      expect(carrosRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { placa: 'XYZ-9999' },
      );
      expect(resultado).toBe(mockCarro);
      // A placa faz parte da resposta do status de revisao em cache.
      expect(redisService.del).toHaveBeenCalledWith('locamais:revisao:carro:1');
      expect(cacheInvalidation.invalidateCarDependents).toHaveBeenCalledWith(1);
    });

    it('deve invalidar o cache do carro apos update bem-sucedido', async () => {
      const dto = { modelo: 'SUV' };

      await service.update(1, dto);

      expect(redisService.del).toHaveBeenCalledWith('locamais:carro:1');
    });

    it('nao deve invalidar o cache de revisao quando a placa nao muda', async () => {
      const dto = { modelo: 'SUV' };

      await service.update(1, dto);

      expect(carrosRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { modelo: 'SUV' },
      );
      expect(redisService.del).not.toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
      );
    });

    it('nao deve invalidar o cache de revisao quando a placa e informada igual à atual', async () => {
      const dto = { placa: 'ABC-1234' };

      await service.update(1, dto);

      expect(carrosRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { placa: 'ABC-1234' },
      );
      expect(redisService.del).not.toHaveBeenCalledWith(
        'locamais:revisao:carro:1',
      );
    });

    it('nao deve invalidar a chave quando a atualizacao falhar no MySQL', async () => {
      carrosRepository.update = vi
        .fn()
        .mockRejectedValue(new Error('db error'));
      carrosRepository.findOne = vi.fn().mockResolvedValue(mockCarro);

      const dto = { placa: 'XYZ-9999' };

      await expect(service.update(1, dto)).rejects.toThrow();
      expect(redisService.del).not.toHaveBeenCalled();
      expect(cacheInvalidation.invalidateCarDependents).not.toHaveBeenCalled();
    });

    it('nao deve impedir a atualizacao quando a invalidacao falhar no Redis', async () => {
      const carroAtualizado = { ...mockCarro, placa: 'XYZ-9999' };
      carrosRepository.findOne = vi.fn().mockResolvedValue(carroAtualizado);
      carrosRepository.update = vi.fn().mockResolvedValue(undefined);
      redisService.del = vi
        .fn()
        .mockRejectedValue(new Error('Redis indisponível'));

      const dto = { placa: 'XYZ-9999' };

      const resultado = await service.update(1, dto);

      expect(carrosRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { placa: 'XYZ-9999' },
      );
      expect(resultado).toBe(carroAtualizado);
    });

    it('deve lançar NotFoundException sem invalidar quando o veiculo nao existe', async () => {
      carrosRepository.findOne = vi.fn().mockResolvedValue(null);

      await expect(service.update(1, { placa: 'XYZ-9999' })).rejects.toThrow(
        NotFoundException,
      );
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    // Só depois do DELETE confirmado removemos ambas as representações em cache.
    it('deve remover o veiculo e invalidar o cache de revisao e do carro', async () => {
      await service.remove(1);

      expect(carrosRepository.delete).toHaveBeenCalledWith({ id: 1 });
      expect(redisService.del).toHaveBeenCalledWith('locamais:revisao:carro:1');
      expect(redisService.del).toHaveBeenCalledWith('locamais:carro:1');
    });

    it('nao deve invalidar a chave quando a exclusao falhar no MySQL', async () => {
      carrosRepository.delete = vi
        .fn()
        .mockRejectedValue(new Error('db error'));

      await expect(service.remove(1)).rejects.toThrow();
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('nao deve impedir a exclusao quando a invalidacao falhar no Redis', async () => {
      redisService.del = vi
        .fn()
        .mockRejectedValue(new Error('Redis indisponível'));

      await expect(service.remove(1)).resolves.toBeUndefined();
      expect(carrosRepository.delete).toHaveBeenCalledWith({ id: 1 });
    });

    it('deve lançar NotFoundException sem invalidar quando o veiculo nao existe', async () => {
      carrosRepository.findOne = vi.fn().mockResolvedValue(null);

      await expect(service.remove(1)).rejects.toThrow(NotFoundException);
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('deve lançar ConflictException sem invalidar quando o veiculo nao estiver disponivel', async () => {
      carrosRepository.findOne = vi.fn().mockResolvedValue({
        ...mockCarro,
        status: StatusVeiculo.ALUGADO,
      });

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('deve lançar ConflictException sem invalidar quando o veiculo possuir reservas', async () => {
      reservasRepository.exists = vi.fn().mockResolvedValue(true);

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });
});
