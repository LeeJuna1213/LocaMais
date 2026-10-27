import { Test, TestingModule } from '@nestjs/testing';

import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { User } from './entities/user.entity.js';
import { UserType } from './enums/user.enum.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';

// `Object.assign(new User(), ...)` garante que o mock tenha também o método
// toJSON() da entidade, e não apenas os campos.
const mockUser = Object.assign(new User(), {
  id: 1,
  name: 'Test User',
  email: 'test@exemplo.com',
  password: '$2b$10$hash',
  active: true,
  type: UserType.CLIENTE,
  client: null,
  created_at: new Date(),
  updated_at: new Date(),
});

const admin: AuthenticatedUser = {
  id: 99,
  email: 'admin@exemplo.com',
  name: 'Admin',
  type: UserType.ADMIN,
};

const mockUserService = {
  create: vi.fn().mockResolvedValue(mockUser),
  findAll: vi.fn().mockResolvedValue([mockUser]),
  findOne: vi.fn().mockResolvedValue(mockUser),
  findOneForActor: vi.fn().mockResolvedValue(mockUser),
  update: vi.fn().mockResolvedValue(mockUser),
  remove: vi.fn().mockResolvedValue(undefined),
  findOneOrFail: vi.fn().mockResolvedValue(mockUser),
  findAllClients: vi.fn().mockResolvedValue([mockUser]),
  findByEmailWithPassword: vi.fn().mockResolvedValue(mockUser),
  hashPassword: vi.fn().mockResolvedValue('$2b$10$new'),
  comparePassword: vi.fn().mockResolvedValue(true),
};

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll chama service.findAll', async () => {
    const result = await controller.findAll();
    expect(mockUserService.findAll).toHaveBeenCalled();
    expect(result).toEqual([mockUser]);
  });

  it('findOne chama service.findOneForActor com o ator e o id', async () => {
    const result = await controller.findOne(admin, 1);

    expect(mockUserService.findOneForActor).toHaveBeenCalledWith(admin, 1);
    expect(result).toEqual(mockUser);
  });

  it('remove delega a desativacao ao service', async () => {
    await controller.remove(admin, 1);
    expect(mockUserService.remove).toHaveBeenCalledWith(admin, 1);
  });
});
