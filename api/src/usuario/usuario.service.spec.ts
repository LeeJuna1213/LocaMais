import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Usuario } from './entities/usuario.entity.js';
import { TipoUsuario } from './enums/usuario.enum.js';
import { UsuarioService } from './usuario.service.js';

describe('UsuarioService', () => {
  let service: UsuarioService;

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

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<UsuarioService>(UsuarioService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll chama repository.find', async () => {
    const result = await service.findAll();

    expect(repoMocks.find).toHaveBeenCalled();
    expect(result).toEqual([mockUser]);
  });

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
});
