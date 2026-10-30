import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Car } from '../car/entities/car.entity.js';
import { StatusVeiculo } from '../car/enums/status-veiculo.enum.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import { UserType } from '../user/enums/user.enum.js';
import { Reservation } from '../reservation/entities/reservation.entity.js';
import { ReservationService } from '../reservation/reservation.service.js';
import { StatusReserva } from '../reservation/enums/reservation-status.enum.js';

import { CreateLocacaoDto } from './dto/create-locacao.dto.js';
import { LocacaoAdicionaisDto } from './dto/locacao-adicionais.dto.js';
import { UpdateLocacaoDto } from './dto/update-locacao.dto.js';
import { Locacao } from './entities/locacao.entity.js';
import { StatusLocacao } from './enums/status-locacao.enum.js';

/**
 * Regras de negócio das locações.
 *
 * Uma locação é a materialização efetiva de uma reserva: a reserva guarda o
 * período *previsto* e a locação registra as datas *efetivas* de retirada e
 * devolução, além do valor total (base da reserva + adicionais de atraso).
 *
 * Injeção de dependência:
 * - `Repository<Locacao>` vem do `TypeOrmModule.forFeature([Locacao, ...])`;
 * - `Repository<Reservation>` e `Repository<Car>` são usados para atualizar a
 *   reserva e o veículo dentro da mesma transação que a locação, garantindo
 *   consistência (ex: retirada marca o veículo como alugado);
 * - `ReservationService` é reaproveitado para consultar a reserva de origem
 *   (com cliente e carro já carregados);
 * - `DataSource` abre as transações.
 *
 * O módulo `Reservation` já foi projetado para ser reutilizado por uma futura
 * entidade de Locação (veja o comentário de `ReservationModule`), e não há
 * dependência circular: `ReservationModule` e `CarModule` não importam
 * `LocacaoModule`.
 */
@Injectable()
export class LocacaoService {
  constructor(
    @InjectRepository(Locacao)
    private readonly locacoesRepository: Repository<Locacao>,
    @InjectRepository(Reservation)
    private readonly reservationsRepository: Repository<Reservation>,
    @InjectRepository(Car)
    private readonly carsRepository: Repository<Car>,
    private readonly dataSource: DataSource,
    private readonly reservationService: ReservationService,
  ) {}

  /**
   * Cria uma locação vinculada a uma reserva confirmada.
   *
   * Regras:
   * - A reserva deve existir;
   * - A reserva deve estar `confirmada` (situação que autoriza iniciar uma locação);
   * - Reserva cancelada, pendente ou concluída não originam locação;
   * - Uma reserva pode originar no máximo uma locação (índice único em `reservation_id`);
   * - O cliente autenticado só pode criar locação para a própria reserva;
   *   admin/funcionário podem criar para qualquer reserva;
   * - `status` inicial é `AGUARDANDO_RETIRADA` e `valorTotal` começa como o
   *   `valorTotal` da reserva (diárias × valorDiaria do veículo), nunca
   *   informado pelo cliente.
   */
  async create(
    actor: AuthenticatedUser,
    dto: CreateLocacaoDto,
  ): Promise<Locacao> {
    const reservation = await this.reservationService.findOne(
      dto.reservation_id,
    );

    this.assertCanManageReservation(actor, reservation);

    if (reservation.status !== StatusReserva.CONFIRMADA) {
      throw new ConflictException(
        `nao e possivel criar locacao: reserva ${reservation.id} esta com status "${reservation.status}". Apenas reservas confirmadas podem originar uma locacao.`,
      );
    }

    const jaPossuiLocacao = await this.locacoesRepository.exists({
      where: { reservation_id: reservation.id },
    });
    if (jaPossuiLocacao) {
      throw new ConflictException(
        `reserva ${reservation.id} ja possui uma locação`,
      );
    }

    const locacao = this.locacoesRepository.create({
      reservation_id: reservation.id,
      reservation,
      status: StatusLocacao.AGUARDANDO_RETIRADA,
      valorTotal: reservation.valorTotal,
    });

    const saved = await this.locacoesRepository.save(locacao);

    return this.findOne(actor, saved.id);
  }

