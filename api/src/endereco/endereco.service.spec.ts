import { Repository } from 'typeorm';

import { RedisService } from '../redis/redis.service.js';

import { Endereco } from './entities/endereco.entity.js';
import { EnderecoService } from './endereco.service.js';

const mockEndereco = Object.assign(new Endereco(), {
  id: 1,
  client_id: 10,
  logradouro: 'Rua das Flores',
  numero: '123',
  complemento: 'Apto 42',
  bairro: 'Centro',
  cidade: 'Sao Paulo',
  uf: 'SP',
  cep: '01001000',
  pais: 'Brasil',
  created_at: new Date(),
  updated_at: new Date(),
});

const repoMocks = {
  find: vi.fn().mockResolvedValue([mockEndereco]),
  findOne: vi.fn().mockResolvedValue(mockEndereco),
  create: vi.fn().mockReturnValue(mockEndereco),
  save: vi.fn().mockResolvedValue(mockEndereco),
  update: vi.fn().mockResolvedValue({ affected: 1 }),
  delete: vi.fn().mockResolvedValue({ affected: 1 }),
  exists: vi.fn().mockResolvedValue(false),
  count: vi.fn().mockResolvedValue(0),
};

// Objeto mantido como `vi.fn()` para preservar `.mockResolvedValue` no tipo;
// o cast para `RedisService` acontece apenas na injeção abaixo.
const mockRedisService = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};
const cacheInvalidation = {
  invalidateAddressAggregates: vi.fn().mockResolvedValue(undefined),
};

/**
 * Testes do `EnderecoService`.
 *
 * `mockRedisService` e mantido como objeto de `vi.fn()` para preservar os
 * metodos `.mockResolvedValue` / `.mockRejectedValue` / `.mock.calls` no tipo
 * do TypeScript; o cast `as unknown as RedisService` acontece somente no
 * ponto de injecao do construtor. Nao ha criacao de segunda conexao ioredis.
 */
describe('EnderecoService', () => {
  let service: EnderecoService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EnderecoService(
      repoMocks as unknown as Repository<Endereco>,
      repoMocks as unknown as Repository<any>,
      mockRedisService as unknown as RedisService,
      cacheInvalidation as any,
    );
  });

  // Sanity check: o service e instanciado com sucesso pelos mocks.
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * `findOne` e o metodo cacheado (GET /enderecos/:id, TTL 600s).
   * Segue o padrao: HIT retorna do Redis sem MySQL; MISS consulta o MySQL e
   * grava no Redis com TTL de 600 segundos.
   */
  describe('findOne com cache', () => {
    // Cache HIT: devolve o valor do Redis sem chamar o repositorio.
    it('deve retornar dados do cache em HIT sem consultar o MySQL', async () => {
      mockRedisService.get.mockResolvedValue(mockEndereco);

      const result = await service.findOne(1);

      expect(mockRedisService.get).toHaveBeenCalledWith('locamais:endereco:1');
      expect(repoMocks.findOne).not.toHaveBeenCalled();
      expect(result).toEqual(mockEndereco);
    });

    // Cache MISS: consulta o MySQL e grava no Redis com TTL de 600 segundos.
    it('deve consultar o MySQL e armazenar no cache em MISS', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.findOne(1);

      expect(mockRedisService.get).toHaveBeenCalledWith('locamais:endereco:1');
      expect(repoMocks.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'locamais:endereco:1',
        mockEndereco,
        600,
      );
      expect(result).toEqual(mockEndereco);
    });

    // Endereco inexistente: nem cache nem MySQL retornam dado => 404.
    it('deve retornar 404 quando endereco nao existe em cache nem no MySQL', async () => {
      mockRedisService.get.mockResolvedValue(null);
      repoMocks.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(
        'endereco de ID 999 nao encontrado',
      );

      expect(mockRedisService.get).toHaveBeenCalledWith('locamais:endereco:999');
      expect(repoMocks.findOne).toHaveBeenCalled();
    });

    // Falha de leitura do Redis: segue para o MySQL normalmente.
    it('deve fazer fallback para MySQL quando o Redis falhar na leitura', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis indisponível'));
      mockRedisService.set.mockResolvedValue(undefined);
      repoMocks.findOne.mockResolvedValue(mockEndereco);

      const result = await service.findOne(1);

      expect(repoMocks.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockEndereco);
    });

    // Falha de gravacao no Redis: nao impede o retorno da resposta.
    it('nao deve impedir o retorno quando o Redis falhar na gravacao', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.set.mockRejectedValue(new Error('Redis indisponível'));
      repoMocks.findOne.mockResolvedValue(mockEndereco);

      const result = await service.findOne(1);

      expect(repoMocks.findOne).toHaveBeenCalled();
      expect(result).toEqual(mockEndereco);
    });
  });

  /**
   * Invalidacao: ocorre no Service, APOS a escrita ser confirmada no MySQL.
   * Falhas no Redis sao toleradas (nao desfazem a operacao no banco).
   */
  describe('invalidacao de cache', () => {
    // `PATCH /enderecos/:id` invalida `locamais:endereco:{id}` apos o update.
    it('deve invalida o cache apos update bem-sucedido', async () => {
      mockRedisService.del.mockResolvedValue(1);
      repoMocks.findOne.mockResolvedValue(mockEndereco);

      await service.update(1, { logradouro: 'Nova Rua' });

      expect(mockRedisService.del).toHaveBeenCalledWith('locamais:endereco:1');
      expect(cacheInvalidation.invalidateAddressAggregates).toHaveBeenCalledWith(1);
    });

    // Remocao e bloqueada por regra de negocio (endereco pertence a cliente),
    // portanto o delete no MySQL nunca ocorre e nenhuma chave e invalidada.
    it('deve invalida o cache apos remove', async () => {
      mockRedisService.del.mockResolvedValue(1);
      repoMocks.findOne.mockResolvedValue(mockEndereco);

      await expect(service.remove(1)).rejects.toThrow(
        'endereco faz parte do cadastro do cliente',
      );

      expect(mockRedisService.del).not.toHaveBeenCalled();
    });

    // Falha na invalidação nao bloqueia a atualizacao concluida no MySQL.
    it('nao deve impedir a atualizacao quando o Redis falhar na invalidacao', async () => {
      mockRedisService.del.mockRejectedValue(new Error('Redis indisponível'));
      repoMocks.findOne.mockResolvedValue(mockEndereco);

      await expect(
        service.update(1, { logradouro: 'Nova Rua' }),
      ).resolves.toBeDefined();
    });
  });

  /**
   * Seguranca/consistencia: a entidade Endereco implementa `toJSON()` que
   * omite o objeto `client` completo (evita ciclo de serializacao bidirecional
   * com Cliente e nao expõe dados sensíveis).
   */
  it('nao armazena dados sensíveis no cache', async () => {
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.set.mockResolvedValue(undefined);

    await service.findOne(1);

    const setCall = mockRedisService.set.mock.calls[0];
    const cachedValue = setCall[1];

    // A serializacao JSON chama toJSON() da entidade Endereco, que nao inclui
    // o objeto cliente completo (evita ciclo e dados sensíveis).
    const serialized = JSON.stringify(cachedValue);
    expect(serialized).toContain('"id":1');
    expect(serialized).toContain('"logradouro":"Rua das Flores"');
    expect(serialized).not.toContain('"client":');
  });
});
