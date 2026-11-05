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

import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { normalizeEmail } from '../common/utils/normalize.utility.js';

import { CreateUsuarioDto } from './dto/create-usuario.dto.js';
import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import { Usuario } from './entities/usuario.entity.js';
import { TipoUsuario } from './enums/usuario.enum.js';

/**
 * SERVIÇO DE USUÁRIOS — CONTAS E CREDENCIAIS
 *
 * Responsabilidade deste Service:
 * - criar, consultar, listar, atualizar e desativar contas de usuário;
 * - validar permissões de gerenciamento de contas;
 * - gerar e comparar hashes de senha;
 * - apoiar a autenticação (busca por e-mail e recarga do usuário).
 *
 * O cadastro cadastral do cliente (CPF/CNPJ, endereço etc.) NÃO fica aqui.
 * Ele pertence ao `ClienteService`. Quando o cadastro de um cliente precisa
 * criar a conta de acesso, o `ClienteService` reutiliza os métodos públicos
 * deste Service dentro da própria transação.
 *
 * Fluxo comum: Controller -> UsuarioService -> Repository<Usuario> -> banco.
 */
@Injectable()
export class UsuarioService {
  private readonly bcryptRounds: number;

  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepository: Repository<Usuario>,
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
   * Contas de cliente são criadas pelo `ClienteService`, porque exigem os
   * dados cadastrais PF/PJ e o endereço na mesma transação. Manter essa
   * separação evita uma conta de cliente sem o registro de cliente.
   */
  async create(
    actor: UsuarioAutenticado,
    dto: CreateUsuarioDto,
  ): Promise<Usuario> {
    this.assertCanCreate(actor, dto.type);

    if (dto.type === TipoUsuario.CLIENTE) {
      throw new BadRequestException(
        'clientes devem ser cadastrados em POST /api/clientes',
      );
    }

    const email = await this.ensureEmailAvailable(dto.email);

    const saved = await this.usuariosRepository.save(
      this.usuariosRepository.create({
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
   * Este método é uma integração controlada com o `ClienteService`: a conta e
   * os dados de cliente/endereço devem ser confirmados ou revertidos juntos.
   * O chamador é responsável por validar e-mail/documento antes da transação.
   */
  async createAccountInTransaction(
    manager: EntityManager,
    data: DadosContaUsuario,
  ): Promise<Usuario> {
    return manager.save(
      manager.create(Usuario, {
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
   * É público porque o `ClienteService` precisa validar a unicidade da conta
   * antes de abrir a transação de Usuario + Cliente + Endereco.
   */
  async ensureEmailAvailable(email: string): Promise<string> {
    const normalized = normalizeEmail(email);

    if (await this.usuariosRepository.exists({ where: { email: normalized } })) {
      throw new ConflictException('ja existe um usuario com este email');
    }

    return normalized;
  }

  /** Lista todas as contas com o bloco de cliente e endereço, quando houver. */
  findAll(): Promise<Usuario[]> {
    return this.usuariosRepository.find({
      relations: { client: { address: true } },
      order: { id: 'ASC' },
    });
  }

  /** Busca uma conta por ID. Retorna `null` quando não existe. */
  findOne(id: number): Promise<Usuario | null> {
    return this.usuariosRepository.findOne({
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
  findByEmailWithPassword(email: string): Promise<Usuario | null> {
    return this.usuariosRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  /** Busca uma conta existente ou lança HTTP 404. */
  async findOneOrFail(id: number): Promise<Usuario> {
    const user = await this.findOne(id);

    if (!user) {
      throw new NotFoundException(`usuario ${id} nao encontrado`);
    }

    return user;
  }

  /** Consulta com controle de acesso: cliente só pode ler a própria conta. */
  async findOneForActor(
    actor: UsuarioAutenticado,
    id: number,
  ): Promise<Usuario> {
    this.assertCanRead(actor, id);
    return this.findOneOrFail(id);
  }

  /** Atualiza dados da conta; somente admin altera `active`. */
  async update(
    actor: UsuarioAutenticado,
    id: number,
    dto: UpdateUsuarioDto,
  ): Promise<Usuario> {
    const isSelf = actor.id === id;
    const isAdmin = actor.type === TipoUsuario.ADMIN;

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('voce so pode alterar o proprio usuario');
    }

    if (dto.active !== undefined && !isAdmin) {
      throw new ForbiddenException(
        'apenas admins podem ativar/desativar usuarios',
      );
    }

    const target = await this.findOneOrFail(id);
    const changes: Partial<Usuario> = {};

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

    await this.usuariosRepository.update({ id }, changes);
    return this.findOneOrFail(id);
  }

  /**
   * Desativa uma conta (soft delete), preservando o histórico.
   *
   * Regras: somente admin, nunca a própria conta e nunca o último admin.
   */
  async remove(actor: UsuarioAutenticado, id: number): Promise<void> {
    if (actor.type !== TipoUsuario.ADMIN) {
      throw new ForbiddenException('apenas admins podem remover usuarios');
    }

    if (actor.id === id) {
      throw new BadRequestException('um admin nao pode remover a si mesmo');
    }

    const target = await this.findOneOrFail(id);

    if (
      target.type === TipoUsuario.ADMIN &&
      (await this.countAdmins()) <= 1
    ) {
      throw new BadRequestException('nao e possivel remover o unico admin');
    }

    await this.deactivateAccount(id);
  }

  /**
   * Desativa a conta vinculada a um cliente.
   *
   * O `ClienteService` chama este método ao desativar o cadastro do cliente.
   * A situação `active` pertence à conta, por isso a atualização fica aqui.
   */
  async deactivateAccount(userId: number): Promise<void> {
    await this.usuariosRepository.update({ id: userId }, { active: false });
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
   * É público para que o `ClienteService` reuse a mesma regra ao cadastrar
   * clientes, em vez de duplicar a checagem de papéis.
   */
  assertCanCreate(actor: UsuarioAutenticado, type: TipoUsuario): void {
    if (actor.type === TipoUsuario.ADMIN) return;

    if (actor.type === TipoUsuario.FUNCIONARIO) {
      if (type !== TipoUsuario.CLIENTE) {
        throw new ForbiddenException(
          'funcionarios so podem criar clientes',
        );
      }
      return;
    }

    throw new ForbiddenException('clientes nao podem criar outros usuarios');
  }

  private assertCanRead(actor: UsuarioAutenticado, id: number): void {
    if (actor.type === TipoUsuario.ADMIN || actor.type === TipoUsuario.FUNCIONARIO) {
      return;
    }

    if (actor.id !== id) {
      throw new ForbiddenException('clientes so podem ler o proprio registro');
    }
  }

  private emailExists(email: string): Promise<boolean> {
    return this.usuariosRepository.exists({ where: { email } });
  }

  private countAdmins(): Promise<number> {
    return this.usuariosRepository.count({ where: { type: TipoUsuario.ADMIN } });
  }
}

/**
 * Dados mínimos para criar a conta dentro de uma transação já aberta.
 *
 * A senha chega como hash porque o `ClienteService` a gera antes da transação,
 * evitando manter a senha em texto durante as operações de banco.
 */
export interface DadosContaUsuario {
  name: string;
  email: string;
  passwordHash: string;
  type: TipoUsuario;
}
