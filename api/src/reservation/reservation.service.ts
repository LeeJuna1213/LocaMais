import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOneOptions, Repository } from 'typeorm';

import { Car } from '../car/entities/car.entity.js';
import { CarService } from '../car/car.service.js';
import { StatusVeiculo } from '../car/enums/status-veiculo.enum.js';
import { Client } from '../client/entities/client.entity.js';
import { ClientService } from '../client/client.service.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { UserType } from '../user/enums/user.enum.js';

import { CheckAvailabilityDto } from './dto/check-availability.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { UpdateReservationDto } from './dto/update-reservation.dto.js';
import { Reservation } from './entities/reservation.entity.js';
import { StatusReserva } from './enums/reservation-status.enum.js';

/**
 * Status que bloqueiam o veículo no calendário.
 *
 * CANCELADA não bloqueia (a reserva foi desfeita) e CONCLUIDA representa um
 * período já encerrado; nenhuma das duas deve impedir uma nova reserva.
 */
const STATUSES_BLOQUEANTES: StatusReserva[] = [
  StatusReserva.PENDENTE,
  StatusReserva.CONFIRMADA,
];

/** Motivos possíveis para um veículo não estar disponível em um período. */
export type MotivoIndisponibilidade =
  'manutencao' | 'locacao_em_andamento' | 'conflito';

/** Resumo de uma reserva que conflita com o período consultado. */
export interface ReservationConflict {
  id: string;
  dataRetirada: Date;
  dataDevolucao: Date;
  status: StatusReserva;
}

/** Formato de resposta da consulta de disponibilidade. */
export interface ReservationAvailability {
  car_id: number;
  dataRetirada: Date;
  dataDevolucao: Date;
  disponivel: boolean;
  motivo: MotivoIndisponibilidade | null;
  conflito: ReservationConflict | null;
}

