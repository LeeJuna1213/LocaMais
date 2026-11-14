import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { RedisService } from '../redis/redis.service.js';

import { Usuario } from './entities/usuario.entity.js';
import { TipoUsuario } from './enums/usuario.enum.js';
import { UsuarioService } from './usuario.service.js';

const mockUser = Object.assign(new Usuario(), {
  id: 1,
  name: 'Test Usuario',
  email: 'test@exemplo.com',
  password: '$2b$10$hash',
  active: true,
  type: TipoUsuario.CLIENTE,
  client: null,
  created_at: new Date(),
  updated_at: new Date(),
});

// Mantemos as funções mock em um objeto simples. Isso evita referenciar
// métodos do Repository tipado diretamente nos `expect`, o que dispara o
// aviso `unbound-method` do oxlint.
const repoMocks = {
  find: vi.fn().mockResolvedValue([mockUser]),
  findOne: vi.fn().mockResolvedValue(mockUser),
  findOneBy: vi.fn().mockResolvedValue(mockUser),
  create: vi.fn().mockReturnValue(mockUser),
  save: vi.fn().mockResolvedValue(mockUser),
  update: vi.fn().mockResolvedValue({ affected: 1 }),
  delete: vi.fn().mockResolvedValue({ affected: 1 }),
  exists: vi.fn().mockResolvedValue(false),
  count: vi.fn().mockResolvedValue(0),
  createQueryBuilder: vi.fn().mockReturnValue({
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(mockUser),
  }),
};

// Objeto mantido como `vi.fn()` para preservar `.mockResolvedValue` no tipo.
const mockRedisService = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

/**
 * Testes do `UsuarioService`.
 *
 * `mockRedisService` e mantido como objeto de `vi.fn()` para preservar os
 * metodos `.mockResolvedValue` / `.mockRejectedValue` / `.mock.calls` no tipo
 * do TypeScript; o cast para `RedisService` acontece somente na injecao via
 * `useValue` no modulo de teste. Nao ha criacao de segunda conexao ioredis.
 *
 * `repoMocks` evita referenciar metodos do Repository tipado diretamente nos
 * `expect`, prevenindo o aviso `unbound-method` do oxlint.
 */
