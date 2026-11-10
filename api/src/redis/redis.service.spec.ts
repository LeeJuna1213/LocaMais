import { Redis } from 'ioredis';

import { RedisService } from './redis.service.js';

const mockClient = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
} as unknown as Redis;

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RedisService(mockClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('deve retornar null quando a chave não existe', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await service.get<string>('nao-existe');

      expect(result).toBeNull();
      expect(mockClient.get).toHaveBeenCalledWith('nao-existe');
    });

    it('deve retornar uma string armazenada', async () => {
      mockClient.get.mockResolvedValue('valor-string');

      const result = await service.get<string>('chave-string');

      expect(result).toBe('valor-string');
    });

    it('deve desserializar um objeto JSON armazenado', async () => {
      const objeto = { id: 1, nome: 'LocaMais' };
      mockClient.get.mockResolvedValue(JSON.stringify(objeto));

      const result = await service.get<{ id: number; nome: string }>(
        'chave-objeto',
      );

      expect(result).toEqual(objeto);
    });
  });

  describe('set', () => {
    it('deve armazenar uma string sem TTL', async () => {
      mockClient.set.mockResolvedValue('OK');

      await service.set('chave', 'valor');

      expect(mockClient.set).toHaveBeenCalledWith('chave', 'valor');
    });

    it('deve armazenar um objeto serializado em JSON', async () => {
      const objeto = { id: 1, nome: 'LocaMais' };
      mockClient.set.mockResolvedValue('OK');

      await service.set('chave-objeto', objeto);

      expect(mockClient.set).toHaveBeenCalledWith(
        'chave-objeto',
        JSON.stringify(objeto),
      );
    });

    it('deve armazenar com TTL em segundos quando informado', async () => {
      mockClient.set.mockResolvedValue('OK');

      await service.set('chave-ttl', 'valor', 60);

      expect(mockClient.set).toHaveBeenCalledWith(
        'chave-ttl',
        'valor',
        'EX',
        60,
      );
    });
  });

  describe('del', () => {
    it('deve remover a chave', async () => {
      mockClient.del.mockResolvedValue(1);

      await service.del('chave-remover');

      expect(mockClient.del).toHaveBeenCalledWith('chave-remover');
    });
  });

  describe('exists', () => {
    it('deve retornar true quando a chave existe', async () => {
      mockClient.exists.mockResolvedValue(1);

      const result = await service.exists('chave-existe');

      expect(result).toBe(true);
      expect(mockClient.exists).toHaveBeenCalledWith('chave-existe');
    });

    it('deve retornar false quando a chave não existe', async () => {
      mockClient.exists.mockResolvedValue(0);

      const result = await service.exists('chave-nao-existe');

      expect(result).toBe(false);
    });
  });

  describe('expire', () => {
    it('deve definir TTL para uma chave', async () => {
      mockClient.expire.mockResolvedValue(1);

      await service.expire('chave-expirar', 120);

      expect(mockClient.expire).toHaveBeenCalledWith('chave-expirar', 120);
    });
  });

  describe('getClient', () => {
    it('deve retornar o cliente ioredis original', () => {
      const client = service.getClient();

      expect(client).toBe(mockClient);
    });
  });
});