/**
 * Regras de negócio das reservas.
 *
 * Injeção de dependência:
 * - `Repository<Reservation>` vem do `TypeOrmModule.forFeature([Reservation])`;
 * - `ClientService` e `CarService` vêm dos módulos exportadores;
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
export class ReservationService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationsRepository: Repository<Reservation>,
    private readonly dataSource: DataSource,
    private readonly clientService: ClientService,
    private readonly carService: CarService,
  ) {}

  /**
   * Cria uma reserva PENDENTE.
   *
   * O status inicial e o valor total são definidos aqui, nunca pelo body.
   * Um cliente autenticado só pode reservar para o próprio cadastro; admin e
   * funcionário podem criar para qualquer cliente.
   */
  async create(
    actor: AuthenticatedUser,
    dto: CreateReservationDto,
  ): Promise<Reservation> {
    const client = await this.resolveClientForActor(actor, dto.client_id);
    this.assertClientActive(client);

    const dataRetirada = this.parseDate(dto.dataRetirada, 'dataRetirada');
    const dataDevolucao = this.parseDate(dto.dataDevolucao, 'dataDevolucao');

    // Em criação, a retirada precisa estar no futuro. A devolução só precisa
    // ser posterior à retirada; não há limite máximo de antecedência definido
    // no projeto.
    this.assertPeriod(dataRetirada, dataDevolucao, true);

    const saved = await this.dataSource.transaction(async (manager) => {
      const car = await this.findCarForUpdate(manager, dto.car_id);
      const repository = manager.getRepository(Reservation);

      await this.assertAvailable(repository, car, dataRetirada, dataDevolucao);

      const reservation = repository.create({
        dataRetirada,
        dataDevolucao,
        status: StatusReserva.PENDENTE,
        client_id: client.id,
        client,
        car_id: car.id,
        car,
      });

      // O carro foi carregado acima, então calcularValor() usa o preço real
      // do banco e não um valor enviado pelo cliente.
      reservation.valorTotal = reservation.calcularValor();

      return repository.save(reservation);
    });

    return this.findOne(saved.id);
  }

  /**
   * Lista reservas conforme o papel do usuário.
   *
   * Admin/funcionário veem todas; cliente vê apenas as reservas ligadas ao
   * seu `client_id`. O vínculo é feito por `clients.user_id`, porque o token
   * carrega o ID do usuário, não o ID do cliente.
   */
  findAllForActor(actor: AuthenticatedUser): Promise<Reservation[]> {
    if (this.isStaff(actor)) {
      return this.reservationsRepository.find({
        relations: { client: true, car: true },
        order: { dataRetirada: 'ASC' },
      });
    }

    return this.reservationsRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.client', 'client')
      .leftJoinAndSelect('reservation.car', 'car')
      .where('client.user_id = :userId', { userId: actor.id })
      .orderBy('reservation.dataRetirada', 'ASC')
      .getMany();
  }

  /**
   * Consulta uma reserva por UUID, carregando cliente e carro.
   * Lança 404 para o Controller, em vez de devolver `null`.
   */
  async findOne(id: string): Promise<Reservation> {
    const reservation = await this.reservationsRepository.findOne({
      where: { id },
      relations: { client: true, car: true },
    });

    if (!reservation) {
      throw new NotFoundException(`reserva de ID ${id} nao encontrada`);
    }

    return reservation;
  }

  /** Leitura com controle de acesso (staff ou dono da reserva). */
  async findOneForActor(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<Reservation> {
    const reservation = await this.findOne(id);
    this.assertCanRead(actor, reservation);
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
  async update(id: string, dto: UpdateReservationDto): Promise<Reservation> {
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
    const hasCommercialChanges = changesDates || changesClient || changesCar;

    if (current.status === StatusReserva.CONFIRMADA && hasCommercialChanges) {
      throw new ConflictException(
        'reserva confirmada nao pode ter periodo, cliente ou carro alterados',
      );
    }

    if (dto.status && dto.status !== current.status) {
      const transicaoPermitida =
        (current.status === StatusReserva.PENDENTE &&
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
    // banco. Isso segue o comportamento tolerante do UpdateCarDto.
    if (
      !hasCommercialChanges &&
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
      ? await this.clientService.findOne(clientId)
      : current.client;
    this.assertClientActive(client);

    const saved = await this.dataSource.transaction(async (manager) => {
      const car = await this.findCarForUpdate(manager, carId);
      const repository = manager.getRepository(Reservation);

      if (hasCommercialChanges || dto.status === StatusReserva.CONFIRMADA) {
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
        relations: { client: true, car: true },
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

      if (hasCommercialChanges) {
        reservation.valorTotal = reservation.calcularValor();
      }

      if (dto.status && dto.status !== current.status) {
        reservation.status = dto.status;
      }

      return repository.save(reservation);
    });

    return this.findOne(saved.id);
  }

  /**
   * Cancelamento lógico.
   *
   * Não apaga a linha: apenas muda o status para CANCELADA. Como a consulta
   * de conflito ignora CANCELADA, o veículo deixa de ser bloqueado no período.
   * Admin/funcionário podem cancelar qualquer reserva; o cliente só cancela
   * as próprias.
   */
  async cancel(actor: AuthenticatedUser, id: string): Promise<Reservation> {
    const reservation = await this.findOne(id);
    this.assertCanRead(actor, reservation);

    if (reservation.status === StatusReserva.CANCELADA) {
      throw new ConflictException('reserva ja esta cancelada');
    }

    if (reservation.status === StatusReserva.CONCLUIDA) {
      throw new ConflictException('reserva concluida nao pode ser cancelada');
    }

    reservation.status = StatusReserva.CANCELADA;
    await this.reservationsRepository.save(reservation);

    return this.findOne(id);
  }

  /**
   * Consulta pública (para autenticados) de disponibilidade de um carro.
   *
   * Retorna `disponivel: false` com um motivo explícito em vez de lançar erro,
   * porque é uma consulta de planejamento. Erros de carro inexistente ou
   * período inválido continuam sendo 404/400.
   */
  async checkAvailability(
    dto: CheckAvailabilityDto,
  ): Promise<ReservationAvailability> {
    const dataRetirada = this.parseDate(dto.dataRetirada, 'dataRetirada');
    const dataDevolucao = this.parseDate(dto.dataDevolucao, 'dataDevolucao');
    this.assertPeriod(dataRetirada, dataDevolucao, false);

    const car = await this.carService.findOne(dto.car_id);
    const resultado = await this.getAvailability(
      this.reservationsRepository,
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

  /**
   * Resolve o cliente da reserva e aplica a regra de propriedade.
   *
   * Staff pode reservar para qualquer cliente; cliente só para si. A consulta
   * por `findByUserId` é importante porque o JWT carrega `users.id`, enquanto
   * a reserva referencia `clients.id`.
   */
  private async resolveClientForActor(
    actor: AuthenticatedUser,
    clientId: number,
  ): Promise<Client> {
    if (this.isStaff(actor)) {
      return this.clientService.findOne(clientId);
    }

    const ownClient = await this.clientService.findByUserId(actor.id);

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
  private assertClientActive(client: Client): void {
    if (client.user && client.user.active === false) {
      throw new ConflictException(`cliente ${client.id} esta inativo`);
    }
  }

  /** Staff enxerga tudo; cliente só enxerga as próprias reservas. */
  private assertCanRead(
    actor: AuthenticatedUser,
    reservation: Reservation,
  ): void {
    if (this.isStaff(actor)) return;

    if (!reservation.client || reservation.client.user_id !== actor.id) {
      throw new ForbiddenException(
        'clientes so podem acessar as proprias reservas',
      );
    }
  }

  private isStaff(actor: AuthenticatedUser): boolean {
    return actor.type === UserType.ADMIN || actor.type === UserType.FUNCIONARIO;
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
  ): Promise<Car> {
    const options: FindOneOptions<Car> = {
      where: { id: carId },
    };

    if (this.dataSource.options.type === 'mysql') {
      options.lock = { mode: 'pessimistic_write' };
    }

    const car = await manager.findOne(Car, options);

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
    repository: Repository<Reservation>,
    car: Car,
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
    repository: Repository<Reservation>,
    car: Car,
    dataRetirada: Date,
    dataDevolucao: Date,
    excludeReservationId?: string,
  ): Promise<{
    motivo: MotivoIndisponibilidade | null;
    conflito: Reservation | null;
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
    repository: Repository<Reservation>,
    carId: number,
    dataRetirada: Date,
    dataDevolucao: Date,
    excludeReservationId?: string,
  ): Promise<Reservation | null> {
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
