import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity.js';

const mockUser = {
  id: 1,
  name: 'Test User',
  email: 'test@exemplo.com',
  password: '$2b$10$hash',
  active: true,
  type: 'cliente',
  created_at: new Date(),
  updated_at: new Date(),
} as User;

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
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: vi.fn().mockReturnValue({
              exists: vi.fn().mockResolvedValue(false),
            }),
            transaction: vi.fn().mockImplementation((fn) => fn({ create: vi.fn(), save: vi.fn() })),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('4'),
            getOrThrow: vi.fn().mockReturnValue('test-secret'),
          },
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

  it('findOne chama service.findOneForActor', async () => {
    const result = await controller.findOne('1');
    expect(mockUserService.findOneForActor).toHaveBeenCalled();
    const calls = mockUserService.findOneForActor.mock.calls;
    const [arg0, arg1] = calls[0] || [];
    // Sem guards/pipes, o id vem como string e actor como undefined
    expect(arg0).toBe('1');
    expect(arg1).toBeUndefined();
    expect(result).toEqual(mockUser);
  });
});