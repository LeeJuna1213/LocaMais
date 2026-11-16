import { Repository } from 'typeorm';

import { RedisService } from '../redis/redis.service.js';

import { Usuario } from '../usuario/entities/usuario.entity.js';
import { TipoPessoa, TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { Cliente } from './entities/cliente.entity.js';
import { ClienteService } from './cliente.service.js';

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

const mockClient = Object.assign(new Cliente(), {
  id: 1,
  user_id: 1,
  user: mockUser,
  tipo_pessoa: TipoPessoa.PF,
  cpf: '12345678901',
  cnpj: null,
  data_nascimento: '1990-01-01',
  razao_social: null,
  address: null,
  reservations: undefined,
  created_at: new Date(),
  updated_at: new Date(),
});

const repoMocks = {
  find: vi.fn().mockResolvedValue([mockClient]),
  findOne: vi.fn().mockResolvedValue(mockClient),
  create: vi.fn().mockReturnValue(mockClient),
  save: vi.fn().mockResolvedValue(mockClient),
  update: vi.fn().mockResolvedValue({ affected: 1 }),
  delete: vi.fn().mockResolvedValue({ affected: 1 }),
  exists: vi.fn().mockResolvedValue(false),
  count: vi.fn().mockResolvedValue(0),
};

const mockUsuarioService = {
  assertCanCreate: vi.fn(),
  deactivateAccount: vi.fn().mockResolvedValue(undefined),
} as any;

const mockEnderecoService = {
  createForClientInTransaction: vi.fn().mockResolvedValue(mockClient),
} as any;

// Objeto mantido como `vi.fn()` para preservar `.mockResolvedValue` no tipo;
// o cast para `RedisService` acontece apenas na injeção abaixo.
const mockRedisService = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};
const cacheInvalidation = {
  invalidateClientDependents: vi.fn().mockResolvedValue(undefined),
};

/**
 * Testes do `ClienteService`.
 *
 * `mockRedisService` e mantido como objeto de `vi.fn()` para preservar os
 * metodos `.mockResolvedValue` / `.mockRejectedValue` / `.mock.calls` no tipo
 * do TypeScript; o cast `as unknown as RedisService` acontece somente no
 * ponto de injecao do construtor. Nao ha criacao de segunda conexao ioredis.
 *
 * `mockUsuarioService` e `mockEnderecoService` sao stubs simples, pois o
 * foco destes testes e o comportamento de cache do `ClienteService`.
 */
