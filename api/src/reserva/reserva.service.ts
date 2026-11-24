import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOneOptions, Repository } from 'typeorm';

import { Carro } from '../carro/entities/carro.entity.js';
import { CarroService } from '../carro/carro.service.js';
import { StatusVeiculo } from '../carro/enums/status-veiculo.enum.js';
import { Cliente } from '../cliente/entities/cliente.entity.js';
import { ClienteService } from '../cliente/cliente.service.js';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { RedisService } from '../redis/redis.service.js';
import { CacheInvalidationService } from '../redis/cache-invalidation.service.js';
import { ConfiguracaoService } from '../configuracao/configuracao.service.js';
import { Loja } from '../loja/entities/loja.entity.js';
import { Pagamento } from '../pagamento/entities/pagamento.entity.js';
import { MetodoPagamento } from '../pagamento/enums/metodo-pagamento.enum.js';
import { StatusPagamento } from '../pagamento/enums/status-pagamento.enum.js';
import { Notificacao } from '../notificacao/entities/notificacao.entity.js';
import { Estorno } from '../pagamento/entities/estorno.entity.js';
import { NotificacaoService } from '../notificacao/notificacao.service.js';

import { ConsultarDisponibilidadeDto } from './dto/consultar-disponibilidade.dto.js';
import { CreateReservaDto } from './dto/create-reserva.dto.js';
import { UpdateReservaDto } from './dto/update-reserva.dto.js';
import { Reserva } from './entities/reserva.entity.js';
import { StatusReserva } from './enums/status-reserva.enum.js';

/**
 * Status que bloqueiam o veículo no calendário.
 *
 * CANCELADA não bloqueia (a reserva foi desfeita) e CONCLUIDA representa um
 * período já encerrado; nenhuma das duas deve impedir uma nova reserva.
 */
const STATUSES_BLOQUEANTES: StatusReserva[] = [
  StatusReserva.PENDENTE,
  StatusReserva.AGUARDANDO_CONFIRMACAO,
  StatusReserva.CONFIRMADA,
];

/** Motivos possíveis para um veículo não estar disponível em um período. */
export type MotivoIndisponibilidade =
  'manutencao' | 'locacao_em_andamento' | 'conflito';

/** Resumo de uma reserva que conflita com o período consultado. */
export interface ConflitoReserva {
  id: string;
  dataRetirada: Date;
  dataDevolucao: Date;
  status: StatusReserva;
}

/** Formato de resposta da consulta de disponibilidade. */
export interface DisponibilidadeReserva {
  car_id: number;
  dataRetirada: Date;
  dataDevolucao: Date;
  disponivel: boolean;
  motivo: MotivoIndisponibilidade | null;
  conflito: ConflitoReserva | null;
}

/**
 * Regras de negócio das reservas.
 *
 * Injeção de dependência:
 * - `Repository<Reserva>` vem do `TypeOrmModule.forFeature([Reserva])`;
 * - `ClienteService` e `CarroService` vêm dos módulos exportadores;
 * - `DataSource` permite abrir transações e obter o repositório da transação.
 *
 * A criação/atualização ocorre em transação. No MySQL, a linha do carro é
 * travada com `pessimistic_write` antes da checagem de conflito, serializando
 * duas reservas simultâneas para o mesmo veículo. No SQLite (usado em
 * desenvolvimento/testes) não há `FOR UPDATE`; a garantia fica limitada à
 * transação e ao fato de o driver ser single-writer. Para várias instâncias
 * em produção, o MySQL com o lock é o cenário protegido.
 */
@Injectable()
export class ReservaService {
  private readonly logger = new Logger(ReservaService.name);

  constructor(
    @InjectRepository(Reserva)
    private readonly reservasRepository: Repository<Reserva>,
    private readonly dataSource: DataSource,
    private readonly clienteService: ClienteService,
    private readonly carroService: CarroService,
    private readonly redis: RedisService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly configuracaoService: ConfiguracaoService,
    @Optional() private readonly notificationService?: NotificacaoService,
  ) {}

