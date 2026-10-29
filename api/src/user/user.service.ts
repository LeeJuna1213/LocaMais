import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { EntityManager, Repository } from 'typeorm';

import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { normalizeEmail } from '../common/utils/normalize.utility.js';

import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';
import { UserType } from './enums/user.enum.js';

/**
 * USER SERVICE — CONTAS E CREDENCIAIS
 *
 * Responsabilidade deste Service:
 * - criar, consultar, listar, atualizar e desativar contas de usuário;
 * - validar permissões de gerenciamento de contas;
 * - gerar e comparar hashes de senha;
 * - apoiar a autenticação (busca por e-mail e recarga do usuário).
 *
 * O cadastro cadastral do cliente (CPF/CNPJ, endereço etc.) NÃO fica aqui.
 * Ele pertence ao `ClientService`. Quando o cadastro de um cliente precisa
 * criar a conta de acesso, o `ClientService` reutiliza os métodos públicos
 * deste Service dentro da própria transação.
 *
 * Fluxo comum: Controller -> UserService -> Repository<User> -> banco.
 */
@Injectable()
export class UserService {
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    configService: ConfigService,
  ) {
    // O custo do bcrypt pode ser ajustado no ambiente. O fallback mantém o
    // comportamento anterior quando a variável não está configurada.
    this.bcryptRounds = Number(
      configService.get<string>('BCRYPT_ROUNDS') ?? 10,
    );
  }

  /**
   * Cria uma conta administrativa ou de funcionário.
   *
   * Contas de cliente são criadas pelo `ClientService`, porque exigem os
   * dados cadastrais PF/PJ e o endereço na mesma transação. Manter essa
   * separação evita uma conta de cliente sem o registro de cliente.
   */
  async create(
    actor: AuthenticatedUser,
    dto: CreateUserDto,
  ): Promise<User> {
    this.assertCanCreate(actor, dto.type);

    if (dto.type === UserType.CLIENTE) {
      throw new BadRequestException(
        'clientes devem ser cadastrados em POST /api/clients',
      );
    }

    const email = await this.ensureEmailAvailable(dto.email);

    const saved = await this.usersRepository.save(
      this.usersRepository.create({
        name: dto.name.trim(),
        email,
        password: await this.hashPassword(dto.password),
        type: dto.type,
        active: true,
      }),
    );

    // Recarrega sem o hash para devolver ao Controller apenas dados públicos.
    return this.findOneOrFail(saved.id);
  }

  /**
   * Cria somente a linha de `users` usando um EntityManager já transacional.
   *
   * Este método é uma integração controlada com o `ClientService`: a conta e
   * os dados de cliente/endereço devem ser confirmados ou revertidos juntos.
   * O chamador é responsável por validar e-mail/documento antes da transação.
   */
  async createAccountInTransaction(
    manager: EntityManager,
    data: CreateUserAccountData,
  ): Promise<User> {
    return manager.save(
      manager.create(User, {
        name: data.name.trim(),
        email: data.email,
        password: data.passwordHash,
        type: data.type,
        active: true,
      }),
    );
  }

  /**
   * Normaliza o e-mail e garante que ele ainda não está em uso.
   *
   * É público porque o `ClientService` precisa validar a unicidade da conta
   * antes de abrir a transação de User + Client + Address.
   */
  async ensureEmailAvailable(email: string): Promise<string> {
    const normalized = normalizeEmail(email);

    if (await this.usersRepository.exists({ where: { email: normalized } })) {
      throw new ConflictException('ja existe um usuario com este email');
    }

    return normalized;
  }

  /** Lista todas as contas com o bloco de cliente e endereço, quando houver. */
  findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: { client: { address: true } },
      order: { id: 'ASC' },
    });
  }

  /** Busca uma conta por ID. Retorna `null` quando não existe. */
  findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: { client: { address: true } },
    });
  }

  /**
   * Busca por e-mail incluindo o hash da senha.
   *
   * A senha tem `select: false` na entidade; o QueryBuilder a solicita
   * explicitamente apenas para o fluxo de login.
   */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  /** Busca uma conta existente ou lança HTTP 404. */
  async findOneOrFail(id: number): Promise<User> {
    const user = await this.findOne(id);

    if (!user) {
      throw new NotFoundException(`usuario ${id} nao encontrado`);
    }

    return user;
  }

  /** Consulta com controle de acesso: cliente só pode ler a própria conta. */
  async findOneForActor(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<User> {
    this.assertCanRead(actor, id);
    return this.findOneOrFail(id);
  }

  /** Atualiza dados da conta; somente admin altera `active`. */
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
      throw new ForbiddenException(
        'apenas admins podem ativar/desativar usuarios',
      );
    }

    const target = await this.findOneOrFail(id);
    const changes: Partial<User> = {};

    if (dto.name !== undefined) {
      changes.name = dto.name.trim();
    }

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

    if (dto.active !== undefined) {
      changes.active = dto.active;
    }

    await this.usersRepository.update({ id }, changes);
    return this.findOneOrFail(id);
  }

  /**
   * Desativa uma conta (soft delete), preservando o histórico.
   *
   * Regras: somente admin, nunca a própria conta e nunca o último admin.
   */
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

    await this.deactivateAccount(id);
  }

  /**
   * Desativa a conta vinculada a um cliente.
   *
   * O `ClientService` chama este método ao desativar o cadastro do cliente.
   * A situação `active` pertence à conta, por isso a atualização fica aqui.
   */
  async deactivateAccount(userId: number): Promise<void> {
    await this.usersRepository.update({ id: userId }, { active: false });
  }

  /** Gera um hash bcrypt; a senha original não é armazenada. */
  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.bcryptRounds);
  }

  /** Compara a senha digitada com o hash armazenado. */
  comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Valida quem pode criar cada tipo de conta.
   *
   * É público para que o `ClientService` reuse a mesma regra ao cadastrar
   * clientes, em vez de duplicar a checagem de papéis.
   */
  assertCanCreate(actor: AuthenticatedUser, type: UserType): void {
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

  private countAdmins(): Promise<number> {
    return this.usersRepository.count({ where: { type: UserType.ADMIN } });
  }
}

/**
 * Dados mínimos para criar a conta dentro de uma transação já aberta.
 *
 * A senha chega como hash porque o `ClientService` a gera antes da transação,
 * evitando manter a senha em texto durante as operações de banco.
 */
export interface CreateUserAccountData {
  name: string;
  email: string;
  passwordHash: string;
  type: UserType;
}
