import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { UserService } from './user.service.js';

describe('UserService', () => {
  let service: UserService;
  let repo: Repository<User>;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
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
          },
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: vi.fn().mockReturnValue({
              exists: vi.fn().mockResolvedValue(false),
            }),
            transaction: vi.fn().mockImplementation((fn) =>
              fn({
                create: vi.fn().mockReturnValue(mockUser),
                save: vi.fn().mockResolvedValue(mockUser),
              }),
            ),
          },
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

    service = module.get<UserService>(UserService);
    repo = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll chama repository.find', async () => {
    const result = await service.findAll();
    expect(repo.find).toHaveBeenCalled();
    expect(result).toEqual([mockUser]);
  });

  it('findOne chama repository.findOne', async () => {
    const result = await service.findOne(1);
    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, relations: { client: { address: true } } }),
    );
    expect(result).toEqual(mockUser);
  });
});