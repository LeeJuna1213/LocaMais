/*
 * USER SERVICE — CAMADA DE REGRAS DE NEGÓCIO
 *
 * O Controller recebe as requisições HTTP e chama este Service.
 * O Service verifica as regras do sistema e utiliza o TypeORM para acessar
 * o MySQL. Aqui ficam as regras de cadastro, consulta, atualização,
 * exclusão, permissões, senha e integridade dos dados.
 *
 * Fluxo: Controller -> UserService -> Repository/DataSource -> MySQL.
 *
 * O código abaixo mantém a implementação original; foram adicionados
 * somente comentários para fins de estudo.
 */

// Exceções HTTP do NestJS: cada uma representa uma situação de erro.
// BadRequestException: requisição inválida (400).
// ConflictException: conflito, como e-mail já cadastrado (409).
// ForbiddenException: usuário sem permissão (403).
// NotFoundException: registro não encontrado (404).
// Injectable: permite que o NestJS injete este Service em outras classes.
// Logger: registra mensagens e erros da aplicação.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
// Acessa configurações da aplicação, inclusive variáveis de ambiente.
import { ConfigService } from '@nestjs/config';
// Solicita ao NestJS o Repository de uma Entity.
import { InjectRepository } from '@nestjs/typeorm';
// Biblioteca para gerar e verificar hashes seguros de senhas.
import * as bcrypt from 'bcrypt';
// Repository: métodos de consulta e persistência de uma Entity.
// DataSource: acesso à conexão do TypeORM e a transações.
import { DataSource, Repository } from 'typeorm';
// DTOs descrevem os dados esperados nas operações da API.
// AuthenticatedUser representa o usuário que fez login.
// Funções normalize... padronizam e-mail e documentos.
// Entities mapeiam tabelas; enums definem valores permitidos.
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

// O número de rodadas controla o custo computacional do bcrypt.
// Um custo maior tende a dificultar tentativas de adivinhação, mas torna
// o processamento mais lento. O valor pode ser configurado no ambiente.
/** Custo padrao do bcrypt. */
const DEFAULT_BCRYPT_ROUNDS = 10;

// Marca a classe como provider, para que o NestJS possa gerenciá-la
// e injetá-la no UserController ou em outros Services.
@Injectable()
export class UserService {
  // Logger identifica a origem de mensagens e falhas.
  private readonly logger = new Logger(UserService.name);
  // Guarda o custo de hash escolhido na inicialização do Service.
  private readonly bcryptRounds: number;

  /*
   * INJEÇÃO DE DEPENDÊNCIA (CONSTRUCTOR)
   * @InjectRepository(User): fornece o Repository<User>, que conhece
   * o mapeamento da tabela users.
   * dataSource: permite iniciar transações e obter outros Repositories.
   * configService: lê configurações, como BCRYPT_ROUNDS.
   * private readonly: cria propriedades internas que não são reatribuídas.
   */
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    // ?? usa o valor padrão apenas se a configuração for null/undefined.
    // Number converte a configuração (string) para número.
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
  // async indica uma operação assíncrona; Promise<User> é o resultado futuro.
  // actor = usuário autenticado; dto = dados enviados na requisição.
  async create(actor: AuthenticatedUser, dto: CreateUserDto): Promise<User> {
    // Antes de salvar, verifica se o ator pode criar o tipo solicitado.
    this.assertCanCreate(actor, dto.type);

    // Padroniza o e-mail antes de pesquisar ou armazenar.
    const email = normalizeEmail(dto.email);

    // await aguarda a consulta. Se o e-mail já existir, retorna HTTP 409.
    if (await this.emailExists(email)) {
      throw new ConflictException('ja existe um usuario com este email');
    }

    // Admin e funcionário não precisam do cadastro adicional de Client.
    // O Repository cria o objeto e save() persiste na tabela users.
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

    // Para CLIENTE, cria User + Client + Address numa transação.
    // A senha é transformada em hash antes de ser persistida.
    return this.createClient(dto, email, await this.hashPassword(dto.password));
  }

