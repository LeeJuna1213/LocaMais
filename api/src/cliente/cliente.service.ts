import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

import type { RegistroDto } from '../autenticacao/dto/registro.dto.js';
import { EnderecoService } from '../endereco/endereco.service.js';
import { CreateEnderecoDto } from '../endereco/dto/create-endereco.dto.js';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { isValidCnpj, isValidCpf, normalizeDocument } from '../common/utils/normalize.utility.js';
import { Usuario } from '../usuario/entities/usuario.entity.js';
import { TipoPessoa, TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { UsuarioService } from '../usuario/usuario.service.js';
import { RedisService } from '../redis/redis.service.js';
import { CacheInvalidationService } from '../redis/cache-invalidation.service.js';

import { CreateClienteAccountDto } from './dto/create-cliente-account.dto.js';
import type { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';
import { UpdateOwnClientDto } from './dto/update-own-client.dto.js';
import { Cliente } from './entities/cliente.entity.js';

/**
 * SERVIÇO DE CLIENTES — CADASTRO DOS CLIENTES DA LOCADORA
 *
 * Responsabilidade deste Service:
 * - cadastrar clientes PF/PJ com os dados cadastrais e o endereço;
 * - consultar, listar e atualizar dados cadastrais;
 * - validar CPF/CNPJ duplicado;
 * - desativar o cadastro do cliente sem apagar registros.
 *
 * A conta de acesso continua pertencendo ao `UsuarioService`: aqui apenas
 * solicitamos a criação da conta com `type = cliente` dentro da mesma
 * transação. O endereço é criado pelo `EnderecoService`, também na transação.
 *
 * Dependências:
 * - `Repository<Cliente>` é registrado pelo `ClienteModule`;
 * - `DataSource` abre a transação de Usuario + Cliente + Endereco;
 * - `UsuarioService` fornece as regras de conta, e-mail e senha;
 * - `EnderecoService` fornece a criação do endereço.
 */
@Injectable()
export class ClienteService {
  private readonly logger = new Logger(ClienteService.name);

  constructor(
    @InjectRepository(Cliente)
    private readonly clientesRepository: Repository<Cliente>,
    private readonly dataSource: DataSource,
    private readonly usuarioService: UsuarioService,
    private readonly enderecoService: EnderecoService,
    private readonly redis: RedisService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  /** Busca o cliente pelo ID do usuário associado (chave única 1:1). */
  findByUserId(userId: number): Promise<Cliente | null> {
    return this.clientesRepository.findOne({
      where: { user_id: userId, deleted_at: IsNull() },
      relations: { user: true, address: true },
    });
  }

  async getOwnCompleteness(userId: number): Promise<{ completo: boolean; pendencias: string[] }> {
    const client = await this.findByUserId(userId);
    if (!client) throw new NotFoundException('cadastro de cliente nao encontrado');
    const issues: string[] = [];
    if (!client.user?.name?.trim()) issues.push('dados-pessoais');
    if (client.tipo_pessoa === TipoPessoa.PF) {
      if (!client.cpf || !isValidCpf(client.cpf) || !client.data_nascimento || Number.isNaN(Date.parse(client.data_nascimento))) issues.push('dados-pessoais');
    } else if (!client.cnpj || !isValidCnpj(client.cnpj) || !client.razao_social?.trim()) {
      issues.push('dados-pessoais');
    }
    const phoneDigits = client.telefone?.replace(/\D/g, '') ?? '';
    if (!/^\d{10,13}$/.test(phoneDigits)) issues.push('telefone');
    if (!client.cnh_numero || !/^\d{11}$/.test(client.cnh_numero)
      || !client.cnh_validade || new Date(`${client.cnh_validade}T23:59:59`) <= new Date()) issues.push('cnh');
    const address = client.address;
    if (!address || !address.logradouro?.trim() || !address.numero?.trim() || !address.bairro?.trim()
      || !address.cidade?.trim() || !/^[A-Z]{2}$/.test(address.uf) || !/^\d{8}$/.test(address.cep)) {
      issues.push('endereco');
    }
    const pendencias = [...new Set(issues)];
    return { completo: pendencias.length === 0, pendencias };
  }

  async updateOwnProfile(actor: UsuarioAutenticado, dto: UpdateOwnClientDto): Promise<Cliente> {
    const client = await this.findByUserId(actor.id);
    if (!client) throw new NotFoundException('cadastro de cliente nao encontrado');
    const changes: Partial<Cliente> = {};
    if (dto.telefone !== undefined) changes.telefone = dto.telefone.trim() || null;
    if (dto.cnh_numero !== undefined) changes.cnh_numero = dto.cnh_numero.replace(/\D/g, '');
    if (dto.cnh_validade !== undefined) changes.cnh_validade = dto.cnh_validade;
    if (Object.keys(changes).length) await this.clientesRepository.update({ id: client.id }, changes);
    if (dto.name !== undefined) {
      await this.usuarioService.update(actor, actor.id, { name: dto.name });
    }
    if (dto.endereco) {
      if (client.address) {
        await this.enderecoService.update(client.address.id, dto.endereco);
      } else {
        const fields = dto.endereco;
        if (!fields.logradouro || !fields.numero || !fields.bairro || !fields.cidade || !fields.uf || !fields.cep) {
          throw new BadRequestException({ message: 'endereco incompleto', code: 'ADDRESS_INCOMPLETE' });
        }
        await this.enderecoService.create(client.id, fields as CreateEnderecoDto);
      }
    }
    try { await this.redis.del(`locamais:cliente:${client.id}`); } catch (error) {
      this.logger.error(`Falha ao invalidar cache do cliente ${client.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.cacheInvalidation.invalidateClientDependents(client.id);
    return this.findOne(client.id);
  }

  /** Busca um cliente pelo ID; lança 404 quando não existe. */
  async findOne(id: number): Promise<Cliente> {
    const client = await this.clientesRepository.findOne({
      where: { id, deleted_at: IsNull() },
      relations: { user: true, address: true },
    });

    if (!client) {
      throw new NotFoundException(`cliente de ID ${id} nao encontrado`);
    }

    return client;
  }

  /** Lista todos os clientes com a conta e o endereço associados. */
  findAll(): Promise<Cliente[]> {
    return this.clientesRepository.find({
      where: { deleted_at: IsNull() },
      relations: { user: true, address: true },
      order: { id: 'ASC' },
    });
  }

  /** Admin/funcionário leem qualquer cliente; cliente lê apenas o próprio. */
  async findOneForActor(
    actor: UsuarioAutenticado,
    id: number,
  ): Promise<Cliente> {
    const cacheKey = `locamais:cliente:${id}`;

    // Tenta recuperar do cache primeiro. A entidade Cliente possui toJSON()
    // que quebra o ciclo com Endereco e remove dados sensíveis do usuario
    // vinculado, então JSON.stringify nunca expõe credenciais no Redis.
    let cached: Cliente | null = null;
    try {
      cached = await this.redis.get<Cliente>(cacheKey);
    } catch (error) {
      this.logger.error(
        `Falha ao ler cache do cliente ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (cached) {
      // Verifica autorização sobre os dados do cache (fora do try/catch do Redis)
      this.assertCanRead(actor, cached);
      return cached;
    }

    // Cache miss: consulta o MySQL
    const client = await this.findOne(id);
    this.assertCanRead(actor, client);

    // Armazena no cache com TTL de 300 segundos (5 minutos)
    try {
      await this.redis.set(cacheKey, client, 300);
    } catch (error) {
      this.logger.error(
        `Falha ao gravar cache do cliente ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return client;
  }

  /**
   * Cadastro de cliente feito por admin/funcionário.
   *
   * O tipo da conta é imposto como `cliente`; nenhum papel privilegiado pode
   * ser escolhido pelo payload.
   */
  async create(
    actor: UsuarioAutenticado,
    dto: CreateClienteAccountDto,
  ): Promise<Cliente> {
    // Reaproveita a regra de permissão de criação de contas do UsuarioService.
    this.usuarioService.assertCanCreate(actor, TipoUsuario.CLIENTE);

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
   * O módulo `autenticacao` chama este método; a conta é sempre criada como `cliente`
   * e o retorno é o `Usuario` para que o AutenticacaoService emita o token.
   */
  async registrarCliente(dto: RegistroDto): Promise<Usuario> {
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
  async update(id: number, dto: UpdateClienteDto): Promise<Cliente> {
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

    const conflito = await this.clientesRepository.findOne({
      where: [{ cpf: documento }, { cnpj: documento }],
    });

    if (conflito && conflito.id !== id) {
      throw new ConflictException(
        tipo === TipoPessoa.PF
          ? 'ja existe um cliente com este CPF'
          : 'ja existe um cliente com este CNPJ',
      );
    }

    await this.clientesRepository.update(
      { id },
      {
        tipo_pessoa: tipo,
        cpf: tipo === TipoPessoa.PF ? cpf : null,
        cnpj: tipo === TipoPessoa.PJ ? cnpj : null,
        data_nascimento: tipo === TipoPessoa.PF ? dataNascimento : null,
        razao_social: tipo === TipoPessoa.PJ ? razaoSocial : null,
      },
    );

    // Invalida o cache do cliente atualizado somente apos a gravacao no MySQL
    try {
      await this.redis.del(`locamais:cliente:${id}`);
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar cache do cliente ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.cacheInvalidation.invalidateClientDependents(id);

    return this.findOne(id);
  }

  /** Updates account activity, the existing source of client active status. */
  async setStatus(id: number, active: boolean): Promise<Cliente> {
    const client = await this.findOne(id);
    await this.usuarioService.setAccountActive(client.user_id, active);
    try {
      await this.redis.del(`locamais:cliente:${id}`);
    } catch (error) {
      this.logger.error(`Falha ao invalidar cache do cliente ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await this.cacheInvalidation.invalidateClientDependents(id);
    return this.findOne(id);
  }

  /**
   * Desativação lógica do cliente.
   *
   * O cadastro e o endereço permanecem no banco; a conta é marcada como
   * inativa pelo `UsuarioService`, o que bloqueia login e novas requisições.
   */
  async remove(id: number): Promise<void> {
    const client = await this.findOne(id);
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        Cliente,
        { id, deleted_at: IsNull() },
        { deleted_at: new Date() },
      );
      if (result.affected !== 1) {
        throw new NotFoundException(`cliente de ID ${id} nao encontrado`);
      }
      await manager.update(Usuario, { id: client.user_id }, { active: false });
    });

    // Logical deletion preserves reservations, rentals, payments and inspections.
    await this.usuarioService.passwordChanged(client.user_id);
    try {
      await this.redis.del(`locamais:cliente:${id}`);
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar cache do cliente ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.cacheInvalidation.invalidateClientDependents(id);
  }

  /**
   * Cria Usuario + Cliente + Endereco em uma única transação.
   *
   * A conta é criada por um método do `UsuarioService` que recebe o EntityManager
   * da transação; o endereço é criado pelo `EnderecoService` da mesma forma.
   * Assim, uma falha em qualquer etapa desfaz tudo.
   */
  private async createClientAggregate(input: {
    name: string;
    email: string;
    password: string;
    cliente: CreateClienteDto;
  }): Promise<Usuario> {
    const email = await this.usuarioService.ensureEmailAvailable(input.email);

    const clientData = input.cliente;
    const documento =
      clientData.tipo_pessoa === TipoPessoa.PF
        ? clientData.cpf
        : clientData.cnpj;

    const documentoValido = clientData.tipo_pessoa === TipoPessoa.PF
      ? isValidCpf(documento)
      : isValidCnpj(documento);
    if (!documentoValido) {
      throw new BadRequestException(
        clientData.tipo_pessoa === TipoPessoa.PF
          ? 'cpf invalido: informe um CPF com formato valido e digitos verificadores corretos'
          : 'cnpj invalido: informe um CNPJ com formato valido e digitos verificadores corretos',
      );
    }

    if (documento) {
      await this.assertDocumentoAvailable(
        documento,
        clientData.tipo_pessoa,
      );
    }

    const passwordHash = await this.usuarioService.hashPassword(
      input.password,
    );

    try {
      return await this.dataSource.transaction(async (manager) => {
        const savedUser = await this.usuarioService.createAccountInTransaction(
          manager,
          {
            name: input.name,
            email,
            passwordHash,
            type: TipoUsuario.CLIENTE,
          },
        );

        const savedClient = await manager.save(
          manager.create(Cliente, {
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

        await this.enderecoService.createForClientInTransaction(
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

    const exists = await this.clientesRepository.exists({
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

  private assertCanRead(actor: UsuarioAutenticado, client: Cliente): void {
    if (
      actor.type === TipoUsuario.ADMIN ||
      actor.type === TipoUsuario.FUNCIONARIO
    ) {
      return;
    }

    if (client.user_id !== actor.id) {
      throw new ForbiddenException('clientes so podem ler o proprio registro');
    }
  }
}