  /**
   * Cria uma reserva PENDENTE.
   *
   * O status inicial e o valor total são definidos aqui, nunca pelo body.
   * Um cliente autenticado só pode reservar para o próprio cadastro; admin e
   * funcionário podem criar para qualquer cliente.
   */
  async create(
    actor: UsuarioAutenticado,
    dto: CreateReservaDto,
  ): Promise<Reserva> {
    const client = await this.resolveClientForActor(actor, dto.client_id);
    this.assertClientActive(client);
    if (actor.type === TipoUsuario.CLIENTE) {
      const completeness = await this.clienteService.getOwnCompleteness(actor.id);
      if (!completeness.completo) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CLIENT_PROFILE_INCOMPLETE',
          message: 'Complete seu cadastro antes de realizar a reserva.',
          pendencias: completeness.pendencias,
        });
      }
    }

    const dataRetirada = this.parseDate(dto.dataRetirada, 'dataRetirada');
    const dataDevolucao = this.parseDate(dto.dataDevolucao, 'dataDevolucao');

    // Em criação, a retirada precisa estar no futuro. A devolução só precisa
    // ser posterior à retirada; não há limite máximo de antecedência definido
    // no projeto.
    this.assertPeriod(dataRetirada, dataDevolucao, true);

    const taxaServico = (await this.configuracaoService.getTaxaServico()).valor;
    if (dto.taxa_servico_cotada !== undefined && Math.round(dto.taxa_servico_cotada * 100) !== Math.round(taxaServico * 100)) {
      throw new ConflictException('a taxa de serviço mudou desde a cotação; atualize os valores antes de confirmar');
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const car = await this.findCarForUpdate(manager, dto.car_id);
      const repository = manager.getRepository(Reserva);
      const shop = dto.loja_retirada_id
        ? await manager.findOne(Loja, { where: { id: dto.loja_retirada_id } })
        : null;
      if (dto.loja_retirada_id && !shop) throw new NotFoundException(`loja ${dto.loja_retirada_id} não encontrada`);
      if (shop && !shop.ativa) throw new ConflictException('a loja selecionada está inativa');

      await this.assertAvailable(repository, car, dataRetirada, dataDevolucao);

      const reservation = repository.create({
        codigo: null,
        dataRetirada,
        dataDevolucao,
        status: StatusReserva.PENDENTE,
        client_id: client.id,
        client,
        car_id: car.id,
        car,
        loja_retirada_id: shop?.id ?? null,
        lojaRetirada: shop,
        lojaRetiradaSnapshot: shop ? {
          nome: shop.nome,
          logradouro: shop.logradouro,
          numero: shop.numero,
          cidade: shop.cidade,
          uf: shop.uf,
        } : null,
      });

      // O carro foi carregado acima, então calcularValor() usa o preço real
      // do banco e não um valor enviado pelo cliente.
      reservation.valorSubtotal = reservation.calcularValor();
      reservation.taxaServico = taxaServico;
      reservation.valorTotal = Math.round((reservation.valorSubtotal + taxaServico) * 100) / 100;

      const inserted = await repository.save(reservation);
      const sequence = await this.publicCodeSequence(manager, inserted);
      inserted.codigo = `LOC-${String(sequence).padStart(6, '0')}`;
      const created = await repository.save(inserted);
      await manager.getRepository(Pagamento).save(manager.getRepository(Pagamento).create({
        valor: created.valorTotal,
        metodo: MetodoPagamento.PIX,
        status: StatusPagamento.PENDENTE,
        data: new Date(),
        locacao_id: null,
        reservation_id: created.id,
        gateway_id: null,
        comprovante_snapshot: null,
      }));
      await manager.getRepository(Notificacao).save(manager.getRepository(Notificacao).create({
        usuario_id: client.user_id,
        reserva_id: created.id,
        tipo: 'reserva_criada',
        titulo: 'Reserva aguardando pagamento',
        descricao: `A reserva ${created.codigo} foi criada e aguarda o pagamento simulado.`,
        lida_em: null,
      }));
      return created;
    });

    // UUID novo não pode ter cache anterior; o GET que vier depois populará.
    await this.cacheInvalidation.invalidateKeys([`locamais:notificacoes:nao-lidas:${client.user_id}`]);
    return this.findOne(saved.id);
  }

  /**
   * Lista reservas conforme o papel do usuário.
   *
   * Admin/funcionário veem todas; cliente vê apenas as reservas ligadas ao
   * seu `client_id`. O vínculo é feito por `clients.user_id`, porque o token
   * carrega o ID do usuário, não o ID do cliente.
   */
  findAllForActor(actor: UsuarioAutenticado): Promise<Reserva[]> {
    if (this.isStaff(actor)) {
      return this.reservasRepository.find({
        relations: { client: { user: true }, car: true, lojaRetirada: true, locacao: true, pagamentos: true },
        order: { dataRetirada: 'ASC' },
      });
    }

    return this.reservasRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.client', 'client')
      .leftJoinAndSelect('client.user', 'user')
      .leftJoinAndSelect('reservation.car', 'car')
      .leftJoinAndSelect('reservation.locacao', 'rental')
      .where('client.user_id = :userId', { userId: actor.id })
      .orderBy('reservation.dataRetirada', 'ASC')
      .getMany();
  }

  /**
   * Consulta uma reserva por UUID, carregando cliente e carro.
   * Lança 404 para o Controller, em vez de devolver `null`.
   */
  async findOne(id: string): Promise<Reserva> {
    const reservation = await this.reservasRepository.findOne({
      where: { id },
      relations: { client: { user: true }, car: true, lojaRetirada: true, locacao: true, pagamentos: true },
    });

    if (!reservation) {
      throw new NotFoundException(`reserva de ID ${id} nao encontrada`);
    }

    return reservation;
  }

  /** Leitura com controle de acesso (staff ou dono da reserva) e cache Redis. */
  async findOneForActor(
    actor: UsuarioAutenticado,
    identifier: string,
  ): Promise<Reserva> {
    const isPublicCode = /^(LOC|RES)-\d{6,}$/i.test(identifier);
    const reservation = isPublicCode ? await this.findByIdentifier(identifier) : null;
    const cacheKey = `locamais:reserva:${reservation?.id ?? identifier}`;

    // Redis é apenas uma otimização: em MISS/falha, o MySQL segue como fonte
    // oficial. A autorização será aplicada tanto no HIT quanto no MISS.
    let cached: Reserva | null = null;
    try {
      cached = await this.redis.get<Reserva>(cacheKey);
    } catch (error) {
      this.logger.error(
        `Falha ao ler cache da reserva ${reservation?.id ?? identifier}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (cached) {
      // Verifica autorizacao sobre os dados do cache (fora do try/catch do
      // Redis, para nao capturar ForbiddenException).
      this.assertCanRead(actor, cached);
      if (cached.car) {
        const carroAtual = await this.carroService.enriquecerFoto(cached.car);
        return { ...cached, car: carroAtual } as Reserva;
      }
      return cached;
    }

    // Cache MISS (ou falha na leitura): consulta o MySQL com os relacionamentos
    // que compõem a resposta pública atual da reserva.
    const resolvedReservation = reservation ?? await this.findByIdentifier(identifier);
    this.assertCanRead(actor, resolvedReservation);

    // Só armazena depois da autorização. A falha de gravação não afeta a API.
    try {
      // Compatibilidade com chaves anteriores: nenhum carro cacheado mantém `foto`.
      const dadosCache = JSON.parse(JSON.stringify(resolvedReservation)) as Reserva;
      if (dadosCache.car) {
        delete (dadosCache.car as { foto?: string | null }).foto;
      }
      await this.redis.set(`locamais:reserva:${resolvedReservation.id}`, dadosCache, 120);
    } catch (error) {
      this.logger.error(
        `Falha ao gravar cache da reserva ${resolvedReservation.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return resolvedReservation;
  }

  private async findByIdentifier(identifier: string): Promise<Reserva> {
    const isPublicCode = /^(LOC|RES)-\d{6,}$/i.test(identifier);
    const reservation = await this.reservasRepository.findOne({
      where: isPublicCode ? { codigo: identifier.trim().toUpperCase() } : { id: identifier },
      relations: { client: { user: true }, car: true, lojaRetirada: true, locacao: true, pagamentos: true },
    });
    if (!reservation) throw new NotFoundException(`reserva ${identifier} não encontrada`);
    return reservation;
  }

  /**
   * Atualiza uma reserva quando o status atual permite.
   *
   * Regras:
   * - CANCELADA/CONCLUIDA: nenhuma alteração;
   * - CONFIRMADA: só pode virar CONCLUIDA (período/cliente/carro congelados);
   * - PENDENTE: pode ter período/cliente/carro alterados e virar CONFIRMADA.
   *
   * O valor total nunca vem do body; ele é recalculado quando o período ou o
   * carro mudam. O status CANCELADA tem endpoint próprio (`/cancel`).
   */
  async update(id: string, dto: UpdateReservaDto): Promise<Reserva> {
    const current = await this.findOne(id);

    if (
      current.status === StatusReserva.CANCELADA ||
      current.status === StatusReserva.CONCLUIDA
    ) {
      throw new ConflictException(
        `reserva com status "${current.status}" nao pode ser alterada`,
      );
    }

    if (dto.status === StatusReserva.CANCELADA) {
      throw new BadRequestException(
        'use PATCH /reservations/:id/cancel para cancelar a reserva',
      );
    }

    const changesDates =
      dto.dataRetirada !== undefined || dto.dataDevolucao !== undefined;
    const changesClient =
      dto.client_id !== undefined && dto.client_id !== current.client_id;
    const changesCar =
      dto.car_id !== undefined && dto.car_id !== current.car_id;
    const changesPickupShop = dto.loja_retirada_id !== undefined && dto.loja_retirada_id !== current.loja_retirada_id;
    const hasCommercialChanges = changesDates || changesClient || changesCar;

    if (current.status === StatusReserva.CONFIRMADA && hasCommercialChanges) {
      throw new ConflictException(
        'reserva confirmada nao pode ter periodo, cliente ou carro alterados',
      );
    }
    if (changesPickupShop && current.locacao && current.locacao.status !== 'aguardando_retirada') {
      throw new ConflictException('a loja de retirada não pode ser alterada depois da retirada do veículo');
    }
    if (current.status !== StatusReserva.PENDENTE && current.status !== StatusReserva.CONFIRMADA && changesPickupShop) {
      throw new ConflictException('a loja de retirada não pode ser alterada nesta situação da reserva');
    }

    if (dto.status && dto.status !== current.status) {
      const transicaoPermitida =
        (current.status === StatusReserva.AGUARDANDO_CONFIRMACAO &&
          dto.status === StatusReserva.CONFIRMADA) ||
        (current.status === StatusReserva.CONFIRMADA &&
          dto.status === StatusReserva.CONCLUIDA);

      if (!transicaoPermitida) {
        throw new ConflictException(
          `transicao de status invalida: ${current.status} -> ${dto.status}`,
        );
      }
    }

    // PATCH sem campos alteráveis: devolve o estado atual sem escrever no
    // banco. Isso segue o comportamento tolerante do UpdateCarroDto.
    if (
      !hasCommercialChanges &&
      !changesPickupShop &&
      (!dto.status || dto.status === current.status)
    ) {
      return current;
    }

    const dataRetirada =
      dto.dataRetirada !== undefined
        ? this.parseDate(dto.dataRetirada, 'dataRetirada')
        : this.asDate(current.dataRetirada, 'dataRetirada');
    const dataDevolucao =
      dto.dataDevolucao !== undefined
        ? this.parseDate(dto.dataDevolucao, 'dataDevolucao')
        : this.asDate(current.dataDevolucao, 'dataDevolucao');

    // Só exige futuro quando o período foi realmente enviado. Uma reserva
    // pendente antiga ainda pode ser confirmada/concluída sem ser rejeitada
    // apenas porque a data original já passou.
    this.assertPeriod(dataRetirada, dataDevolucao, changesDates);

    const clientId = dto.client_id ?? current.client_id;
    const carId = dto.car_id ?? current.car_id;

    const client = changesClient
      ? await this.clienteService.findOne(clientId)
      : current.client;
    if (changesClient) this.assertClientActive(client);

    const saved = await this.dataSource.transaction(async (manager) => {
      const car = await this.findCarForUpdate(manager, carId);
      const repository = manager.getRepository(Reserva);

      if (dto.status === StatusReserva.CONFIRMADA) {
        const paid = await manager.getRepository(Pagamento).exists({
          where: { reservation_id: id, status: StatusPagamento.APROVADO },
        });
        if (!paid) throw new ConflictException('a reserva só pode ser confirmada após a aprovação do pagamento simulado');
      }

      if (changesDates || changesCar || dto.status === StatusReserva.CONFIRMADA) {
        await this.assertAvailable(
          repository,
          car,
          dataRetirada,
          dataDevolucao,
          id,
        );
      }

      const reservation = await repository.findOne({
        where: { id },
        relations: { client: { user: true }, car: true, lojaRetirada: true, locacao: true, pagamentos: true },
      });

      if (!reservation) {
        throw new NotFoundException(`reserva de ID ${id} nao encontrada`);
      }

      reservation.dataRetirada = dataRetirada;
      reservation.dataDevolucao = dataDevolucao;
      reservation.client_id = client.id;
      reservation.client = client;
      reservation.car_id = car.id;
      reservation.car = car;
      if (changesPickupShop) {
        const shop = await manager.findOne(Loja, { where: { id: dto.loja_retirada_id } });
        if (!shop) throw new NotFoundException(`loja ${dto.loja_retirada_id} não encontrada`);
        if (!shop.ativa) throw new ConflictException('a loja selecionada está inativa');
        reservation.loja_retirada_id = shop.id;
        reservation.lojaRetirada = shop;
        reservation.lojaRetiradaSnapshot = {
          nome: shop.nome,
          logradouro: shop.logradouro,
          numero: shop.numero,
          cidade: shop.cidade,
          uf: shop.uf,
        };
      }

      if (hasCommercialChanges) {
        reservation.valorSubtotal = reservation.calcularValor();
        reservation.valorTotal = Math.round((Number(reservation.valorSubtotal) + Number(reservation.taxaServico)) * 100) / 100;
      }

      if (dto.status && dto.status !== current.status) {
        reservation.status = dto.status;
        if (dto.status === StatusReserva.CONFIRMADA) {
          const notificationRepository = manager.getRepository(Notificacao);
          await notificationRepository.save(notificationRepository.create({
            usuario_id: reservation.client.user_id,
            reserva_id: reservation.id,
            tipo: 'reserva_confirmada',
            titulo: 'Reserva confirmada',
            descricao: `A equipe confirmou a reserva ${reservation.codigo}.`,
            lida_em: null,
          }));
        }
      }

      return repository.save(reservation);
    });

    // Invalida o cache da reserva atualizada somente apos a gravacao no MySQL.
    try {
      await this.redis.del(`locamais:reserva:${id}`);
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar cache da reserva ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.cacheInvalidation.invalidateReservationInspections(id);
    if (dto.status === StatusReserva.CONFIRMADA) {
      await this.cacheInvalidation.invalidateKeys([`locamais:notificacoes:nao-lidas:${saved.client.user_id}`]);
    }

    return this.findOne(saved.id);
  }

  private async publicCodeSequence(manager: import('typeorm').EntityManager, reservation: Reserva): Promise<number> {
    const type = manager.connection.options.type;
    if (type === 'mysql' || type === 'mariadb') {
      const rows = await manager.query('SELECT codigo_sequencial FROM reservas WHERE id = ?', [reservation.id]) as Array<{ codigo_sequencial: number }>;
      const sequence = Number(rows[0]?.codigo_sequencial);
      if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Não foi possível obter a sequência do código da reserva.');
      return sequence;
    }

    const rows = await manager.query('SELECT COALESCE(MAX(codigo_sequencial), 0) + 1 AS next FROM reservas') as Array<{ next: number }>;
    const sequence = Number(rows[0]?.next);
    await manager.query('UPDATE reservas SET codigo_sequencial = ? WHERE id = ?', [sequence, reservation.id]);
    return sequence;
  }

  private async notificacoesEmail(reservation: Reserva, _actor: UsuarioAutenticado, cancelledAt: Date, refunded: boolean): Promise<void> {
    const user = reservation.client?.user;
    if (!user?.email || !this.notificationService) return;
    const payment = reservation.pagamentos?.find((item) => item.status === StatusPagamento.APROVADO || item.status === StatusPagamento.ESTORNADO);
    const shop = reservation.lojaRetiradaSnapshot ?? (reservation.lojaRetirada ? {
      nome: reservation.lojaRetirada.nome, logradouro: reservation.lojaRetirada.logradouro,
      numero: reservation.lojaRetirada.numero, cidade: reservation.lojaRetirada.cidade, uf: reservation.lojaRetirada.uf,
    } : null);
    await this.notificationService.sendCancellationEmail(user.email, user.name, {
      'Código da reserva': reservation.codigo ?? reservation.id,
      Veículo: `${reservation.car?.marca ?? ''} ${reservation.car?.modelo ?? ''}`.trim(),
      ...(reservation.car?.placa ? { Placa: reservation.car.placa } : {}),
      'Loja de retirada': shop ? `${shop.nome} — ${shop.logradouro}, ${shop.numero}, ${shop.cidade}/${shop.uf}` : 'Não informada',
      'Retirada': new Date(reservation.dataRetirada).toLocaleString('pt-BR'),
      'Devolução': new Date(reservation.dataDevolucao).toLocaleString('pt-BR'),
      'Valor total': `R$ ${Number(reservation.valorTotal).toFixed(2)}`,
      'Forma de pagamento': payment?.metodo ?? 'Não pago',
      'Cancelada em': cancelledAt.toLocaleString('pt-BR'),
    }, refunded);
  }

  /**
   * Cancelamento lógico.
   *
   * Não apaga a linha: apenas muda o status para CANCELADA. Como a consulta
   * de conflito ignora CANCELADA, o veículo deixa de ser bloqueado no período.
   * Admin/funcionário podem cancelar qualquer reserva; o cliente só cancela
   * as próprias.
   */
  async cancel(actor: UsuarioAutenticado, id: string): Promise<Reserva> {
    const reservation = await this.findOne(id);
    this.assertCanRead(actor, reservation);

    if ([StatusReserva.CANCELADA, StatusReserva.CONCLUIDA].includes(reservation.status)) {
      throw new ConflictException('a reserva já foi cancelada ou concluída');
    }
    if (actor.type === TipoUsuario.CLIENTE && reservation.status !== StatusReserva.PENDENTE) {
      throw new ConflictException('o cliente só pode cancelar reservas aguardando pagamento');
    }
    if (actor.type === TipoUsuario.CLIENTE) {
      const pickup = this.asDate(reservation.dataRetirada, 'dataRetirada');
      const localDay = (date: Date): string => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(date);
      if (localDay(pickup) <= localDay(new Date())) {
        throw new ConflictException('a reserva só pode ser cancelada antes do dia da retirada');
      }
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Reserva);
       const current = await repository.findOne({
         where: { id },
         ...(manager.connection?.options?.type === 'mysql' ? { lock: { mode: 'pessimistic_write' as const } } : {}),
       });
      if (!current || [StatusReserva.CANCELADA, StatusReserva.CONCLUIDA].includes(current.status)) throw new ConflictException('a reserva já foi cancelada ou concluída');
      const payments = await manager.getRepository(Pagamento).find({ where: { reservation_id: id } });
      const approved = payments.find((payment) => payment.status === StatusPagamento.APROVADO);
      const notificationRepository = manager.getRepository(Notificacao);
      const cancelDate = new Date();
      current.status = StatusReserva.CANCELADA;
      current.cancelada_em = cancelDate;
      current.cancelada_por = actor.id;
      if (approved) {
        const refundRepository = manager.getRepository(Estorno);
        const existingRefund = await refundRepository.findOne({ where: { pagamento_id: approved.id } });
        if (!existingRefund) await refundRepository.save(refundRepository.create({ pagamento_id: approved.id, pagamento: approved, valor: approved.valor, tipo: 'simulado' }));
        approved.status = StatusPagamento.ESTORNADO;
        await manager.getRepository(Pagamento).save(approved);
      } else {
        const pendingPayments = payments.filter((item) => item.status === StatusPagamento.PENDENTE);
        for (const payment of pendingPayments) {
          payment.status = StatusPagamento.CANCELADO;
          await manager.getRepository(Pagamento).save(payment);
        }
        if (pendingPayments.length) await notificationRepository.save(notificationRepository.create({
          usuario_id: reservation.client.user_id,
          reserva_id: id,
          tipo: 'pagamento_cancelado',
          titulo: 'Pagamento cancelado',
          descricao: `A reserva ${reservation.codigo} foi cancelada antes do pagamento. Não há pagamento pendente.`,
          lida_em: null,
        }));
      }
      await notificationRepository.save(notificationRepository.create({
        usuario_id: reservation.client.user_id,
        reserva_id: id,
        tipo: 'reserva_cancelada',
        titulo: 'Reserva cancelada',
        descricao: `A reserva ${reservation.codigo} foi cancelada pela equipe LocaMais.`,
        lida_em: null,
      }));
      if (approved) await notificationRepository.save(notificationRepository.create({
        usuario_id: reservation.client.user_id,
        reserva_id: id,
        tipo: 'estorno_realizado',
        titulo: 'Estorno simulado realizado',
        descricao: `O valor pago pela reserva ${reservation.codigo} foi estornado na simulação acadêmica.`,
        lida_em: null,
      }));
      return { saved: await repository.save(current), refunded: !!approved, cancelDate };
    });

    // Invalida o cache da reserva cancelada somente apos a gravacao no MySQL.
    try {
      await this.redis.del(`locamais:reserva:${id}`);
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar cache da reserva ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.cacheInvalidation.invalidateReservationInspections(id);

    await this.cacheInvalidation.invalidateKeys([`locamais:notificacoes:nao-lidas:${reservation.client.user_id}`]);
    try {
      await this.notificacoesEmail(reservation, actor, saved.cancelDate, saved.refunded);
    } catch (error) {
      this.logger.error(`Reserva ${reservation.codigo} cancelada, mas o e-mail não foi enviado: ${error instanceof Error ? error.message : String(error)}`);
    }
    return this.findOne(saved.saved.id);
  }

  /**
   * Consulta pública (para autenticados) de disponibilidade de um carro.
   *
   * Retorna `disponivel: false` com um motivo explícito em vez de lançar erro,
   * porque é uma consulta de planejamento. Erros de carro inexistente ou
   * período inválido continuam sendo 404/400.
   */
  async checkAvailability(
    dto: ConsultarDisponibilidadeDto,
  ): Promise<DisponibilidadeReserva> {
    const dataRetirada = this.parseDate(dto.dataRetirada, 'dataRetirada');
    const dataDevolucao = this.parseDate(dto.dataDevolucao, 'dataDevolucao');
    this.assertPeriod(dataRetirada, dataDevolucao, false);

    const car = await this.carroService.findOne(dto.car_id);
    const resultado = await this.getAvailability(
      this.reservasRepository,
      car,
      dataRetirada,
      dataDevolucao,
    );

    return {
      car_id: car.id,
      dataRetirada,
      dataDevolucao,
      disponivel: resultado.motivo === null,
      motivo: resultado.motivo,
      conflito: resultado.conflito
        ? {
            id: resultado.conflito.id,
            dataRetirada: resultado.conflito.dataRetirada,
            dataDevolucao: resultado.conflito.dataDevolucao,
            status: resultado.conflito.status,
          }
        : null,
    };
  }

  async quote(dto: ConsultarDisponibilidadeDto): Promise<{ valorDiaria: number; diarias: number; valorSubtotal: number; taxaServico: number; valorTotal: number }> {
    const dataRetirada = this.parseDate(dto.dataRetirada, 'dataRetirada');
    const dataDevolucao = this.parseDate(dto.dataDevolucao, 'dataDevolucao');
    this.assertPeriod(dataRetirada, dataDevolucao, false);
    const car = await this.carroService.findOne(dto.car_id);
    const valorDiaria = Number(car.valorDiaria);
    const diarias = Reserva.calcularDiarias(dataRetirada, dataDevolucao);
    const valorSubtotal = Math.round(valorDiaria * 100) * diarias / 100;
    const { valor: taxaServico } = await this.configuracaoService.getTaxaServico();
    return {
      valorDiaria,
      diarias,
      valorSubtotal,
      taxaServico,
      valorTotal: Math.round((valorSubtotal + taxaServico) * 100) / 100,
    };
  }

  /**
   * Resolve o cliente da reserva e aplica a regra de propriedade.
   *
   * Staff pode reservar para qualquer cliente; cliente só para si. A consulta
   * por `findByUserId` é importante porque o JWT carrega `users.id`, enquanto
   * a reserva referencia `clients.id`.
   */
  private async resolveClientForActor(
    actor: UsuarioAutenticado,
    clientId: number,
  ): Promise<Cliente> {
    if (this.isStaff(actor)) {
      return this.clienteService.findOne(clientId);
    }

    const ownClient = await this.clienteService.findByUserId(actor.id);

    if (!ownClient) {
      throw new ForbiddenException(
        'usuario autenticado nao possui cadastro de cliente',
      );
    }

    if (ownClient.id !== clientId) {
      throw new ForbiddenException(
        'clientes so podem criar reservas para o proprio cadastro',
      );
    }

    return ownClient;
  }

  /** Cliente desativado não pode criar novas reservas. */
  private assertClientActive(client: Cliente): void {
    if (client.deleted_at || client.user?.active === false) {
      throw new ConflictException(`cliente ${client.id} esta inativo`);
    }
  }

  /** Staff enxerga tudo; cliente só enxerga as próprias reservas. */
  private assertCanRead(actor: UsuarioAutenticado, reservation: Reserva): void {
    if (this.isStaff(actor)) return;

    if (!reservation.client || reservation.client.user_id !== actor.id) {
      throw new ForbiddenException(
        'clientes so podem acessar as proprias reservas',
      );
    }
  }

  private isStaff(actor: UsuarioAutenticado): boolean {
    return (
      actor.type === TipoUsuario.ADMIN || actor.type === TipoUsuario.FUNCIONARIO
    );
  }

  /**
   * Carrega o carro dentro da transação.
   *
   * No MySQL, `pessimistic_write` faz um `SELECT ... FOR UPDATE` na linha do
   * carro. Duas requisições para o mesmo carro são serializadas: a segunda só
   * verifica conflito depois que a primeira commitou. No SQLite o lock não é
   * suportado; nesse caso usamos apenas a transação.
   */
  private async findCarForUpdate(
    manager: EntityManager,
    carId: number,
  ): Promise<Carro> {
    const options: FindOneOptions<Carro> = {
      where: { id: carId },
    };

    if (this.dataSource.options.type === 'mysql') {
      options.lock = { mode: 'pessimistic_write' };
    }

    const car = await manager.findOne(Carro, options);

    if (!car) {
      throw new NotFoundException(`veiculo de ID ${carId} nao encontrado`);
    }

    return car;
  }

  /**
   * Garante que o carro pode ser reservado no período ou lança 409.
   *
   * `ALUGADO` representa uma locação em andamento. Para retiradas futuras,
   * permitimos a reserva e deixamos o calendário de reservas decidir; para
   * retirada imediata/passada, bloqueamos. `MANUTENCAO` bloqueia sempre.
   */
  private async assertAvailable(
    repository: Repository<Reserva>,
    car: Carro,
    dataRetirada: Date,
    dataDevolucao: Date,
    excludeReservationId?: string,
  ): Promise<void> {
    const resultado = await this.getAvailability(
      repository,
      car,
      dataRetirada,
      dataDevolucao,
      excludeReservationId,
    );

    if (resultado.motivo === 'manutencao') {
      throw new ConflictException(
        `veiculo ${car.id} esta em manutencao e nao pode ser reservado`,
      );
    }

    if (resultado.motivo === 'locacao_em_andamento') {
      throw new ConflictException(
        `veiculo ${car.id} esta alugado no momento; escolha uma retirada futura`,
      );
    }

    if (resultado.conflito) {
      throw new ConflictException(
        `veiculo indisponivel no periodo: conflito com a reserva ${resultado.conflito.id}`,
      );
    }
  }

  /** Calcula o motivo de indisponibilidade e a reserva conflitante, se houver. */
  private async getAvailability(
    repository: Repository<Reserva>,
    car: Carro,
    dataRetirada: Date,
    dataDevolucao: Date,
    excludeReservationId?: string,
  ): Promise<{
    motivo: MotivoIndisponibilidade | null;
    conflito: Reserva | null;
  }> {
    if (car.status === StatusVeiculo.MANUTENCAO) {
      return { motivo: 'manutencao', conflito: null };
    }

    if (
      car.status === StatusVeiculo.ALUGADO &&
      dataRetirada.getTime() <= Date.now()
    ) {
      return { motivo: 'locacao_em_andamento', conflito: null };
    }

    const conflito = await this.findConflict(
      repository,
      car.id,
      dataRetirada,
      dataDevolucao,
      excludeReservationId,
    );

    return {
      motivo: conflito ? 'conflito' : null,
      conflito,
    };
  }

  /**
   * Busca uma reserva ativa que se sobreponha ao período.
   *
   * A regra de sobreposição é `existente.inicio < novo.fim` E
   * `existente.fim > novo.inicio`. Usar `<`/`>` (e não `<=`/`>=`) permite
   * que uma reserva comece exatamente no instante em que a outra termina.
   *
   * Reservas CANCELADAS não entram na consulta, então deixam de bloquear o
   * veículo assim que o cancelamento é persistido.
   */
  private findConflict(
    repository: Repository<Reserva>,
    carId: number,
    dataRetirada: Date,
    dataDevolucao: Date,
    excludeReservationId?: string,
  ): Promise<Reserva | null> {
    const query = repository
      .createQueryBuilder('reservation')
      .where('reservation.car_id = :carId', { carId })
      .andWhere('reservation.status IN (:...statuses)', {
        statuses: STATUSES_BLOQUEANTES,
      })
      .andWhere('reservation.dataRetirada < :dataDevolucao', {
        dataDevolucao,
      })
      .andWhere('reservation.dataDevolucao > :dataRetirada', {
        dataRetirada,
      });

    if (excludeReservationId) {
      query.andWhere('reservation.id != :excludeReservationId', {
        excludeReservationId,
      });
    }

    return query.getOne();
  }

  /** Converte uma string ISO em Date e rejeita valor inválido com 400. */
  private parseDate(value: string, field: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} invalida`);
    }

    return date;
  }

  /** Normaliza uma data já persistida (TypeORM pode devolver Date/string). */
  private asDate(value: Date | string, field: string): Date {
    const date =
      value instanceof Date ? new Date(value.getTime()) : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} armazenada invalida`);
    }

    return date;
  }

  /**
   * Valida a ordem do período. `requireFutureStart` é usado apenas quando o
   * cliente está criando/alterando datas; confirmação de reserva antiga não
   * deve ser bloqueada só porque a retirada já passou.
   */
  private assertPeriod(
    dataRetirada: Date,
    dataDevolucao: Date,
    requireFutureStart: boolean,
  ): void {
    if (dataDevolucao.getTime() <= dataRetirada.getTime()) {
      throw new BadRequestException(
        'dataDevolucao deve ser posterior a dataRetirada',
      );
    }

    if (requireFutureStart && dataRetirada.getTime() < Date.now()) {
      throw new BadRequestException('dataRetirada nao pode estar no passado');
    }
  }
}