describe('ClienteService', () => {
  let service: ClienteService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClienteService(
      repoMocks as unknown as Repository<Cliente>,
      {} as any,
      mockUsuarioService,
      mockEnderecoService,
      mockRedisService as unknown as RedisService,
      cacheInvalidation as any,
    );
  });

  // Sanity check: o service e instanciado com sucesso pelos mocks.
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * `findOneForActor` e o metodo cacheado (GET /clientes/:id, TTL 300s).
   * Segue o padrao: HIT retorna do Redis sem MySQL; MISS consulta o MySQL e
   * grava no Redis com TTL 300. A autorizacao e verificada FORA do try/catch
   * do cache para nao capturar `ForbiddenException`.
   */
  describe('findOneForActor com cache', () => {
    const adminActor = {
      id: 1,
      email: 'admin@exemplo.com',
      name: 'Admin',
      type: TipoUsuario.ADMIN,
    } as any;

    const clienteActor = {
      id: 1,
      email: 'test@exemplo.com',
      name: 'Test Usuario',
      type: TipoUsuario.CLIENTE,
    } as any;

    const outroClienteActor = {
      id: 99,
      email: 'outro@exemplo.com',
      name: 'Outro Usuario',
      type: TipoUsuario.CLIENTE,
    } as any;

    // Cache HIT: devolve o valor do Redis sem chamar o repositorio.
    it('deve retornar dados do cache em HIT sem consultar o MySQL', async () => {
      mockRedisService.get.mockResolvedValue(mockClient);

      const result = await service.findOneForActor(adminActor, 1);

      expect(mockRedisService.get).toHaveBeenCalledWith('locamais:cliente:1');
      expect(repoMocks.findOne).not.toHaveBeenCalled();
      expect(result).toEqual(mockClient);
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 300 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.findOneForActor(adminActor, 1);

      expect(mockRedisService.get).toHaveBeenCalledWith('locamais:cliente:1');
      expect(repoMocks.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'locamais:cliente:1',
        mockClient,
        300,
      );
      expect(result).toEqual(mockClient);
    });

    // A autorizacao e verificada ANTES de ler o cache; admin pode ler qualquer cliente.
    it('deve verificar autorizacao antes de retornar dados do cache (admin)', async () => {
      mockRedisService.get.mockResolvedValue(mockClient);

      await service.findOneForActor(adminActor, 1);

      expect(mockRedisService.get).toHaveBeenCalled();
      expect(repoMocks.findOne).not.toHaveBeenCalled();
    });

    // A autorizacao e verificada ANTES de ler o cache; cliente pode ler o proprio registro.
    it('deve verificar autorizacao antes de retornar dados do cache (cliente proprio)', async () => {
      mockRedisService.get.mockResolvedValue(mockClient);

      const result = await service.findOneForActor(clienteActor, 1);

      expect(result).toEqual(mockClient);
    });

    // Um cliente nao pode ler outro cliente, mesmo que o dado esteja em cache.
    it('deve rejeitar cliente tentando acessar outro cliente via cache', async () => {
      mockRedisService.get.mockResolvedValue(mockClient);

      await expect(
        service.findOneForActor(outroClienteActor, 1),
      ).rejects.toThrow('clientes so podem ler o proprio registro');

      expect(mockRedisService.get).toHaveBeenCalled();
      expect(repoMocks.findOne).not.toHaveBeenCalled();
    });

    // Falha de leitura do Redis: segue para o MySQL normalmente.
    it('deve fazer fallback para MySQL quando o Redis falhar na leitura', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis indisponível'));
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.findOneForActor(adminActor, 1);

      expect(repoMocks.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockClient);
    });

    // Falha de gravacao no Redis: nao impede o retorno da resposta.
    it('nao deve impedir o retorno quando o Redis falhar na gravacao', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockRejectedValue(new Error('Redis indisponível'));

      const result = await service.findOneForActor(adminActor, 1);

      expect(repoMocks.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockClient);
    });
  });

  /**
   * Invalidacao: ocorre no Service, APOS a escrita ser confirmada no MySQL.
   * Falhas no Redis sao toleradas (nao desfazem a operacao no banco).
   */
  describe('invalidacao de cache', () => {
    const adminActor = {
      id: 1,
      email: 'admin@exemplo.com',
      name: 'Admin',
      type: TipoUsuario.ADMIN,
    } as any;

    // `PATCH /clientes/:id` invalida `locamais:cliente:{id}` apos o update.
    it('deve invalida o cache apos update bem-sucedido', async () => {
      mockRedisService.del.mockResolvedValue(1);
      repoMocks.findOne.mockResolvedValue(mockClient);

      await service.update(1, {
        tipo_pessoa: TipoPessoa.PJ,
        cnpj: '12345678901234',
        razao_social: 'Empresa Teste LTDA',
      });

      expect(mockRedisService.del).toHaveBeenCalledWith('locamais:cliente:1');
      expect(cacheInvalidation.invalidateClientDependents).toHaveBeenCalledWith(1);
    });

    // `DELETE /clientes/:id` (desativacao) invalida `locamais:cliente:{id}`.
    it('deve invalida o cache apos desativacao (remove)', async () => {
      mockRedisService.del.mockResolvedValue(1);
      repoMocks.findOne.mockResolvedValue(mockClient);

      await service.remove(1);

      expect(mockRedisService.del).toHaveBeenCalledWith('locamais:cliente:1');
    });

    // Falha na invalidação nao bloqueia a atualizacao concluida no MySQL.
    it('nao deve impedir a atualizacao quando o Redis falhar na invalidacao', async () => {
      mockRedisService.del.mockRejectedValue(new Error('Redis indisponível'));
      repoMocks.findOne.mockResolvedValue(mockClient);

      await expect(
        service.update(1, {
          tipo_pessoa: TipoPessoa.PJ,
          cnpj: '12345678901234',
          razao_social: 'Empresa Teste LTDA',
        }),
      ).resolves.toBeDefined();
    });
  });

  /**
   * Seguranca: nunca armazenar senhas/hashes no Redis. A entidade Cliente
   * implementa `toJSON()` que remove `password` (vindos da relacao Usuario)
   * e quebra o ciclo de serializacao com Endereco antes da gravacao.
   */
  it('nao armazena senha no cache', async () => {
    const adminActor = {
      id: 1,
      email: 'admin@exemplo.com',
      name: 'Admin',
      type: TipoUsuario.ADMIN,
    } as any;
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue(undefined);

    await service.findOneForActor(adminActor, 1);

    const setCall = mockRedisService.set.mock.calls[0];
    const cachedValue = setCall[1];

    // A serializacao JSON chama toJSON() da entidade Cliente, que remove
    // dados sensíveis e quebra o ciclo com Endereco.
    const serialized = JSON.stringify(cachedValue);
    expect(serialized).not.toContain('$2b$10$hash');
    expect(serialized).toContain('"id":1');
    expect(serialized).toContain('"tipo_pessoa":"PF"');
  });
});