  /**
   * Lista locações conforme o papel do usuário.
   *
   * Admin/funcionário veem todas; cliente vê apenas as locações ligadas à sua
   * própria reserva (via `reservation.client.user_id`).
   */
  findAll(actor: AuthenticatedUser): Promise<Locacao[]> {
    const queryBuilder = this.locacoesRepository
      .createQueryBuilder('locacao')
      .leftJoinAndSelect('locacao.reservation', 'reservation')
      .leftJoinAndSelect('reservation.client', 'client')
      .leftJoinAndSelect('reservation.car', 'car')
      .orderBy('locacao.created_at', 'DESC');

    if (!this.isStaff(actor)) {
      queryBuilder.where('client.user_id = :userId', {
        userId: actor.id,
      });
    }

    return queryBuilder.getMany();
  }

  /**
   * Consulta uma locação por UUID, carregando reserva, cliente e carro.
   * Lança 404 quando não existe e 403 quando o cliente não é o dono.
   */
  async findOne(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<Locacao> {
    const locacao = await this.locacoesRepository.findOne({
      where: { id },
      relations: { reservation: { client: true, car: true } },
    });

    if (!locacao) {
      throw new NotFoundException(`locacao de ID ${id} nao encontrada`);
    }

    this.assertCanRead(actor, locacao);
    return locacao;
  }

  /**
   * Atualização parcial. No momento apenas a transição de status para
   * CANCELADA é permitida, e somente quando a locação ainda está
   * aguardando retirada.
   */
  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateLocacaoDto,
  ): Promise<Locacao> {
    const current = await this.findOne(actor, id);

    if (!dto.status || dto.status === current.status) {
      return current;
    }

    if (
      current.status === StatusLocacao.AGUARDANDO_RETIRADA &&
      dto.status === StatusLocacao.CANCELADA
    ) {
      current.status = StatusLocacao.CANCELADA;
      const saved = await this.locacoesRepository.save(current);
      return this.findOne(actor, saved.id);
    }

    throw new ConflictException(
      `transição de status inválida: ${current.status} -> ${dto.status}. A única alteração permitida é cancelar (aguardando_retirada -> cancelada).`,
    );
  }

