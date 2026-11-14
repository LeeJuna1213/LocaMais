import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { VistoriaService } from './vistoria.service.js';
import { StatusLocacao } from '../locacao/enums/status-locacao.enum.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { RedisService } from '../redis/redis.service.js';

import { TipoVistoria } from './enums/tipo-vistoria.enum.js';
import { Vistoria } from './entities/vistoria.entity.js';

/**
 * Testes do `VistoriaService`.
 *
 * `mockRedisService` e mantido como objeto de `vi.fn()` para preservar os
 * metodos `.mockResolvedValue` / `.mockRejectedValue` / `.mock.calls` no tipo
 * do TypeScript; o cast `as unknown as RedisService` acontece somente no
 * ponto de injecao do construtor. Nao ha criacao de segunda conexao ioredis.
 */
describe('VistoriaService', () => {
  let service: VistoriaService;
  let vistoriasRepository: any;
  let locacaoService: any;
  let redisService: any;

  const mockVistoria = Object.assign(new Vistoria(), {
    id: 'vist-123',
    tipo: TipoVistoria.RETIRADA,
    data: new Date('2026-01-10T10:00:00.000Z'),
    observacoes: 'Veiculo sem avarias visiveis.',
    fotos: '[]',
    locacao_id: 'loc-456',
    locacao: {
      id: 'loc-456',
      status: StatusLocacao.AGUARDANDO_RETIRADA,
      reservation: {
        id: 'res-789',
        client: { user_id: 1 },
      },
    },
    created_at: new Date(),
    updated_at: new Date(),
  });

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
    vistoriasRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(mockVistoria),
      create: vi.fn().mockImplementation((dto: any) => {
        const v = Object.assign(new Vistoria(), dto);
        return v;
      }),
      save: vi.fn().mockImplementation((entity: any) => entity),
      update: vi.fn().mockResolvedValue(undefined),
    };

    locacaoService = {
      findOne: vi.fn().mockResolvedValue({
        id: 'loc-456',
        status: StatusLocacao.AGUARDANDO_RETIRADA,
      }),
    };

    redisService = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(1),
    };

    service = new VistoriaService(
      vistoriasRepository as any,
      locacaoService as any,
      redisService as unknown as RedisService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Cache HIT / MISS no metodo `findOne` (GET /vistorias/:id, TTL 600s).
   */
  describe('findOne com cache', () => {
    // Cache HIT: devolve o valor do Redis sem consultar o repositorio MySQL.
    it('deve retornar dados do cache em HIT sem consultar o MySQL', async () => {
      redisService.get.mockResolvedValue(mockVistoria);

      const resultado = await service.findOne(adminActor, 'vist-123');

      expect(redisService.get).toHaveBeenCalledWith('locamais:vistoria:vist-123');
      expect(vistoriasRepository.findOne).not.toHaveBeenCalled();
      expect(resultado).toEqual(mockVistoria);
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 600 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue(undefined);

      const resultado = await service.findOne(adminActor, 'vist-123');

      expect(redisService.get).toHaveBeenCalledWith('locamais:vistoria:vist-123');
      expect(vistoriasRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'vist-123' },
        relations: { locacao: { reservation: { client: true } } },
      });
      expect(redisService.set).toHaveBeenCalledWith(
        'locamais:vistoria:vist-123',
        resultado,
        600,
      );
      expect(resultado).toEqual(mockVistoria);
    });

    // O TTL gravado deve ser exatamente 600 segundos (10 minutos).
    it('deve armazenar no cache com TTL de exatamente 600 segundos', async () => {
      redisService.get.mockResolvedValue(null);

      await service.findOne(adminActor, 'vist-123');

      const [, , ttl] = redisService.set.mock.calls[0];
      expect(ttl).toBe(600);
    });

    // O payload armazenado deve ser exatamente o objeto de resposta da API,
    // sem campos adicionais ou dados sensíveis.
    it('deve armazenar exatamente o objeto de resposta, sem dados adicionais', async () => {
      redisService.get.mockResolvedValue(null);

      const resultado = await service.findOne(adminActor, 'vist-123');
      const payload = redisService.set.mock.calls[0][1];

      expect(payload).toEqual(resultado);
      expect(Object.keys(payload).sort()).toEqual([
        'created_at',
        'data',
        'fotos',
        'id',
        'locacao',
        'locacao_id',
        'observacoes',
        'tipo',
        'updated_at',
      ]);
    });

    // A autorizacao e verificada ANTES de retornar dados do cache.
    it('deve verificar autorizacao antes de retornar dados do cache', async () => {
      redisService.get.mockResolvedValue(mockVistoria);

      // Cliente so pode acessar suas proprias vistorias.
      const resultado = await service.findOne(clienteActor, 'vist-123');
      expect(resultado).toEqual(mockVistoria);

      // Outro cliente nao pode acessar vistoria de cliente diferente.
      redisService.get.mockResolvedValue(mockVistoria);
      await expect(
        service.findOne(outroClienteActor, 'vist-123'),
      ).rejects.toThrow(ForbiddenException);

      // O MySQL nao deve ser consultado em nenhum dos casos acima (cache HIT).
      expect(vistoriasRepository.findOne).not.toHaveBeenCalled();
    });

    // Falha de leitura do Redis: segue para o MySQL normalmente.
    it('deve fazer fallback para MySQL quando o Redis falhar na leitura', async () => {
      redisService.get.mockRejectedValue(new Error('Redis indisponível'));
      redisService.set.mockResolvedValue(undefined);

      const resultado = await service.findOne(adminActor, 'vist-123');

      expect(vistoriasRepository.findOne).toHaveBeenCalled();
      expect(resultado).toEqual(mockVistoria);
    });

    // Falha de gravacao no Redis: nao impede o retorno dos dados do MySQL.
    it('nao deve impedir o retorno quando o Redis falhar na gravacao', async () => {
      redisService.get.mockResolvedValue(null);
      redisService.set.mockRejectedValue(new Error('Redis indisponível'));

      const resultado = await service.findOne(adminActor, 'vist-123');

      expect(vistoriasRepository.findOne).toHaveBeenCalled();
      expect(resultado).toEqual(mockVistoria);
    });

    // Vistoria inexistente: nem cache nem MySQL retornam dado => 404.
    it('deve retornar 404 quando vistoria nao existe em cache nem no MySQL', async () => {
      redisService.get.mockResolvedValue(null);
      vistoriasRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(adminActor, 'inexistente')).rejects.toThrow(
        NotFoundException,
      );

      expect(redisService.get).toHaveBeenCalledWith(
        'locamais:vistoria:inexistente',
      );
      expect(vistoriasRepository.findOne).toHaveBeenCalled();
    });
  });

  /**
   * Invalidacao: ocorre no Service, APOS a escrita ser confirmada no MySQL.
   * Falhas no Redis sao toleradas (nao desfazem a operacao no banco).
   */
  describe('invalidacao de cache', () => {
    // `PATCH /vistorias/:id` invalida `locamais:vistoria:{id}` apos o update.
    it('deve invalidar o cache apos atualizacao bem-sucedida', async () => {
      redisService.del.mockResolvedValue(1);
      vistoriasRepository.findOne.mockResolvedValue(mockVistoria);
      vistoriasRepository.save.mockResolvedValue(mockVistoria);

      await service.update(adminActor, 'vist-123', {
        observacoes: 'Novo arranque no para-choque.',
      });

      expect(vistoriasRepository.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalledWith(
        'locamais:vistoria:vist-123',
      );
    });

    // Se a atualizacao falhar no MySQL, nada e gravado e nada e invalidado.
    it('nao deve invalidar o cache quando a atualizacao falhar no MySQL', async () => {
      vistoriasRepository.findOne.mockResolvedValue(mockVistoria);
      vistoriasRepository.save = vi.fn().mockRejectedValue(new Error('db error'));

      await expect(
        service.update(adminActor, 'vist-123', { observacoes: 'X' }),
      ).rejects.toThrow();

      expect(redisService.del).not.toHaveBeenCalled();
    });

    // Falha na invalidação nao bloqueia a atualizacao concluida no MySQL.
    it('nao deve impedir a atualizacao quando o Redis falhar na invalidacao', async () => {
      vistoriasRepository.findOne.mockResolvedValue(mockVistoria);
      vistoriasRepository.save.mockResolvedValue(mockVistoria);
      redisService.del.mockRejectedValue(new Error('Redis indisponível'));

      const resultado = await service.update(adminActor, 'vist-123', {
        observacoes: 'Atualizado.',
      });

      expect(vistoriasRepository.save).toHaveBeenCalled();
      expect(resultado).toEqual(mockVistoria);
    });

    // Vistoria inexistente => NotFoundException, sem invalidar cache.
    it('deve lancar NotFoundException sem invalidar quando a vistoria nao existe', async () => {
      vistoriasRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update(adminActor, 'inexistente', { observacoes: 'X' }),
      ).rejects.toThrow(NotFoundException);

      expect(redisService.del).not.toHaveBeenCalled();
    });

    // Criacao de vistoria nova nao possui cache existente para invalidar.
    // O `findOne` ao final do `create` popula o cache na primeira leitura.
    it('nao deve chamar del ao criar uma vistoria nova (nao ha cache existente)', async () => {
      locacaoService.findOne.mockResolvedValue({
        id: 'loc-456',
        status: StatusLocacao.AGUARDANDO_RETIRADA,
      });
      vistoriasRepository.findOne.mockResolvedValue(mockVistoria);
      vistoriasRepository.save.mockResolvedValue(mockVistoria);

      await service.create(adminActor, {
        tipo: TipoVistoria.RETIRADA,
        observacoes: 'Nova vistoria.',
        fotos: '[]',
        locacaoId: 'loc-456',
      });

      expect(redisService.del).not.toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });
  });
});
