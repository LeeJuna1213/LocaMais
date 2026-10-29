import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type { RegisterDto } from '../auth/dto/register.dto.js';
import { AddressService } from '../address/address.service.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { normalizeDocument } from '../common/utils/normalize.utility.js';
import type { User } from '../user/entities/user.entity.js';
import { TipoPessoa, UserType } from '../user/enums/user.enum.js';
import { UserService } from '../user/user.service.js';

import { CreateClientAccountDto } from './dto/create-client-account.dto.js';
import type { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';
import { Client } from './entities/client.entity.js';

/**
 * CLIENT SERVICE — CADASTRO DOS CLIENTES DA LOCADORA
 *
 * Responsabilidade deste Service:
 * - cadastrar clientes PF/PJ com os dados cadastrais e o endereço;
 * - consultar, listar e atualizar dados cadastrais;
 * - validar CPF/CNPJ duplicado;
 * - desativar o cadastro do cliente sem apagar registros.
 *
 * A conta de acesso continua pertencendo ao `UserService`: aqui apenas
 * solicitamos a criação da conta com `type = cliente` dentro da mesma
 * transação. O endereço é criado pelo `AddressService`, também na transação.
 *
 * Dependências:
 * - `Repository<Client>` é registrado pelo `ClientModule`;
 * - `DataSource` abre a transação de User + Client + Address;
 * - `UserService` fornece as regras de conta, e-mail e senha;
 * - `AddressService` fornece a criação do endereço.
 */
@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    @InjectRepository(Client)
    private readonly clientsRepository: Repository<Client>,
    private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly addressService: AddressService,
  ) {}

  /** Busca o cliente pelo ID do usuário associado (chave única 1:1). */
  findByUserId(userId: number): Promise<Client | null> {
    return this.clientsRepository.findOne({
      where: { user_id: userId },
      relations: { user: true, address: true },
    });
  }

  /** Busca um cliente pelo ID; lança 404 quando não existe. */
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

  /** Lista todos os clientes com a conta e o endereço associados. */
  findAll(): Promise<Client[]> {
    return this.clientsRepository.find({
      relations: { user: true, address: true },
      order: { id: 'ASC' },
    });
  }

  /** Admin/funcionário leem qualquer cliente; cliente lê apenas o próprio. */
  async findOneForActor(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<Client> {
    const client = await this.findOne(id);
    this.assertCanRead(actor, client);
    return client;
  }

  /**
   * Cadastro de cliente feito por admin/funcionário.
   *
   * O tipo da conta é imposto como `cliente`; nenhum papel privilegiado pode
   * ser escolhido pelo payload.
   */
  async create(
    actor: AuthenticatedUser,
    dto: CreateClientAccountDto,
  ): Promise<Client> {
    // Reaproveita a regra de permissão de criação de contas do UserService.
    this.userService.assertCanCreate(actor, UserType.CLIENTE);

    const user = await this.createClientAggregate({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      cliente: dto.cliente,
    });

    const client = await this.findByUserId(user.id);

    if (!client) {
      // Defesa contra inconsistência entre as tabelas após a transação.
      throw new NotFoundException(
        `cliente do usuario ${user.id} nao encontrado apos o cadastro`,
      );
    }

    return client;
  }

  /**
   * Auto-cadastro público de cliente.
   *
   * O módulo `auth` chama este método; a conta é sempre criada como `cliente`
   * e o retorno é o `User` para que o AuthService emita o token.
   */
  async registerClient(dto: RegisterDto): Promise<User> {
    return this.createClientAggregate({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      cliente: dto.cliente,
    });
  }

  /**
   * Atualização parcial dos atributos de cliente.
   *
   * Mantém a coerência PF/PJ: ao virar PF, `cnpj`/`razao_social` são
   * anulados; ao virar PJ, `cpf`/`data_nascimento` são anulados. Também
   * impede que o documento de um cliente pertença a outro.
   */
  async update(id: number, dto: UpdateClientDto): Promise<Client> {
    const client = await this.findOne(id);

    const tipo = dto.tipo_pessoa ?? client.tipo_pessoa;

    const cpf =
      dto.cpf !== undefined ? normalizeDocument(dto.cpf) : client.cpf;
    const cnpj =
      dto.cnpj !== undefined ? normalizeDocument(dto.cnpj) : client.cnpj;
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
        throw new BadRequestException(
          'cpf e obrigatorio para clientes do tipo PF',
        );
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
        throw new BadRequestException(
          'cnpj e obrigatorio para clientes do tipo PJ',
        );
      }
      if (!razaoSocial) {
        throw new BadRequestException(
          'razao_social e obrigatoria para clientes do tipo PJ',
        );
      }
    }

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
   * O cadastro e o endereço permanecem no banco; a conta é marcada como
   * inativa pelo `UserService`, o que bloqueia login e novas requisições.
   */
  async remove(id: number): Promise<void> {
    const client = await this.findOne(id);
    await this.userService.deactivateAccount(client.user_id);
  }

  /**
   * Cria User + Client + Address em uma única transação.
   *
   * A conta é criada por um método do `UserService` que recebe o EntityManager
   * da transação; o endereço é criado pelo `AddressService` da mesma forma.
   * Assim, uma falha em qualquer etapa desfaz tudo.
   */
  private async createClientAggregate(input: {
    name: string;
    email: string;
    password: string;
    cliente: CreateClientDto;
  }): Promise<User> {
    const email = await this.userService.ensureEmailAvailable(input.email);

    const clientData = input.cliente;
    const documento =
      clientData.tipo_pessoa === TipoPessoa.PF
        ? clientData.cpf
        : clientData.cnpj;

    if (documento) {
      await this.assertDocumentoAvailable(
        documento,
        clientData.tipo_pessoa,
      );
    }

    const passwordHash = await this.userService.hashPassword(
      input.password,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const savedUser = await this.userService.createAccountInTransaction(
          manager,
          {
            name: input.name,
            email,
            passwordHash,
            type: UserType.CLIENTE,
          },
        );

        const savedClient = await manager.save(
          manager.create(Client, {
            user_id: savedUser.id,
            tipo_pessoa: clientData.tipo_pessoa,
            cpf: clientData.cpf
              ? normalizeDocument(clientData.cpf)
              : null,
            cnpj: clientData.cnpj
              ? normalizeDocument(clientData.cnpj)
              : null,
            data_nascimento: clientData.data_nascimento ?? null,
            razao_social: clientData.razao_social?.trim() ?? null,
          }),
        );

        await this.addressService.createForClientInTransaction(
          manager,
          savedClient.id,
          clientData.endereco,
        );

        return savedUser;
      });
    } catch (error) {
      this.logger.error('falha ao criar cliente', error);
      throw error;
    }
  }

  /** Confere se o CPF/CNPJ já pertence a outro cliente. */
  private async assertDocumentoAvailable(
    documento: string,
    tipo: TipoPessoa,
  ): Promise<void> {
    const normalized = normalizeDocument(documento);

    const exists = await this.clientsRepository.exists({
      where: [{ cpf: normalized }, { cnpj: normalized }],
    });

    if (exists) {
      throw new ConflictException(
        tipo === TipoPessoa.PF
          ? 'ja existe um cliente com este CPF'
          : 'ja existe um cliente com este CNPJ',
      );
    }
  }

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
