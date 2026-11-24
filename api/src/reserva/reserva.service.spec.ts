import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { ReservaService } from './reserva.service.js';
import { StatusReserva } from './enums/status-reserva.enum.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { RedisService } from '../redis/redis.service.js';

import type { Reserva } from './entities/reserva.entity.js';

/**
 * Testes do `ReservaService`.
 *
 * `mockRedisService` e mantido como objeto de `vi.fn()` para preservar os
 * metodos `.mockResolvedValue` / `.mockRejectedValue` / `.mock.calls` no tipo
 * do TypeScript; o cast `as unknown as RedisService` acontece somente no
 * ponto de injecao do construtor. Nao ha criacao de segunda conexao ioredis.
 */
describe('ReservaService', () => {
  let service: ReservaService;
  let reservasRepository: any;
  let dataSource: any;
  let clienteService: any;
  let carroService: any;
  let redisService: any;
  let cacheInvalidation: any;
  let configuracaoService: any;

  const mockReserva = Object.assign(
    new (class {
      id = 'res-123';
      dataRetirada = new Date('2026-11-10T10:00:00.000Z');
      dataDevolucao = new Date('2026-11-12T10:00:00.000Z');
      status = StatusReserva.PENDENTE;
      valorTotal = 200;
      client_id = 1;
      client = { id: 1, user_id: 1 };
      car_id = 1;
      car = { id: 1, placa: 'ABC-1234', valorDiaria: 100 };
      calcularValor() {
        return 200;
      }
    })(),
    {},
  ) as Reserva;

  const adminActor = {
    id: 1,
    email: 'admin@exemplo.com',
    name: 'Admin',
    type: TipoUsuario.ADMIN,
  } as any;

  const clienteActor = {
    id: 1,
    email: 'cliente@exemplo.com',
    name: 'Cliente',
    type: TipoUsuario.CLIENTE,
  } as any;

  const outroClienteActor = {
    id: 99,
    email: 'outro@exemplo.com',
    name: 'Outro',
    type: TipoUsuario.CLIENTE,
  } as any;

  beforeEach(() => {
    // O cancelamento altera a entidade em memória; restaura o fixture para que
    // cada cenário comece como uma reserva independente e pendente.
    mockReserva.status = StatusReserva.PENDENTE;
    reservasRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(mockReserva),
      create: vi.fn().mockImplementation((dto: any) => dto),
      save: vi.fn().mockImplementation((entity: any) => entity),
      update: vi.fn().mockResolvedValue(undefined),
      getRepository: vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(mockReserva),
        find: vi.fn().mockResolvedValue([]),
        exists: vi.fn().mockResolvedValue(true),
        create: vi.fn().mockImplementation((dto: any) => ({
          ...dto,
          calcularValor: () => 200,
        })),
        save: vi.fn().mockImplementation((_entity: any) => mockReserva),
        createQueryBuilder: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          getOne: vi.fn().mockResolvedValue(null),
        }),
      }),
    };

    dataSource = {
      options: { type: 'sqlite' },
      transaction: vi.fn().mockImplementation(async (cb: any) => {
        const manager = reservasRepository;
        return cb(manager);
      }),
    };

    clienteService = {
      findOne: vi.fn().mockResolvedValue({ id: 1, user_id: 1, active: true }),
      findByUserId: vi.fn().mockResolvedValue({ id: 1, user_id: 1 }),
    };

    carroService = {
      findOne: vi
        .fn()
        .mockResolvedValue({
          id: 1,
          placa: 'ABC-1234',
          valorDiaria: 100,
          status: 'disponivel',
        }),
      enriquecerFoto: vi.fn().mockImplementation(async (car: any) => ({
        ...car,
        foto: '/uploads/carros/atual.jpg',
      })),
    };

    redisService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(1),
    };
    cacheInvalidation = {
      invalidateReservationInspections: vi.fn().mockResolvedValue(undefined),
      invalidateKeys: vi.fn().mockResolvedValue(undefined),
    };
    configuracaoService = { getTaxaServico: vi.fn().mockResolvedValue({ valor: 0 }) };

    service = new ReservaService(
      reservasRepository as any,
      dataSource as any,
      clienteService as any,
      carroService as any,
      redisService as unknown as RedisService,
      cacheInvalidation as any,
      configuracaoService as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('quote', () => {
    it('returns the server-calculated daily rate, rounded days, subtotal, configured fee and total', async () => {
      carroService.findOne.mockResolvedValue({ id: 9, valorDiaria: 123.45 });
      configuracaoService.getTaxaServico.mockResolvedValue({ valor: 30 });

      const result = await service.quote({
        car_id: 9,
        dataRetirada: '2026-11-10T10:00:00.000Z',
        dataDevolucao: '2026-11-12T12:00:00.000Z',
      } as any);

      expect(carroService.findOne).toHaveBeenCalledWith(9);
      expect(result).toEqual({ valorDiaria: 123.45, diarias: 3, valorSubtotal: 370.35, taxaServico: 30, valorTotal: 400.35 });
    });

    it('uses one daily rate for periods below 24 hours', async () => {
      carroService.findOne.mockResolvedValue({ id: 9, valorDiaria: 87.5 });
      configuracaoService.getTaxaServico.mockResolvedValue({ valor: 12.5 });

      const result = await service.quote({
        car_id: 9,
        dataRetirada: '2026-11-10T10:00:00.000Z',
        dataDevolucao: '2026-11-10T18:00:00.000Z',
      } as any);

      expect(result).toEqual({ valorDiaria: 87.5, diarias: 1, valorSubtotal: 87.5, taxaServico: 12.5, valorTotal: 100 });
    });
  });

  describe('findAllForActor status and ownership scope', () => {
    it('returns persisted pending and confirmed reservations to staff without status filtering', async () => {
      const pending = { ...mockReserva, id: 'pending-1', status: StatusReserva.PENDENTE };
      const confirmed = { ...mockReserva, id: 'confirmed-1', status: StatusReserva.CONFIRMADA };
      reservasRepository.find.mockResolvedValue([pending, confirmed]);

      const result = await service.findAllForActor(adminActor);

      expect(reservasRepository.find).toHaveBeenCalledWith({
        relations: { client: { user: true }, car: true, lojaRetirada: true, locacao: true, pagamentos: true },
        order: { dataRetirada: 'ASC' },
      });
      expect(result.map((item: Reserva) => item.status)).toEqual([
        StatusReserva.PENDENTE,
        StatusReserva.CONFIRMADA,
      ]);
      expect(new Set(result.map((item: Reserva) => item.id)).size).toBe(result.length);
    });

    it('scopes client listing by authenticated users.id through clients.user_id', async () => {
      const getMany = vi.fn().mockResolvedValue([mockReserva]);
      const query = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        getMany,
      };
      reservasRepository.createQueryBuilder = vi.fn().mockReturnValue(query);

      const result = await service.findAllForActor(clienteActor);

      expect(query.where).toHaveBeenCalledWith('client.user_id = :userId', { userId: clienteActor.id });
      expect(result).toEqual([mockReserva]);
    });
  });

  it('does not allow a client to cancel a pending reservation on the pickup date', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const sameDay = { ...mockReserva, status: StatusReserva.PENDENTE, dataRetirada: new Date(`${today}T15:00:00.000Z`), client: { id: 1, user_id: clienteActor.id } };
    reservasRepository.findOne.mockResolvedValue(sameDay);
    await expect(service.cancel(clienteActor, 'res-123')).rejects.toThrow('antes do dia da retirada');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  /**
   * Cache HIT / MISS no metodo `findOneForActor` (GET /reservas/:id, TTL 120s).
   * Reserva contém cliente/carro relacionados; validar autorização em ambos
   * os caminhos impede que uma chave compartilhada contorne o controle de acesso.
   */
  describe('findOneForActor com cache', () => {
    it('HIT consulta a foto atual do carro no MySQL sem buscar a reserva novamente', async () => {
      redisService.get.mockResolvedValue({
        ...mockReserva,
        car: { ...mockReserva.car, foto: '/uploads/carros/legada.jpg' },
      });

      const resultado = await service.findOneForActor(adminActor, 'res-123');

      expect(redisService.get).toHaveBeenCalledWith('locamais:reserva:res-123');
      expect(reservasRepository.findOne).not.toHaveBeenCalled();
      expect(carroService.enriquecerFoto).toHaveBeenCalledWith({
        ...mockReserva.car,
        foto: '/uploads/carros/legada.jpg',
      });
      expect(resultado.car.foto).toBe('/uploads/carros/atual.jpg');
      expect(resultado.id).toBe(mockReserva.id);
    });

    it('reflete a nova foto do MySQL em leituras sucessivas de reserva', async () => {
      let fotoAtual = '/uploads/carros/primeira.jpg';
      carroService.enriquecerFoto.mockImplementation(async (car: any) => ({
        ...car,
        foto: fotoAtual,
      }));
      redisService.get.mockResolvedValue({ ...mockReserva, car: mockReserva.car });

      const primeira = await service.findOneForActor(adminActor, 'res-123');
      fotoAtual = '/uploads/carros/segunda.jpg';
      const segunda = await service.findOneForActor(adminActor, 'res-123');

      expect(primeira.car.foto).toBe('/uploads/carros/primeira.jpg');
      expect(segunda.car.foto).toBe('/uploads/carros/segunda.jpg');
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 120 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      const resultado = await service.findOneForActor(adminActor, 'res-123');

      expect(redisService.get).toHaveBeenCalledWith('locamais:reserva:res-123');
      expect(reservasRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'res-123' },
        relations: { client: { user: true }, car: true, lojaRetirada: true, locacao: true, pagamentos: true },
      });
      expect(redisService.set).toHaveBeenCalledWith(
        'locamais:reserva:res-123',
        expect.any(Object),
        120,
      );
      expect(redisService.set.mock.calls[0][1].car).not.toHaveProperty('foto');
      expect(resultado).toEqual(mockReserva);
    });

    // O TTL gravado deve ser exatamente 120 segundos (2 minutos).
    it('deve armazenar no cache com TTL de exatamente 120 segundos', async () => {
      redisService.get.mockResolvedValue(null);

      await service.findOneForActor(adminActor, 'res-123');

      const [, , ttl] = redisService.set.mock.calls[0];
      expect(ttl).toBe(120);
    });

    // A autorizacao e verificada ANTES de retornar dados do cache.
    it('deve verificar autorizacao antes de retornar dados do cache', async () => {
      redisService.get.mockResolvedValue(mockReserva);

      // Cliente pode acessar sua propria reserva (user_id == actor.id).
      const resultado = await service.findOneForActor(clienteActor, 'res-123');
      expect(resultado.car.foto).toBe('/uploads/carros/atual.jpg');

      // Outro cliente nao pode acessar reserva de cliente diferente.
      redisService.get.mockResolvedValue(mockReserva);
      await expect(
        service.findOneForActor(outroClienteActor, 'res-123'),
      ).rejects.toThrow(ForbiddenException);

      // O MySQL nao deve ser consultado em nenhum dos casos acima (cache HIT).
      expect(reservasRepository.findOne).not.toHaveBeenCalled();
    });

    // Falha de leitura do Redis: segue para o MySQL normalmente.
    it('deve fazer fallback para MySQL quando o Redis falhar na leitura', async () => {
      redisService.get.mockRejectedValue(new Error('Redis indisponível'));
      redisService.set.mockResolvedValue(undefined);

      const resultado = await service.findOneForActor(adminActor, 'res-123');

      expect(reservasRepository.findOne).toHaveBeenCalled();
      expect(resultado).toEqual(mockReserva);
    });

    // Falha de gravacao no Redis: nao impede o retorno dos dados do MySQL.
    it('nao deve impedir o retorno quando o Redis falhar na gravacao', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('Redis indisponível'));

      const resultado = await service.findOneForActor(adminActor, 'res-123');

      expect(reservasRepository.findOne).toHaveBeenCalled();
      expect(resultado).toEqual(mockReserva);
    });

    // Reserva inexistente: nem cache nem MySQL retornam dado => 404.
    it('deve retornar 404 quando reserva nao existe em cache nem no MySQL', async () => {
      redisService.get.mockResolvedValue(null);
      reservasRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOneForActor(adminActor, 'inexistente'),
      ).rejects.toThrow(NotFoundException);

      expect(redisService.get).toHaveBeenCalledWith(
        'locamais:reserva:inexistente',
      );
      expect(reservasRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'inexistente' },
        relations: { client: { user: true }, car: true, lojaRetirada: true, locacao: true, pagamentos: true },
      });
    });
  });

  /**
   * Invalidacao: ocorre no Service, APOS a escrita ser confirmada no MySQL.
   * Falhas no Redis sao toleradas (nao desfazem a operacao no banco).
   * A chave individual evita apagar caches de outras reservas sem relação.
   */
  describe('invalidacao de cache', () => {
    // `PATCH /reservas/:id` invalida `locamais:reserva:{id}` apos o update.
    it('deve invalidar o cache apos atualizacao bem-sucedida', async () => {
      redisService.del.mockResolvedValue(1);
      reservasRepository.findOne.mockResolvedValue(mockReserva);
      reservasRepository.save.mockResolvedValue(mockReserva);
      mockReserva.status = StatusReserva.AGUARDANDO_CONFIRMACAO;

      await service.update('res-123', { status: StatusReserva.CONFIRMADA });

      expect(redisService.del).toHaveBeenCalledWith('locamais:reserva:res-123');
    });

    // `PATCH /reservas/:id/cancelar` invalida o cache apos o cancelamento.
    it('deve invalidar o cache apos cancelamento bem-sucedido', async () => {
      redisService.del.mockResolvedValue(1);
      reservasRepository.findOne.mockResolvedValue({
        ...mockReserva,
        status: StatusReserva.PENDENTE,
      });
      reservasRepository.save.mockResolvedValue(mockReserva);

      const resultado = await service.cancel(adminActor, 'res-123');

      expect(resultado).toBeDefined();
      expect(redisService.del).toHaveBeenCalledWith('locamais:reserva:res-123');
    });

    // Se a atualizacao falhar no MySQL, nada e gravado e nada e invalidado.
    it('nao deve invalidar o cache quando a atualizacao falhar no MySQL', async () => {
      reservasRepository.findOne.mockResolvedValue(mockReserva);
      reservasRepository.getRepository = vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(mockReserva),
        exists: vi.fn().mockResolvedValue(true),
        create: vi.fn().mockImplementation((dto: any) => dto),
        save: vi.fn().mockRejectedValue(new Error('db error')),
        createQueryBuilder: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          getOne: vi.fn().mockResolvedValue(null),
        }),
      });
      // Garante que a confirmação passe pela gravação transacional simulada.
      mockReserva.status = StatusReserva.AGUARDANDO_CONFIRMACAO;

      await expect(
        service.update('res-123', { status: StatusReserva.CONFIRMADA }),
      ).rejects.toThrow();

      expect(redisService.del).not.toHaveBeenCalled();
    });

    // Falha na invalidação nao bloqueia a atualizacao concluida no MySQL.
    it('nao deve impedir a atualizacao quando o Redis falhar na invalidacao', async () => {
      reservasRepository.findOne.mockResolvedValue(mockReserva);
      reservasRepository.getRepository = vi.fn().mockReturnValue({
        findOne: vi.fn().mockResolvedValue(mockReserva),
        exists: vi.fn().mockResolvedValue(true),
        create: vi.fn().mockImplementation((dto: any) => dto),
        save: vi.fn().mockResolvedValue(mockReserva),
        createQueryBuilder: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          getOne: vi.fn().mockResolvedValue(null),
        }),
      });
      redisService.del.mockRejectedValue(new Error('Redis indisponível'));

      mockReserva.status = StatusReserva.AGUARDANDO_CONFIRMACAO;
      const resultado = await service.update('res-123', {
        status: StatusReserva.CONFIRMADA,
      });

      expect(resultado).toEqual(mockReserva);
    });

    // Reserva inexistente => NotFoundException, sem invalidar cache.
    it('deve lancar NotFoundException sem invalidar quando a reserva nao existe', async () => {
      reservasRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('inexistente', { status: StatusReserva.CONFIRMADA }),
      ).rejects.toThrow(NotFoundException);

      expect(redisService.del).not.toHaveBeenCalled();
    });
  });
});
