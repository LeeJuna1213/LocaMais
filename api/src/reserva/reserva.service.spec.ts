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
    };

    redisService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(1),
    };
    cacheInvalidation = {
      invalidateReservationInspections: vi.fn().mockResolvedValue(undefined),
    };

    service = new ReservaService(
      reservasRepository as any,
      dataSource as any,
      clienteService as any,
      carroService as any,
      redisService as unknown as RedisService,
      cacheInvalidation as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Cache HIT / MISS no metodo `findOneForActor` (GET /reservas/:id, TTL 120s).
   * Reserva contém cliente/carro relacionados; validar autorização em ambos
   * os caminhos impede que uma chave compartilhada contorne o controle de acesso.
   */
  describe('findOneForActor com cache', () => {
    // Cache HIT: devolve o valor do Redis sem consultar o repositorio MySQL.
    it('deve retornar dados do cache em HIT sem consultar o MySQL', async () => {
      redisService.get.mockResolvedValue(mockReserva);

      const resultado = await service.findOneForActor(adminActor, 'res-123');

      expect(redisService.get).toHaveBeenCalledWith('locamais:reserva:res-123');
      expect(reservasRepository.findOne).not.toHaveBeenCalled();
      expect(resultado).toEqual(mockReserva);
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 120 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      const resultado = await service.findOneForActor(adminActor, 'res-123');

      expect(redisService.get).toHaveBeenCalledWith('locamais:reserva:res-123');
      expect(reservasRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'res-123' },
        relations: { client: true, car: true },
      });
      expect(redisService.set).toHaveBeenCalledWith(
        'locamais:reserva:res-123',
        resultado,
        120,
      );
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
      expect(resultado).toEqual(mockReserva);

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
        relations: { client: true, car: true },
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
        create: vi.fn().mockImplementation((dto: any) => dto),
        save: vi.fn().mockRejectedValue(new Error('db error')),
        createQueryBuilder: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          getOne: vi.fn().mockResolvedValue(null),
        }),
      });
      // Garante que a confirmação passe pela gravação transacional simulada.
      mockReserva.status = StatusReserva.PENDENTE;

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
        create: vi.fn().mockImplementation((dto: any) => dto),
        save: vi.fn().mockResolvedValue(mockReserva),
        createQueryBuilder: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          getOne: vi.fn().mockResolvedValue(null),
        }),
      });
      redisService.del.mockRejectedValue(new Error('Redis indisponível'));

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
