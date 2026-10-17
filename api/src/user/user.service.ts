import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { RegisterDto } from '../auth/dto/register.dto.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import {
  normalizeDocument,
  normalizeEmail,
} from '../common/utils/normalize.utility.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { Address } from './entities/address.entity.js';
import { Client } from './entities/client.entity.js';
import { User } from './entities/user.entity.js';
import { TipoPessoa, UserType } from './enums/user.enum.js';

/** Custo padrao do bcrypt. */
const DEFAULT_BCRYPT_ROUNDS = 10;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.bcryptRounds = Number(
      configService.get<string>('BCRYPT_ROUNDS') ?? DEFAULT_BCRYPT_ROUNDS,
    );
  }

  /**
   * Cria um usuario respeitando quem esta criando.
   *
   * - admin      -> pode criar admin, funcionario ou cliente
   * - funcionario-> so pode criar cliente
   * - cliente    -> nao pode criar ninguem
   */
  async create(actor: AuthenticatedUser, dto: CreateUserDto): Promise<User> {
    this.assertCanCreate(actor, dto.type);

    const email = normalizeEmail(dto.email);

    if (await this.emailExists(email)) {
      throw new ConflictException('ja existe um usuario com este email');
    }

    if (dto.type !== UserType.CLIENTE) {
      const saved = await this.usersRepository.save(
        this.usersRepository.create({
          name: dto.name.trim(),
          email,
          password: await this.hashPassword(dto.password),
          type: dto.type,
          active: true,
        }),
      );

      // Recarrega para devolver exatamente o que o banco tem, sem o hash que
      // ficou apenas na memoria.
      return this.findOneOrFail(saved.id);
    }

    return this.createClient(dto, email, await this.hashPassword(dto.password));
  }

  /**
   * Auto-cadastro. Sem ator: o tipo e forcado para `cliente` e nao pode ser
   * influenciado pelo payload.
   */
  async registerClient(dto: RegisterDto): Promise<User> {
    const email = normalizeEmail(dto.email);

    if (await this.emailExists(email)) {
      throw new ConflictException('ja existe um usuario com este email');
    }

    return this.createClient(
      {
        name: dto.name,
        email: dto.email,
        password: dto.password,
        type: UserType.CLIENTE,
        cliente: dto.cliente,
      } as CreateUserDto,
      email,
      await this.hashPassword(dto.password),
    );
  }

  /** Cria usuario + cliente + endereco dentro de uma unica transacao. */
  private async createClient(
    dto: CreateUserDto,
    email: string,
    password: string,
  ): Promise<User> {
    const client = dto.cliente as CreateClientDto;
    const documento =
      client.tipo_pessoa === TipoPessoa.PF ? client.cpf : client.cnpj;

    if (documento) {
      const normalized = normalizeDocument(documento);
      if (await this.documentoExists(normalized)) {
        throw new ConflictException(
          client.tipo_pessoa === TipoPessoa.PF
            ? 'ja existe um cliente com este CPF'
            : 'ja existe um cliente com este CNPJ',
        );
      }
    }

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        const savedUser = await manager.save(
          manager.create(User, {
            name: dto.name.trim(),
            email,
            password,
            type: UserType.CLIENTE,
            active: true,
          }),
        );

        const savedClient = await manager.save(
          manager.create(Client, {
            user_id: savedUser.id,
            tipo_pessoa: client.tipo_pessoa,
            cpf: client.cpf ? normalizeDocument(client.cpf) : null,
            cnpj: client.cnpj ? normalizeDocument(client.cnpj) : null,
            data_nascimento: client.data_nascimento ?? null,
            razao_social: client.razao_social?.trim() ?? null,
          }),
        );

        await manager.save(
          manager.create(Address, {
            client_id: savedClient.id,
            logradouro: client.endereco.logradouro.trim(),
            numero: client.endereco.numero.trim(),
            complemento: client.endereco.complemento?.trim() || null,
            bairro: client.endereco.bairro.trim(),
            cidade: client.endereco.cidade.trim(),
            uf: client.endereco.uf.toUpperCase(),
            cep: client.endereco.cep,
          }),
        );

        return savedUser;
      });

      return this.findOneOrFail(user.id);
    } catch (error) {
      this.logger.error('falha ao criar cliente', error);
      throw error;
    }
  }

  /** Lista todos os usuarios com o bloco de cliente e endereco. */
  findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: { client: { address: true } },
      order: { id: 'ASC' },
    });
  }

  /** Lista apenas clientes. */
  findAllClients(): Promise<User[]> {
    return this.usersRepository.find({
      where: { type: UserType.CLIENTE },
      relations: { client: { address: true } },
      order: { id: 'ASC' },
    });
  }

  findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: { client: { address: true } },
    });
  }

  /** Busca usuario por email incluindo o hash (uso restrito ao login). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async findOneOrFail(id: number): Promise<User> {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException(`usuario ${id} nao encontrado`);
    return user;
  }

  /** Leitura permitida a admin/funcionario; cliente so o proprio registro. */
  async findOneForActor(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<User> {
    this.assertCanRead(actor, id);
    return this.findOneOrFail(id);
  }

  /** Atualizacao permitida a admin (tudo) ou ao proprio usuario (sem `active`). */
  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateUserDto,
  ): Promise<User> {
    const isSelf = actor.id === id;
    const isAdmin = actor.type === UserType.ADMIN;

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('voce so pode alterar o proprio usuario');
    }

    if (dto.active !== undefined && !isAdmin) {
      throw new ForbiddenException('apenas admins podem ativar/desativar usuarios');
    }

    const target = await this.findOneOrFail(id);
    const changes: Partial<User> = {};

    if (dto.name !== undefined) changes.name = dto.name.trim();

    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email);
      if (email !== target.email && (await this.emailExists(email))) {
        throw new ConflictException('ja existe um usuario com este email');
      }
      changes.email = email;
    }

    if (dto.password !== undefined) {
      changes.password = await this.hashPassword(dto.password);
    }

    if (dto.active !== undefined) changes.active = dto.active;

    await this.usersRepository.update({ id }, changes);
    return this.findOneOrFail(id);
  }

  /** Delecao restrita a admin, nunca do proprio usuario. */
  async remove(actor: AuthenticatedUser, id: number): Promise<void> {
    if (actor.type !== UserType.ADMIN) {
      throw new ForbiddenException('apenas admins podem remover usuarios');
    }

    if (actor.id === id) {
      throw new BadRequestException('um admin nao pode remover a si mesmo');
    }

    const target = await this.findOneOrFail(id);

    if (
      target.type === UserType.ADMIN &&
      (await this.countAdmins()) <= 1
    ) {
      throw new BadRequestException('nao e possivel remover o unico admin');
    }

    await this.usersRepository.delete({ id });
  }

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.bcryptRounds);
  }

  comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  private assertCanCreate(actor: AuthenticatedUser, type: UserType): void {
    if (actor.type === UserType.ADMIN) return;

    if (actor.type === UserType.FUNCIONARIO) {
      if (type !== UserType.CLIENTE) {
        throw new ForbiddenException(
          'funcionarios so podem criar clientes',
        );
      }
      return;
    }

    throw new ForbiddenException('clientes nao podem criar outros usuarios');
  }

  private assertCanRead(actor: AuthenticatedUser, id: number): void {
    if (actor.type === UserType.ADMIN || actor.type === UserType.FUNCIONARIO) {
      return;
    }

    if (actor.id !== id) {
      throw new ForbiddenException('clientes so podem ler o proprio registro');
    }
  }

  private emailExists(email: string): Promise<boolean> {
    return this.usersRepository.exists({ where: { email } });
  }

  private documentoExists(documento: string): Promise<boolean> {
    return this.dataSource
      .getRepository(Client)
      .exists({ where: [{ cpf: documento }, { cnpj: documento }] });
  }

  private countAdmins(): Promise<number> {
    return this.usersRepository.count({ where: { type: UserType.ADMIN } });
  }
}