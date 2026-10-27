import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { normalizeDocument } from '../common/utils/normalize.utility.js';
import { CreateUserDto } from '../user/dto/create-user.dto.js';
import { User } from '../user/entities/user.entity.js';
import { TipoPessoa, UserType } from '../user/enums/user.enum.js';
import { UserService } from '../user/user.service.js';

import { CreateClientAccountDto } from './dto/create-client-account.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { Client } from './entities/client.entity.js';

/**
 * Regras de negócio do cliente.
 *
 * O `ClientService` NÃO recria usuários nem endereços: ele reaproveita o
 * `UserService` para o cadastro transacional (User + Client + Address) e os
 * Repositories registrados no `UserModule`.
 *
 * Injeção de dependência:
 * - `Repository<Client>` e `Repository<User>` vêm do `TypeOrmModule.forFeature`
 *   declarado no `UserModule`, que exporta o próprio `TypeOrmModule`.
 * - `UserService` é exportado pelo `UserModule` e concentra as regras de
 *   criação de usuário (permissões, hash de senha, transação).
 */
@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly userService: UserService,
  ) {}

  /** Busca o cliente pelo ID do usuário associado (chave única 1:1). */
  findByUserId(userId: number): Promise<Client | null> {
    return this.clientsRepository.findOne({
      where: { user_id: userId },
      relations: { user: true, address: true },
    });
  }

  /**
   * Busca um cliente pelo ID.
   * Lança 404 quando não existe — o Controller não devolve `null`.
   */
  async findOne(id: number): Promise<Client> {
    const client = await this.clientsRepository.findOne({
      where: { id },
      relations: { user: true, address: true },
    });

    if (!client) {
      throw new NotFoundException(`cliente de ID ${id} nao encontrado`);
    }

    return client;
  }

  /** Lista todos os clientes com o usuário e o endereço associados. */
  findAll(): Promise<Client[]> {
    return this.clientsRepository.find({
      relations: { user: true, address: true },
      order: { id: 'ASC' },
    });
  }

  /**
   * Leitura com controle de acesso.
   *
   * Admin e funcionário podem ler qualquer cliente; um cliente autenticado
   * só pode ler o próprio registro. A comparação é feita com `client.user_id`
   * (e não com o ID do cliente), porque o token carrega o ID do usuário.
   */
  async findOneForActor(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<Client> {
    const client = await this.findOne(id);
    this.assertCanRead(actor, client);
    return client;
  }

  /**
   * Cria uma conta completa de cliente:
   * User + Client + Address, em uma única transação no `UserService`.
   *
   * O `type` é imposto como CLIENTE aqui, nunca vem do body.
   */
  async create(
    actor: AuthenticatedUser,
    dto: CreateClientAccountDto,
  ): Promise<Client> {
    const payload: CreateUserDto = {
      name: dto.name.trim(),
      email: dto.email,
      password: dto.password,
      type: UserType.CLIENTE,
      cliente: dto.cliente,
    };

    const user = await this.userService.create(actor, payload);

    const client = await this.findByUserId(user.id);
    if (!client) {
      // Situação defensiva: o UserService acabou de criar o cliente.
      throw new NotFoundException(
        `cliente do usuario ${user.id} nao encontrado apos o cadastro`,
      );
    }

    return client;
  }

  /**
   * Atualização parcial dos atributos de cliente.
   *
   * Além de aplicar apenas os campos enviados, o método mantém a coerência
   * PF/PJ: ao virar PF, `cnpj` e `razao_social` são zerados; ao virar PJ,
   * `cpf` e `data_nascimento` são zerados. Também valida CPF/CNPJ duplicado.
   */
  async update(id: number, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findOne(id);

    // Valor final de cada campo: o enviado no PATCH ou o que já está no banco.
    const tipo = dto.tipo_pessoa ?? client.tipo_pessoa;

    const cpf =
      dto.cpf !== undefined
        ? normalizeDocument(dto.cpf)
        : client.cpf;
    const cnpj =
      dto.cnpj !== undefined
        ? normalizeDocument(dto.cnpj)
        : client.cnpj;
    const dataNascimento =
      dto.data_nascimento !== undefined
        ? dto.data_nascimento
        : client.data_nascimento;
    const razaoSocial =
      dto.razao_social !== undefined
        ? dto.razao_social.trim()
        : client.razao_social;

    if (tipo === TipoPessoa.PF) {
      if (dto.cnpj) {
        throw new BadRequestException(
          'cnpj nao deve ser informado para clientes do tipo PF',
        );
      }
      if (dto.razao_social) {
        throw new BadRequestException(
          'razao_social nao deve ser informada para clientes do tipo PF',
        );
      }
      if (!cpf) {
        throw new BadRequestException('cpf e obrigatorio para clientes do tipo PF');
      }
      if (!dataNascimento) {
        throw new BadRequestException(
          'data_nascimento e obrigatoria para clientes do tipo PF',
        );
      }
    } else {
      if (dto.cpf) {
        throw new BadRequestException(
          'cpf nao deve ser informado para clientes do tipo PJ',
        );
      }
      if (dto.data_nascimento) {
        throw new BadRequestException(
          'data_nascimento nao deve ser informada para clientes do tipo PJ',
        );
      }
      if (!cnpj) {
        throw new BadRequestException('cnpj e obrigatorio para clientes do tipo PJ');
      }
      if (!razaoSocial) {
        throw new BadRequestException(
          'razao_social e obrigatoria para clientes do tipo PJ',
        );
      }
    }

    // O documento relevante depende do tipo. A checagem abaixo também serve
    // para o TypeScript estreitar `string | null` para `string` antes de usar
    // o valor na consulta (o `where` do TypeORM não aceita `null`).
    const documento = tipo === TipoPessoa.PF ? cpf : cnpj;
    if (!documento) {
      throw new BadRequestException('documento e obrigatorio');
    }

    const conflito = await this.clientsRepository.findOne({
      where: [{ cpf: documento }, { cnpj: documento }],
    });

    if (conflito && conflito.id !== id) {
      throw new ConflictException(
        tipo === TipoPessoa.PF
          ? 'ja existe um cliente com este CPF'
          : 'ja existe um cliente com este CNPJ',
      );
    }

    // Ao trocar de tipo, os campos do outro tipo são anulados. O @Check do
    // banco também impede que cpf e cnpj fiquem preenchidos ao mesmo tempo.
    await this.clientsRepository.update(
      { id },
      {
        tipo_pessoa: tipo,
        cpf: tipo === TipoPessoa.PF ? cpf : null,
        cnpj: tipo === TipoPessoa.PJ ? cnpj : null,
        data_nascimento: tipo === TipoPessoa.PF ? dataNascimento : null,
        razao_social: tipo === TipoPessoa.PJ ? razaoSocial : null,
      },
    );

    return this.findOne(id);
  }

  /**
   * Desativação lógica do cliente.
   *
   * Não apagamos o registro de `clients` nem o endereço: o histórico e a
   * integridade dos relacionamentos são preservados. O que bloqueia o acesso
   * é `users.active = false`, verificado no login e no `JwtStrategy`.
   */
  async remove(id: number): Promise<void> {
    const client = await this.findOne(id);

    await this.usersRepository.update(
      { id: client.user_id },
      { active: false },
    );
  }

  /** Admin/funcionário leem qualquer cliente; cliente lê apenas o próprio. */
  private assertCanRead(actor: AuthenticatedUser, client: Client): void {
    if (
      actor.type === UserType.ADMIN ||
      actor.type === UserType.FUNCIONARIO
    ) {
      return;
    }

    if (client.user_id !== actor.id) {
      throw new ForbiddenException('clientes so podem ler o proprio registro');
    }
  }
}