  /**
   * Registra a retirada efetiva do veículo.
   *
   * Regras:
   * - A locação deve existir e estar `AGUARDANDO_RETIRADA` (impede segunda retirada);
   * - Registra `dataRetirada` como o instante atual;
   * - Atualiza o status para `EM_ANDAMENTO`;
   * - Atualiza o veículo para `ALUGADO`.
   *
   * Locação e veículo são atualizados na mesma transação.
   */
  async registrarRetirada(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<Locacao> {
    await this.findOne(actor, id); // 404 + controle de acesso

    const saved = await this.dataSource.transaction(async (manager) => {
      const locacaoRepository = manager.getRepository(Locacao);
      const carRepository = manager.getRepository(Car);

      const locacao = await locacaoRepository.findOne({
        where: { id },
        relations: { reservation: { car: true } },
      });

      if (!locacao) {
        throw new NotFoundException(`locacao de ID ${id} nao encontrada`);
      }

      if (locacao.status !== StatusLocacao.AGUARDANDO_RETIRADA) {
        throw new ConflictException(
          `nao e possivel registrar retirada: locacao ${id} esta com status "${locacao.status}"`,
        );
      }

      locacao.registrarRetirada();

      const car = locacao.reservation.car;
      if (!car) {
        throw new NotFoundException(
          `veiculo da reserva ${locacao.reservation_id} nao encontrado`,
        );
      }
      car.status = StatusVeiculo.ALUGADO;

      await locacaoRepository.save(locacao);
      await carRepository.save(car);

      return locacao;
    });

    return this.findOne(actor, saved.id);
  }

  /**
   * Registra a devolução efetiva do veículo.
   *
   * Regras:
   * - A locação deve existir e estar `EM_ANDAMENTO`;
   * - Registra `dataDevolucao` como o instante atual;
   * - Atualiza o status para `CONCLUIDA`;
   * - Atualiza `valorTotal` adicionando os valores de atraso (calculados uma
   *   única vez aqui, sem duplicar cobranças);
   * - Atualiza o veículo para `DISPONIVEL`;
   * - Marca a reserva de origem como `CONCLUIDA`.
   *
   * Locação, veículo e reserva são atualizados na mesma transação.
   */
  async registrarDevolucao(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<Locacao> {
    await this.findOne(actor, id); // 404 + controle de acesso

    const saved = await this.dataSource.transaction(async (manager) => {
      const locacaoRepository = manager.getRepository(Locacao);
      const carRepository = manager.getRepository(Car);
      const reservationRepository = manager.getRepository(Reservation);

      const locacao = await locacaoRepository.findOne({
        where: { id },
        relations: { reservation: { client: true, car: true } },
      });

      if (!locacao) {
        throw new NotFoundException(`locacao de ID ${id} nao encontrada`);
      }

      if (locacao.status !== StatusLocacao.EM_ANDAMENTO) {
        throw new ConflictException(
          `nao e possivel registrar devolução: locacao ${id} esta com status "${locacao.status}"`,
        );
      }

      locacao.registrarDevolucao();

      const reservation = locacao.reservation;
      const car = reservation.car;
      if (!car) {
        throw new NotFoundException(
          `veiculo da reserva ${reservation.id} nao encontrado`,
        );
      }

      // Os adicionais são calculados com base na diária real do veículo
      // (banco de dados) e na data prevista da reserva. O resultado é
      // aplicado ao valorTotal apenas aqui, uma única vez.
      const { valorAdicional } = locacao.calcularAdicionais(
        reservation.dataDevolucao,
        Number(car.valorDiaria),
      );
      locacao.valorTotal = Number(reservation.valorTotal) + valorAdicional;

      car.status = StatusVeiculo.DISPONIVEL;
      reservation.status = StatusReserva.CONCLUIDA;

      await locacaoRepository.save(locacao);
      await carRepository.save(car);
      await reservationRepository.save(reservation);

      return locacao;
    });

    return this.findOne(actor, saved.id);
  }

  /**
   * Consulta os valores adicionais calculados para a locação (atraso).
   *
   * É um cálculo de leitura: não persiste nada, então consultar várias vezes
   * não gera cobrança duplicada. A aplicação do adicional ao `valorTotal`
   * ocorre apenas no registro da devolução (`registrarDevolucao`).
   *
   * Regra de atraso:
   * - Compara a devolução efetiva (ou o momento atual, se ainda não devolvida)
   *   com a data prevista na reserva.
   * - Cada dia ou fração de atraso cobra uma diária inteira, usando o
   *   `valorDiaria` cadastrado no veículo (fonte: banco de dados).
   */
  async calcularAdicionais(
    actor: AuthenticatedUser,
    id: string,
  ): Promise<LocacaoAdicionaisDto> {
    const locacao = await this.findOne(actor, id);

    const reservation = locacao.reservation;
    const car = reservation.car;
    if (!car) {
      throw new NotFoundException(
        `veiculo da reserva ${reservation.id} nao encontrado`,
      );
    }

    const { valorAdicional, diasAtraso } = locacao.calcularAdicionais(
      reservation.dataDevolucao,
      Number(car.valorDiaria),
    );

    const resultado: LocacaoAdicionaisDto = {
      locacaoId: locacao.id,
      reservationId: reservation.id,
      valorDiaria: Number(car.valorDiaria),
      dataDevolucaoPrevista: reservation.dataDevolucao.toISOString(),
      dataDevolucaoEfetiva: locacao.dataDevolucao
        ? locacao.dataDevolucao.toISOString()
        : null,
      diasAtraso,
      valorAdicional,
    };

    return resultado;
  }

  /** Staff enxerga tudo; cliente só enxerga as próprias locações. */
  private assertCanRead(
    actor: AuthenticatedUser,
    locacao: Locacao,
  ): void {
    if (this.isStaff(actor)) return;

    if (
      !locacao.reservation ||
      locacao.reservation.client.user_id !== actor.id
    ) {
      throw new ForbiddenException(
        'clientes so podem acessar as proprias locacoes',
      );
    }
  }

  /** Staff pode criar para qualquer reserva; cliente só para a própria. */
  private assertCanManageReservation(
    actor: AuthenticatedUser,
    reservation: Reservation,
  ): void {
    if (this.isStaff(actor)) return;

    if (
      !reservation.client ||
      reservation.client.user_id !== actor.id
    ) {
      throw new ForbiddenException(
        'clientes so podem criar locações para as próprias reservas',
      );
    }
  }

  private isStaff(actor: AuthenticatedUser): boolean {
    return (
      actor.type === UserType.ADMIN || actor.type === UserType.FUNCIONARIO
    );
  }
}
