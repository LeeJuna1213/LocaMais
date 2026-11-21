import { ConflictException, NotFoundException } from '@nestjs/common';

import { CarroService } from './carro.service.js';
import { StatusVeiculo } from './enums/status-veiculo.enum.js';

describe('CarroService', () => {
  let service: CarroService;
  let carrosRepository: any;
  let reservasRepository: any;
  let redisService: any;
  let cacheInvalidation: any;
  let fotoStorage: any;

  const mockCarro = {
    id: 1,
    placa: 'ABC-1234',
    modelo: 'Sedan',
    marca: 'Marca',
    categoria: 'Economico',
    lugares: 5,
    descricao: null,
    cambio: 'Manual',
    ano: 2025,
    status: StatusVeiculo.DISPONIVEL,
    valorDiaria: 100,
    quilometragem: 15000,
    foto: null,
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
    fotoStorage = {
      validar: vi.fn().mockReturnValue('.jpg'),
      salvar: vi.fn().mockResolvedValue('/uploads/carros/novo.jpg'),
      remover: vi.fn().mockResolvedValue(undefined),
    };

    service = new CarroService(
      carrosRepository,
      reservasRepository,
      redisService,
      cacheInvalidation,
      fotoStorage,
    );
  });

  describe('fotos', () => {
    const arquivo = {
      originalname: 'imagem.jpg',
      mimetype: 'image/jpeg',
      size: 3,
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    } as Express.Multer.File;

    it('salva foto e invalida carro e reservas após persistir o caminho', async () => {
      carrosRepository.findOne
        .mockResolvedValueOnce({ ...mockCarro, foto: null })
        .mockResolvedValueOnce({ ...mockCarro, foto: '/uploads/carros/novo.jpg' });
      const result = await service.enviarFoto(1, arquivo);
      expect(fotoStorage.salvar).toHaveBeenCalledWith(arquivo);
      expect(carrosRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { foto: '/uploads/carros/novo.jpg' },
      );
      expect(redisService.del).toHaveBeenCalledWith('locamais:carro:1');
      expect(cacheInvalidation.invalidateCarDependents).toHaveBeenCalledWith(1);
      expect(result.foto).toBe('/uploads/carros/novo.jpg');
    });

    it('rejeita carro inexistente sem salvar arquivo', async () => {
      carrosRepository.findOne.mockResolvedValueOnce(null);
      await expect(service.enviarFoto(99, arquivo)).rejects.toThrow(NotFoundException);
      expect(fotoStorage.salvar).not.toHaveBeenCalled();
    });

    it('remove foto antiga somente após persistir a nova', async () => {
      carrosRepository.findOne
        .mockResolvedValueOnce({ ...mockCarro, foto: '/uploads/carros/anterior.jpg' })
        .mockResolvedValueOnce({ ...mockCarro, foto: '/uploads/carros/novo.jpg' });
      await service.enviarFoto(1, arquivo);
      expect(fotoStorage.remover).toHaveBeenCalledWith('/uploads/carros/anterior.jpg');
    });

    it('remove arquivo novo se a persistência do caminho falhar', async () => {
      carrosRepository.update.mockRejectedValueOnce(new Error('MySQL indisponível'));
      await expect(service.enviarFoto(1, arquivo)).rejects.toThrow('MySQL indisponível');
      expect(fotoStorage.remover).toHaveBeenCalledWith('/uploads/carros/novo.jpg');
      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('não desfaz persistência se falhar a remoção física da foto anterior', async () => {
      carrosRepository.findOne
        .mockResolvedValueOnce({ ...mockCarro, foto: '/uploads/carros/anterior.jpg' })
        .mockResolvedValueOnce({ ...mockCarro, foto: '/uploads/carros/novo.jpg' });
      fotoStorage.remover.mockRejectedValueOnce(new Error('arquivo ocupado'));
      await expect(service.enviarFoto(1, arquivo)).resolves.toMatchObject({
        foto: '/uploads/carros/novo.jpg',
      });
    });

    it('remove foto por fluxo dedicado mesmo quando não havia foto', async () => {
      carrosRepository.findOne
        .mockResolvedValueOnce({ ...mockCarro, foto: null })
        .mockResolvedValueOnce({ ...mockCarro, foto: '/uploads/carros/novo.jpg' });
      await service.removerFoto(1);
      expect(carrosRepository.update).toHaveBeenCalledWith({ id: 1 }, { foto: null });
      expect(fotoStorage.remover).toHaveBeenCalledWith(null);
      expect(cacheInvalidation.invalidateCarDependents).toHaveBeenCalledWith(1);
    });

    it('continua após falha Redis ao invalidar foto', async () => {
      redisService.del.mockRejectedValue(new Error('Redis indisponível'));
      carrosRepository.findOne
        .mockResolvedValueOnce({ ...mockCarro, foto: null })
        .mockResolvedValueOnce({ ...mockCarro, foto: '/uploads/carros/novo.jpg' });
      await expect(service.enviarFoto(1, arquivo)).resolves.toMatchObject({
        foto: '/uploads/carros/novo.jpg',
      });
      expect(carrosRepository.update).toHaveBeenCalled();
    });
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
    it('HIT combina dados do Redis com foto atual consultada no MySQL', async () => {
      redisService.get.mockResolvedValue({ ...mockCarro, foto: '/uploads/carros/legada.jpg' });
      carrosRepository.findOne.mockResolvedValue({ id: 1, foto: '/uploads/carros/atual.jpg' });

      const resultado = await service.findOne(1);

      expect(redisService.get).toHaveBeenCalledWith('locamais:carro:1');
      expect(carrosRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { id: true, foto: true },
      });
      expect(resultado.foto).toBe('/uploads/carros/atual.jpg');
      expect(resultado.modelo).toBe(mockCarro.modelo);
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
        expect.objectContaining({ modelo: mockCarro.modelo }),
        60,
      );
      expect(redisService.set.mock.calls[0][1]).not.toHaveProperty('foto');
      expect(carrosRepository.findOne).toHaveBeenCalledTimes(1);
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

    it('retorna foto null no HIT sem tratar o carro como inexistente', async () => {
      redisService.get.mockResolvedValue({ ...mockCarro, foto: '/uploads/antiga.jpg' });
      carrosRepository.findOne.mockResolvedValue({ id: 1, foto: null });
      await expect(service.findOne(1)).resolves.toMatchObject({ foto: null });
    });

    it('não utiliza foto legada se a consulta MySQL falhar no HIT', async () => {
      redisService.get.mockResolvedValue({ ...mockCarro, foto: '/uploads/antiga.jpg' });
      carrosRepository.findOne.mockRejectedValue(new Error('MySQL indisponível'));
      await expect(service.findOne(1)).rejects.toThrow('MySQL indisponível');
    });

    it('retorna 404 no HIT se a projeção não encontrar o carro', async () => {
      redisService.get.mockResolvedValue(mockCarro);
      carrosRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
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
    it('persiste capacidade e descrição recebidas no DTO', async () => {
      await service.update(1, { lugares: 7, descricao: 'SUV com porta-malas amplo' });
      expect(carrosRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { lugares: 7, descricao: 'SUV com porta-malas amplo' },
      );
    });
    it('persiste o câmbio informado sem alterar campos não enviados', async () => {
      await service.update(1, { cambio: 'Automático' });
      expect(carrosRepository.update).toHaveBeenCalledWith({ id: 1 }, { cambio: 'Automático' });
      expect(cacheInvalidation.invalidateCarDependents).toHaveBeenCalledWith(1);
    });

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
    it('consulta o estado atual diretamente no MySQL sem consultar o cache', async () => {
      await service.remove(1);

      expect(carrosRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('usa o status do MySQL mesmo quando o Redis contém outro status', async () => {
      carrosRepository.findOne.mockResolvedValue({
        ...mockCarro,
        status: StatusVeiculo.ALUGADO,
      });
      redisService.get.mockResolvedValue(mockCarro);

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      expect(carrosRepository.delete).not.toHaveBeenCalled();
      expect(redisService.del).not.toHaveBeenCalled();
    });

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
