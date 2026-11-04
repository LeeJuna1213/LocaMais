import { Test, TestingModule } from '@nestjs/testing';

import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { Usuario } from './entities/usuario.entity.js';
import { TipoUsuario } from './enums/usuario.enum.js';
import { UsuarioController } from './usuario.controller.js';
import { UsuarioService } from './usuario.service.js';

// `Object.assign(new Usuario(), ...)` garante que o mock tenha também o método
// toJSON() da entidade, e não apenas os campos.
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

const admin: UsuarioAutenticado = {
  id: 99,
  email: 'admin@exemplo.com',
  name: 'Admin',
  type: TipoUsuario.ADMIN,
};

const mockUsuarioService = {
  create: vi.fn().mockResolvedValue(mockUser),
  findAll: vi.fn().mockResolvedValue([mockUser]),
  findOne: vi.fn().mockResolvedValue(mockUser),
  findOneForActor: vi.fn().mockResolvedValue(mockUser),
  update: vi.fn().mockResolvedValue(mockUser),
  remove: vi.fn().mockResolvedValue(undefined),
  findOneOrFail: vi.fn().mockResolvedValue(mockUser),
  findByEmailWithPassword: vi.fn().mockResolvedValue(mockUser),
  hashPassword: vi.fn().mockResolvedValue('$2b$10$new'),
  comparePassword: vi.fn().mockResolvedValue(true),
};

describe('UsuarioController', () => {
  let controller: UsuarioController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsuarioController],
      providers: [
        {
          provide: UsuarioService,
          useValue: mockUsuarioService,
        },
      ],
    }).compile();

    controller = module.get<UsuarioController>(UsuarioController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll chama service.findAll', async () => {
    const result = await controller.findAll();
    expect(mockUsuarioService.findAll).toHaveBeenCalled();
    expect(result).toEqual([mockUser]);
  });

  it('findOne chama service.findOneForActor com o ator e o id', async () => {
    const result = await controller.findOne(admin, 1);

    expect(mockUsuarioService.findOneForActor).toHaveBeenCalledWith(admin, 1);
    expect(result).toEqual(mockUser);
  });

  it('remove delega a desativacao ao service', async () => {
    await controller.remove(admin, 1);
    expect(mockUsuarioService.remove).toHaveBeenCalledWith(admin, 1);
  });
});