  /**
   * Auto-cadastro. Sem ator: o tipo e forcado para `cliente` e nao pode ser
   * influenciado pelo payload.
   */
  // Cadastro público: não recebe um administrador/funcionário como ator.
  // O tipo CLIENTE é imposto pelo servidor, não escolhido pelo usuário.
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
      } as CreateUserDto, // Afirma ao TypeScript o tipo deste objeto.
      email,
      await this.hashPassword(dto.password),
    );
  }

  /** Cria usuario + cliente + endereco dentro de uma unica transacao. */
  /*
   * MÉTODO PRIVADO: somente esta classe pode chamá-lo.
   * Recebe dados do usuário, e-mail normalizado e senha já com hash.
   * Usa uma TRANSAÇÃO: ou os três registros são salvos, ou a operação
   * é revertida se ocorrer erro, evitando cadastros incompletos.
   */
  private async createClient(
    dto: CreateUserDto,
    email: string,
    password: string,
  ): Promise<User> {
    // Extrai os dados específicos do cliente enviados no DTO.
    const client = dto.cliente as CreateClientDto;
    // PF usa CPF; PJ usa CNPJ. A escolha depende do enum TipoPessoa.
    const documento =
      client.tipo_pessoa === TipoPessoa.PF ? client.cpf : client.cnpj;

    if (documento) {
      // Remove/normaliza a formatação do documento antes da consulta.
      const normalized = normalizeDocument(documento);
      if (await this.documentoExists(normalized)) {
        throw new ConflictException(
          client.tipo_pessoa === TipoPessoa.PF
            ? 'ja existe um cliente com este CPF'
            : 'ja existe um cliente com este CNPJ',
        );
      }
    }

    // try/catch registra a falha e a propaga para tratamento HTTP.
    try {
      // manager é o EntityManager da transação: todas as gravações
      // realizadas por ele participam da MESMA transação.
      const user = await this.dataSource.transaction(async (manager) => {
        // 1) Insere o usuário geral e obtém o ID gerado.
        const savedUser = await manager.save(
          manager.create(User, {
            name: dto.name.trim(),
            email,
            password,
            type: UserType.CLIENTE,
            active: true,
          }),
        );

        // 2) Insere o cliente e associa user_id ao usuário salvo.
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

        // 3) Insere o endereço e associa client_id ao cliente salvo.
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

        // Ao terminar sem erros, a transação pode ser confirmada.
        return savedUser;
      });

      // Reconsulta o registro, trazendo também as relações configuradas
      // em findOne(), sem carregar a senha nas consultas comuns.
      return this.findOneOrFail(user.id);
    } catch (error) {
      // Registra a falha; throw mantém o erro para o NestJS tratar.
      this.logger.error('falha ao criar cliente', error);
      throw error;
    }
  }

  /** Lista todos os usuarios com o bloco de cliente e endereco. */
  // Promise<User[]>: a consulta devolverá uma lista de entidades User.
  findAll(): Promise<User[]> {
    return this.usersRepository.find({
      // Inclui o relacionamento User -> Client -> Address.
      relations: { client: { address: true } },
      // Ordena pelo ID em ordem crescente.
      order: { id: 'ASC' },
    });
  }

  /** Lista apenas clientes. */
  // Consulta apenas usuários do tipo CLIENTE.
  findAllClients(): Promise<User[]> {
    return this.usersRepository.find({
      // where corresponde a um filtro da consulta.
      where: { type: UserType.CLIENTE },
      relations: { client: { address: true } },
      order: { id: 'ASC' },
    });
  }

  // Busca por ID. Retorna null caso o usuário não exista.
  findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: { client: { address: true } },
    });
  }

  /** Busca usuario por email incluindo o hash (uso restrito ao login). */
  // Uso no login: precisa recuperar o hash, que normalmente fica oculto
  // por causa de select: false na Entity.
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      // QueryBuilder permite construir consultas mais específicas.
      .createQueryBuilder('user')
      // Solicita explicitamente a coluna password.
      .addSelect('user.password')
      // :email é um parâmetro vinculado; não concatena texto ao SQL.
      .where('user.email = :email', { email: normalizeEmail(email) })
      // Executa a consulta e retorna um usuário ou null.
      .getOne();
  }

  // Difere de findOne(): lança HTTP 404 quando o ID não existe.
  async findOneOrFail(id: number): Promise<User> {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException(`usuario ${id} nao encontrado`);
    return user;
  }

  /** Leitura permitida a admin/funcionario; cliente so o proprio registro. */
  // Verifica a permissão de leitura antes de buscar o usuário.
  async findOneForActor(
    actor: AuthenticatedUser,
    id: number,
  ): Promise<User> {
    this.assertCanRead(actor, id);
    // Retorna a versão atualizada, novamente consultada no banco.
    return this.findOneOrFail(id);
  }

  /** Atualizacao permitida a admin (tudo) ou ao proprio usuario (sem `active`). */
  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateUserDto,
  ): Promise<User> {
    // isSelf indica se a pessoa altera a própria conta.
    const isSelf = actor.id === id;
    // isAdmin indica se a pessoa possui o papel ADMIN.
    const isAdmin = actor.type === UserType.ADMIN;

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('voce so pode alterar o proprio usuario');
    }

    if (dto.active !== undefined && !isAdmin) {
      throw new ForbiddenException('apenas admins podem ativar/desativar usuarios');
    }

    // Garante que o usuário a atualizar existe.
    const target = await this.findOneOrFail(id);
    // Partial<User> permite informar apenas alguns campos da Entity.
    // É adequado para PATCH, que altera parte dos dados.
    const changes: Partial<User> = {};

    // undefined significa que o campo não foi enviado na atualização.
    // trim() remove espaços do início e do fim.
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

    // UPDATE direto no banco com os campos presentes em changes.
    await this.usersRepository.update({ id }, changes);
    return this.findOneOrFail(id);
  }

  /** Delecao restrita a admin, nunca do proprio usuario. */
  // Promise<void>: executa a exclusão sem retornar um usuário.
  async remove(actor: AuthenticatedUser, id: number): Promise<void> {
    // Somente administradores podem excluir contas.
    if (actor.type !== UserType.ADMIN) {
      throw new ForbiddenException('apenas admins podem remover usuarios');
    }

    // Protege contra a exclusão da própria conta do administrador.
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

    // Executa a exclusão após as verificações de negócio.
    await this.usersRepository.delete({ id });
  }

  // Transforma uma senha em texto em um hash bcrypt.
  // Hash não é criptografia reversível: não se recupera a senha original.
  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.bcryptRounds);
  }

  // Compara a senha digitada com o hash armazenado; retorna true/false.
  comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  // Método auxiliar privado: valida quem pode criar cada tipo de usuário.
  // void indica que não devolve um resultado; pode lançar exceção.
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

  // Admin e funcionário podem consultar qualquer usuário;
  // cliente só pode consultar a própria conta.
  private assertCanRead(actor: AuthenticatedUser, id: number): void {
    if (actor.type === UserType.ADMIN || actor.type === UserType.FUNCIONARIO) {
      return;
    }

    if (actor.id !== id) {
      throw new ForbiddenException('clientes so podem ler o proprio registro');
    }
  }

  // exists() consulta se há pelo menos um registro com esse e-mail.
  private emailExists(email: string): Promise<boolean> {
    return this.usersRepository.exists({ where: { email } });
  }

  // Obtém o Repository<Client> por meio do DataSource.
  // O array de condições no where funciona como OR: CPF OU CNPJ.
  private documentoExists(documento: string): Promise<boolean> {
    return this.dataSource
      .getRepository(Client)
      .exists({ where: [{ cpf: documento }, { cnpj: documento }] });
  }

  // count() devolve quantos usuários possuem o tipo ADMIN.
  // É usado para evitar a exclusão do último administrador.
  private countAdmins(): Promise<number> {
    return this.usersRepository.count({ where: { type: UserType.ADMIN } });
  }
}