describe('UsuarioService', () => {
  let service: UsuarioService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuarioService,
        {
          provide: getRepositoryToken(Usuario),
          useValue: repoMocks,
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockImplementation((key: string) => {
              if (key === 'BCRYPT_ROUNDS') return '4';
              return undefined;
            }),
            getOrThrow: vi.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<UsuarioService>(UsuarioService);
  });

  // Sanity check: o service e instanciado com sucesso pelos mocks.
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // `findAll` NAO usa cache (ADR-002: listagens completas ficam fora do escopo)
  // e apenas delega ao repositorio MySQL.
  it('findAll chama repository.find', async () => {
    const result = await service.findAll();

    expect(repoMocks.find).toHaveBeenCalled();
    expect(result).toEqual([mockUser]);
  });

  // `findOne` NAO usa cache; e so um wrapper de busca com relacoes.
  it('findOne chama repository.findOne com as relacoes', async () => {
    const result = await service.findOne(1);

    expect(repoMocks.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        relations: { client: { address: true } },
      }),
    );
    expect(result).toEqual(mockUser);
  });

  /**
   * `findOneForActor` e o metodo cacheado (GET /usuarios/:id, TTL 300s).
   * Segue o padrao: HIT retorna do Redis sem MySQL; MISS consulta o MySQL e
   * grava no Redis com TTL 300. A autorizacao e verificada FORA do try/catch
   * do cache para nao capturar `ForbiddenException`.
   */
  describe('findOneForActor com cache', () => {
    const actor = {
      id: 1,
      email: 'test@exemplo.com',
      name: 'Test Usuario',
      type: TipoUsuario.ADMIN,
    } as any;

    // Cache HIT: devolve o valor do Redis sem chamar o repositorio.
    it('deve retornar dados do cache em HIT sem consultar o MySQL', async () => {
      const cachedUser = {
        id: 1,
        name: 'Test Usuario',
        email: 'test@exemplo.com',
        active: true,
        type: TipoUsuario.CLIENTE,
        client: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      mockRedisService.get.mockResolvedValue(cachedUser);

      const result = await service.findOneForActor(actor, 1);

      expect(mockRedisService.get).toHaveBeenCalledWith('locamais:usuario:1');
      expect(repoMocks.findOne).not.toHaveBeenCalled();
      expect(result).toEqual(cachedUser);
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 300 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.findOneForActor(actor, 1);

      expect(mockRedisService.get).toHaveBeenCalledWith('locamais:usuario:1');
      expect(repoMocks.findOne).toHaveBeenCalled();
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'locamais:usuario:1',
        mockUser,
        300,
      );
      expect(result).toEqual(mockUser);
    });

    // A autorizacao e verificada ANTES de ler o cache; um cliente nao pode
    // ler o registro de outro mesmo que esteja em cache.
    it('deve verificar autorizacao antes de retornar dados do cache', async () => {
      const clienteActor = {
        id: 99,
        email: 'outro@exemplo.com',
        name: 'Outro Usuario',
        type: TipoUsuario.CLIENTE,
      } as any;
      mockRedisService.get.mockResolvedValue(mockUser);

      await expect(
        service.findOneForActor(clienteActor, 1),
      ).rejects.toThrow('clientes so podem ler o proprio registro');

      expect(mockRedisService.get).not.toHaveBeenCalled();
      expect(repoMocks.findOne).not.toHaveBeenCalled();
    });

    // Falha de leitura do Redis: segue para o MySQL normalmente.
    it('deve fazer fallback para MySQL quando o Redis falhar na leitura', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis indisponível'));
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.findOneForActor(actor, 1);

      expect(repoMocks.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });

    // Falha de gravacao no Redis: nao impede o retorno da resposta.
    it('nao deve impedir o retorno quando o Redis falhar na gravacao', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockRejectedValue(new Error('Redis indisponível'));

      const result = await service.findOneForActor(actor, 1);

      expect(repoMocks.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });
  });

  /**
   * Invalidacao: ocorre no Service, APOS a escrita ser confirmada no MySQL.
   * Falhas no Redis sao toleradas (nao desfazem a operacao no banco).
   */
  describe('invalidacao de cache', () => {
    const actor = {
      id: 1,
      email: 'admin@exemplo.com',
      name: 'Admin',
      type: TipoUsuario.ADMIN,
    } as any;

    // `PATCH /usuarios/:id` invalida `locamais:usuario:{id}` apos o update.
    it('deve invalida o cache apos update bem-sucedido', async () => {
      mockRedisService.del.mockResolvedValue(1);

      await service.update(actor, 1, { name: 'Novo Nome' });

      expect(mockRedisService.del).toHaveBeenCalledWith('locamais:usuario:1');
    });

    // `DELETE /usuarios/:id` (desativacao) invalida `locamais:usuario:{id}`.
    it('deve invalida o cache apos desativacao (remove)', async () => {
      const outroActor = {
        id: 99,
        email: 'outro-admin@exemplo.com',
        name: 'Outro Admin',
        type: TipoUsuario.ADMIN,
      } as any;
      mockRedisService.del.mockResolvedValue(1);

      await service.remove(outroActor, 1);

      expect(mockRedisService.del).toHaveBeenCalledWith('locamais:usuario:1');
    });

    // Falha na invalidação nao bloqueia a atualizacao concluida no MySQL.
    it('nao deve impedir a atualizacao quando o Redis falhar na invalidacao', async () => {
      mockRedisService.del.mockRejectedValue(new Error('Redis indisponível'));

      await expect(
        service.update(actor, 1, { name: 'Novo Nome' }),
      ).resolves.toBeDefined();
    });
  });

  /**
   * Seguranca: nunca armazenar senhas/hashes no Redis. A entidade Usuario
   * implementa `toJSON()` que remove `password` antes da serializacao JSON
   * feita pelo RedisService.
   */
  it('nao armazena senha no cache', async () => {
    const actor = {
      id: 1,
      email: 'admin@exemplo.com',
      name: 'Admin',
      type: TipoUsuario.ADMIN,
    } as any;
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue(undefined);

    await service.findOneForActor(actor, 1);

    const setCall = mockRedisService.set.mock.calls[0];
    const cachedValue = setCall[1];

    // O mock nao chama JSON.stringify, mas a implementacao real do
    // RedisService chama JSON.stringify, que invoca toJSON() da entidade
    // Usuario e remove a senha antes de gravar no Redis.
    const serialized = JSON.stringify(cachedValue);
    expect(serialized).not.toContain('$2b$10$hash');
    expect(serialized).toContain('"id":1');
    expect(serialized).toContain('"email":"test@exemplo.com"');
  });
});
