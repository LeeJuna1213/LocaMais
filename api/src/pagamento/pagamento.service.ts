import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';

import { StatusLocacao } from '../locacao/enums/status-locacao.enum.js';
import { LocacaoService } from '../locacao/locacao.service.js';
import { GatewayPagamento } from './entities/gateway-pagamento.entity.js';
import { Pagamento } from './entities/pagamento.entity.js';
import { StatusPagamento } from './enums/status-pagamento.enum.js';
import { CreatePagamentoDto } from './dto/create-pagamento.dto.js';
import { CreatePagamentoClienteDto } from './dto/create-pagamento-cliente.dto.js';
import { ConfirmacaoPagamentoDto } from './dto/confirmacao-pagamento.dto.js';
import { UpdatePagamentoDto } from './dto/update-pagamento.dto.js';
import { GatewayPagamentoService } from './gateway-pagamento.service.js';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface.js';
import { TipoUsuario } from '../usuario/enums/usuario.enum.js';
import { Reserva } from '../reserva/entities/reserva.entity.js';
import { StatusReserva } from '../reserva/enums/status-reserva.enum.js';
import { Estorno } from './entities/estorno.entity.js';
import { NotificacaoService } from '../notificacao/notificacao.service.js';
import { RedisService } from '../redis/redis.service.js';
import { FilterPagamentoDto } from './dto/filter-pagamento.dto.js';

/**
 * Regras de negócio de pagamento de locações.
 *
 * O `PagamentoService` é responsável por:
 * - registrar pagamentos vinculados a uma locação;
 * - consultar pagamentos por ID, por locação e listar todos;
 * - processar pagamentos simulados por meio do `GatewayPagamentoService`;
 * - confirmar pagamentos (transição de PENDENTE para APROVADO ou RECUSADO);
 * - calcular o saldo restante de uma locação;
 * - gerar o recibo (comprovante) de pagamentos aprovados.
 *
 * Injeção de dependência:
 * - `Repository<Pagamento>` e `Repository<GatewayPagamento>` são registrados
 *   por `TypeOrmModule.forFeature([Pagamento, GatewayPagamento])`;
 * - `LocacaoService` (exportado por `LocacaoModule`) valida a existência da
 *   locação, obtém o valor devido e controla o acesso;
 * - `GatewayPagamentoService` simula o processamento e a validação da
 *   transação;
 * - `DataSource` abre transações quando uma operação altera mais de uma
 *   entidade (ex: pagamento + gateway + locação).
 *
 * Não há dependência circular: `PagamentoModule` importa `LocacaoModule`,
 * mas `LocacaoModule` não importa `PagamentoModule`.
 */
@Injectable()
export class PagamentoService {
  constructor(
    @InjectRepository(Pagamento)
    private readonly pagamentosRepository: Repository<Pagamento>,
    @InjectRepository(GatewayPagamento)
    private readonly gatewaysRepository: Repository<GatewayPagamento>,
    private readonly dataSource: DataSource,
    private readonly locacaoService: LocacaoService,
    private readonly gatewayService: GatewayPagamentoService,
    @InjectRepository(Reserva) private readonly reservasRepository: Repository<Reserva>,
    @InjectRepository(Estorno) private readonly estornosRepository: Repository<Estorno>,
    private readonly notificacoes: NotificacaoService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Registra um novo pagamento vinculado a uma locação.
   *
   * Regras de negócio aplicadas:
   * 1. Verificar se a locação informada existe (404 caso contrário).
   * 2. Verificar se a locação não está cancelada.
   * 3. Obter o valor devido da locação pelo backend (`locacao.valorTotal`).
   * 4. Registrar a forma de pagamento escolhida.
   * 5. Iniciar o pagamento com status `PENDENTE`.
   * 6. Registrar a data e o horário pelo backend.
   *
   * @param dto Dados do pagamento a ser criado.
   * @returns O pagamento registrado (status PENDENTE).
   */
  async create(dto: CreatePagamentoDto): Promise<Pagamento> {
    // 1. Verifica se a locação existe.
    const locacao = await this.locacaoService.findOnePublic(dto.locacaoId);

    // 2. Verifica se a locação não está cancelada.
    if (locacao.status === StatusLocacao.CANCELADA) {
      throw new ConflictException(
        `nao e possivel registrar pagamento: locacao ${locacao.id} esta cancelada`,
      );
    }

    // 3. Obtém o saldo restante da locação (valor devido menos pagamentos aprovados).
    const saldoRestante = await this.calcularSaldoRestante(locacao.id);

    // 4. Valida que o valor do pagamento não exceda o saldo restante.
    if (dto.valor > saldoRestante) {
      throw new ConflictException(
        `valor do pagamento (${dto.valor}) excede o saldo restante da locacao (${saldoRestante})`,
      );
    }

    // 5. Cria o pagamento em memória com status PENDENTE.
    const pagamento = this.pagamentosRepository.create({
      valor: dto.valor,
      metodo: dto.metodo,
      status: StatusPagamento.PENDENTE,
      data: new Date(),
      locacao_id: locacao.id,
      gateway_id: undefined as unknown as string, // preenchido na transacao abaixo
    });

    // 6. Cria o gateway simulado associado ao pagamento.
    const gateway = this.gatewaysRepository.create({
      tipo: 'simulado',
      credenciais: 'gateway-simulado-locamais-v1',
    });

    // 7. Persiste pagamento e gateway na mesma transação para garantir consistência.
    return this.dataSource.transaction(async (manager) => {
      const pagamentoSalvo = await manager.save(pagamento);

      gateway.pagamento_id = pagamentoSalvo.id;
      await manager.save(gateway);

      pagamentoSalvo.gateway = gateway;
      pagamentoSalvo.gateway_id = gateway.id;

      return pagamentoSalvo;
    });
  }

  /** Registra uma cobrança pendente para a reserva confirmada do cliente. */
  async createMine(
    actor: UsuarioAutenticado,
    dto: CreatePagamentoClienteDto,
  ): Promise<Pagamento> {
    const reservation = await this.reservasRepository.findOne({
      where: { id: dto.reservation_id },
      relations: { client: { user: true }, car: true, lojaRetirada: true },
    });
    if (!reservation || reservation.client?.user_id !== actor.id) {
      throw new NotFoundException(`reserva ${dto.reservation_id} não encontrada`);
    }
    if ([StatusReserva.CANCELADA, StatusReserva.CONCLUIDA].includes(reservation.status)) {
      throw new ConflictException('não é possível pagar uma reserva cancelada ou concluída');
    }
    let processed = false;
    const payment = await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Pagamento);
      const current = await paymentRepository.findOne({
        where: { reservation_id: reservation.id },
        relations: { reservation: { client: { user: true }, car: true, lojaRetirada: true }, locacao: true },
        ...(manager.connection.options.type === 'mysql' ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      if (!current) throw new NotFoundException('pagamento pendente não encontrado para esta reserva');
      if (current.status === StatusPagamento.APROVADO) return current;
      if (current.status !== StatusPagamento.PENDENTE) throw new ConflictException('pagamento não está pendente');

      const value = Number(reservation.valorTotal);
      if (!Number.isFinite(value) || value <= 0 || (dto.valor !== undefined && Number(dto.valor) !== value)) {
        throw new ConflictException('o valor do pagamento deve corresponder ao total calculado pelo sistema');
      }
      const result = this.gatewayService.processarTransacao(value, dto.metodo);
      if (!result.aprovado) throw new ConflictException('pagamento simulado recusado');
      current.valor = value;
      current.metodo = dto.metodo;
      current.status = StatusPagamento.APROVADO;
      current.data = new Date();
      const gatewayRepository = manager.getRepository(GatewayPagamento);
      const gateway = gatewayRepository.create({ tipo: 'simulado', credenciais: 'gateway-simulado-locamais-v1', pagamento_id: current.id });
      await gatewayRepository.save(gateway);
      current.gateway_id = gateway.id;
      current.gateway = gateway;
      current.comprovante_snapshot = this.buildReceiptSnapshot(current, current.data);
      await paymentRepository.save(current);
      await manager.getRepository(Reserva).update({ id: reservation.id, status: StatusReserva.PENDENTE }, { status: StatusReserva.AGUARDANDO_CONFIRMACAO });
      processed = true;
      return current;
    });
    try { await this.redis.del(`locamais:reserva:${reservation.id}`); } catch { /* MySQL remains authoritative. */ }
    if (processed) await this.notificacoes.create({
      usuario_id: actor.id, reserva_id: reservation.id, tipo: 'pagamento_aprovado',
      titulo: 'Pagamento simulado aprovado',
      descricao: `O pagamento da reserva ${reservation.codigo} foi aprovado. A equipe pode confirmar a reserva.`,
    });
    return payment;
  }

  /**
   * Consulta todos os pagamentos registrados no sistema.
   *
   * @returns Lista de todos os pagamentos.
   */
  async findAll(filters: FilterPagamentoDto = {}): Promise<Pagamento[]> {
    const query = this.pagamentosRepository.createQueryBuilder('payment')
      .leftJoinAndSelect('payment.locacao', 'locacao')
      .leftJoinAndSelect('locacao.reservation', 'rentalReservation')
      .leftJoinAndSelect('rentalReservation.client', 'rentalClient')
      .leftJoinAndSelect('rentalClient.user', 'rentalUser')
      .leftJoinAndSelect('rentalReservation.car', 'rentalCar')
      .leftJoinAndSelect('payment.reservation', 'reservation')
      .leftJoinAndSelect('reservation.client', 'directClient')
      .leftJoinAndSelect('directClient.user', 'directUser')
      .leftJoinAndSelect('reservation.car', 'directCar')
      .leftJoinAndSelect('reservation.lojaRetirada', 'shop')
      .leftJoinAndSelect('payment.estorno', 'refund');
    return this.applyFilters(query, filters).orderBy('payment.data', 'DESC').getMany();
  }

  async findMine(actor: UsuarioAutenticado, filters: FilterPagamentoDto = {}): Promise<Pagamento[]> {
    const query = this.pagamentosRepository.createQueryBuilder('payment')
      .leftJoinAndSelect('payment.locacao', 'locacao')
      .leftJoinAndSelect('locacao.reservation', 'reservation')
      .leftJoinAndSelect('payment.reservation', 'directReservation')
      .leftJoinAndSelect('payment.estorno', 'refund')
      .leftJoinAndSelect('directReservation.client', 'directClient')
      .leftJoinAndSelect('directClient.user', 'directUser')
      .leftJoinAndSelect('directReservation.car', 'directCar')
      .leftJoinAndSelect('reservation.client', 'client')
      .leftJoinAndSelect('reservation.car', 'car')
      .where('(client.user_id = :userId OR directClient.user_id = :userId)', { userId: actor.id });
    return this.applyFilters(query, filters).orderBy('payment.data', 'DESC').getMany();
  }

  private applyFilters(query: SelectQueryBuilder<Pagamento>, filters: FilterPagamentoDto): SelectQueryBuilder<Pagamento> {
    if (filters.de && filters.ate && filters.de > filters.ate) {
      throw new BadRequestException('A data inicial não pode ser posterior à data final.');
    }
    if (filters.status) query.andWhere('payment.status = :status', { status: filters.status });
    if (filters.de) query.andWhere('payment.data >= :dateFrom', { dateFrom: `${filters.de} 00:00:00` });
    if (filters.ate) {
      const exclusiveEnd = new Date(`${filters.ate}T00:00:00.000Z`);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      query.andWhere('payment.data < :dateTo', { dateTo: exclusiveEnd.toISOString().slice(0, 19).replace('T', ' ') });
    }
    return query;
  }

  /**
   * Consulta um pagamento pelo seu identificador.
   *
   * @param id UUID do pagamento.
   * @returns O pagamento encontrado.
   * @throws NotFoundException quando o pagamento não existe.
   */
  async findOne(id: string): Promise<Pagamento> {
    const pagamento = await this.pagamentosRepository.findOne({
      where: { id },
      relations: { locacao: { reservation: { client: { user: true }, car: true } }, reservation: { client: { user: true }, car: true, lojaRetirada: true, locacao: true }, gateway: true, estorno: true },
    });

    if (!pagamento) {
      throw new NotFoundException(`pagamento com ID ${id} nao encontrado`);
    }

    return pagamento;
  }

  /**
   * Consulta os pagamentos de uma locação específica.
   *
   * Os pagamentos são ordenados por data (mais recente primeiro).
   *
   * @param locacaoId UUID da locação.
   * @returns Lista de pagamentos da locação.
   */
  async findByLocacao(locacaoId: string): Promise<Pagamento[]> {
    // Verifica se a locação existe.
    await this.locacaoService.findOnePublic(locacaoId);

    return this.pagamentosRepository.find({
      where: { locacao_id: locacaoId },
      order: { data: 'DESC' },
      relations: { gateway: true },
    });
  }

  /**
   * Atualiza informações permitidas de um pagamento.
   *
   * Apenas o `valor` pode ser atualizado, e somente quando o pagamento ainda
   * está `PENDENTE`. `status`, `data`, `locacaoId` e `metodo` são imutáveis
   * após o registro.
   *
   * @param id UUID do pagamento.
   * @param dto Campos a serem atualizados.
   * @returns O pagamento atualizado.
   */
  async update(id: string, dto: UpdatePagamentoDto): Promise<Pagamento> {
    const pagamento = await this.findOne(id);

    if (pagamento.status !== StatusPagamento.PENDENTE) {
      throw new ConflictException(
        `nao e possivel alterar um pagamento com status "${pagamento.status}". Apenas pagamentos pendentes podem ser atualizados.`,
      );
    }

    const changes: Partial<Pagamento> = {};

    if (dto.valor !== undefined) {
      if (!pagamento.locacao_id) throw new ConflictException('pagamentos de reserva não podem ser editados pela rota de locação');
      // Valida que o novo valor não excede o saldo restante da locação
      // (considerando os pagamentos já aprovados, excluindo este pagamento).
      const saldoRestante = await this.calcularSaldoRestante(
        pagamento.locacao_id,
        pagamento.id,
      );

      if (dto.valor > saldoRestante) {
        throw new ConflictException(
          `novo valor (${dto.valor}) excede o saldo restante da locacao (${saldoRestante})`,
        );
      }

      changes.valor = dto.valor;
    }

    if (Object.keys(changes).length > 0) {
      await this.pagamentosRepository.update({ id }, { valor: changes.valor });
    }

    return this.findOne(id);
  }

  /**
   * Confirma e processa um pagamento simulado.
   *
   * Regras de negócio:
   * 1. O pagamento deve existir e estar `PENDENTE`.
   * 2. Chama o `GatewayPagamentoService` para processar a transação simulada.
   * 3. Atualiza o status para `APROVADO` ou `RECUSADO` conforme o resultado.
   * 4. Não permite confirmação duplicada: um pagamento já aprovado retorna o
   *    registro existente sem gerar outro recibo ou duplicar o valor pago.
   *
   * @param id UUID do pagamento.
   * @param dto Dados opcionais de confirmação (valor, se diferente do registrado).
   * @returns O pagamento confirmado.
   */
  async confirmar(
    id: string,
    dto?: ConfirmacaoPagamentoDto,
  ): Promise<Pagamento> {
    const pagamento = await this.findOne(id);

    // Não permite confirmação duplicada de pagamento já aprovado.
    if (pagamento.status === StatusPagamento.APROVADO) {
      return pagamento;
    }

    // Não permite confirmar pagamento já recusado ou cancelado.
    if (
      pagamento.status === StatusPagamento.RECUSADO ||
      pagamento.status === StatusPagamento.CANCELADO
    ) {
      throw new ConflictException(
        `nao e possivel confirmar um pagamento com status "${pagamento.status}"`,
      );
    }

    // Usa o valor informado na confirmação, se fornecido; caso contrário, usa o valor registrado.
    if (!pagamento.locacao_id) throw new ConflictException('use o fluxo de pagamento da reserva');
    const valorConfirmacao = dto?.valor ?? pagamento.valor;

    // Valida que o valor de confirmação não excede o saldo restante da locação.
    const saldoRestante = await this.calcularSaldoRestante(
      pagamento.locacao_id,
      pagamento.id,
    );

    if (valorConfirmacao > saldoRestante) {
      throw new ConflictException(
        `valor de confirmacao (${valorConfirmacao}) excede o saldo restante da locacao (${saldoRestante})`,
      );
    }

    // Chama o gateway simulado para processar a transação.
    const resultado = this.gatewayService.processarTransacao(
      valorConfirmacao,
      pagamento.metodo,
    );

    // Atualiza o pagamento conforme o resultado do gateway.
    pagamento.status = resultado.aprovado
      ? StatusPagamento.APROVADO
      : StatusPagamento.RECUSADO;
    pagamento.valor = valorConfirmacao;
    if (resultado.aprovado && !pagamento.comprovante_snapshot) {
      pagamento.comprovante_snapshot = this.buildReceiptSnapshot(pagamento, new Date());
    }

    return this.pagamentosRepository.save(pagamento);
  }

  /**
   * Exclui um pagamento.
   *
   * A exclusão é permitida apenas quando o pagamento está `PENDENTE`.
   * Pagamentos aprovados, recusados ou cancelados fazem parte do histórico
   * financeiro e não devem ser excluídos.
   *
   * @param id UUID do pagamento.
   */
  async remove(id: string): Promise<void> {
    const pagamento = await this.findOne(id);

    if (pagamento.status !== StatusPagamento.PENDENTE) {
      throw new ConflictException(
        `nao e possivel excluir um pagamento com status "${pagamento.status}". Apenas pagamentos pendentes podem ser excluídos.`,
      );
    }

    await this.pagamentosRepository.remove(pagamento);
  }

  /**
   * Consulta o saldo restante de uma locação.
   *
   * O saldo restante é o valor total da locação menos a soma dos pagamentos
   * já aprovados. Pagamentos pendentes, recusados ou cancelados não são
   * considerados como valores quitados.
   *
   * @param locacaoId UUID da locação.
   * @returns Objeto com o valor total, valor pago (aprovado) e saldo restante.
   */
  async consultarSaldoRestante(locacaoId: string): Promise<{
    locacaoId: string;
    valorTotal: number;
    valorPago: number;
    saldoRestante: number;
  }> {
    // Verifica se a locação existe.
    await this.locacaoService.findOnePublic(locacaoId);

    const valorTotal = await this.obterValorTotalLocacao(locacaoId);
    const valorPago = await this.obterValorPagoLocacao(locacaoId);
    const saldoRestante = valorTotal - valorPago;

    return {
      locacaoId,
      valorTotal: Number(valorTotal),
      valorPago: Number(valorPago),
      saldoRestante: Number(saldoRestante),
    };
  }

  /**
   * Consulta o histórico de pagamentos de uma locação.
   *
   * @param locacaoId UUID da locação.
   * @returns Lista de pagamentos da locação ordenados por data.
   */
  async consultarHistoricoPagamentos(locacaoId: string): Promise<Pagamento[]> {
    return this.findByLocacao(locacaoId);
  }

  /**
   * Gera o recibo (comprovante) de um pagamento aprovado.
   *
   * O recibo só pode ser gerado para pagamentos com status `APROVADO`.
   * Utiliza os dados reais do pagamento registrado no banco, sem aceitar
   * valores enviados livremente pelo frontend.
   *
   * @param id UUID do pagamento.
   * @returns Objeto com os dados do recibo.
   * @throws NotFoundException quando o pagamento não existe.
   * @throws ConflictException quando o pagamento não está aprovado.
   */
  async gerarComprovante(id: string): Promise<{
    empresa: string;
    reciboId: string;
    pagamentoId: string;
    locacaoId: string;
    codigoReserva?: string;
    cliente?: string;
    veiculo?: string;
    valorPago: number;
    metodoPagamento: string;
    dataConfirmacao: Date;
    status: StatusPagamento;
    aviso: string;
  }> {
    const pagamento = await this.findOne(id);

    if (pagamento.status !== StatusPagamento.APROVADO && !(pagamento.status === StatusPagamento.ESTORNADO && pagamento.comprovante_snapshot)) {
      throw new ConflictException(
        `o comprovante so pode ser gerado para pagamentos aprovados. Status atual: "${pagamento.status}"`,
      );
    }

    if (!pagamento.comprovante_snapshot) {
      pagamento.comprovante_snapshot = this.buildReceiptSnapshot(pagamento, pagamento.updated_at ?? pagamento.data);
      await this.pagamentosRepository.save(pagamento);
    }
    const snapshot = pagamento.comprovante_snapshot as {
      empresa: string; reciboId: string; pagamentoId: string; locacaoId: string; codigoReserva?: string;
      cliente?: string; veiculo?: string; placa?: string; valorPago: number;
      metodoPagamento: string; dataConfirmacao: Date; status: StatusPagamento; aviso: string;
    };
    return {
      ...snapshot,
      locacaoId: snapshot.locacaoId || pagamento.locacao_id || pagamento.locacao?.id || pagamento.reservation?.locacao?.id || '',
      codigoReserva: snapshot.codigoReserva ?? pagamento.reservation?.codigo ?? pagamento.locacao?.reservation?.codigo ?? undefined,
    };
  }

  async gerarComprovanteParaActor(id: string, actor: UsuarioAutenticado) {
    const pagamento = await this.findOne(id);
    const isStaff = actor.type === TipoUsuario.ADMIN || actor.type === TipoUsuario.FUNCIONARIO;
    const ownerUserId = pagamento.reservation?.client?.user_id ?? pagamento.locacao?.reservation?.client?.user_id;
    if (!isStaff && ownerUserId !== actor.id) {
      throw new NotFoundException(`pagamento com ID ${id} nao encontrado`);
    }
    return this.gerarComprovante(id);
  }

  private buildReceiptSnapshot(pagamento: Pagamento, confirmedAt: Date): Record<string, unknown> {
    const locacao = pagamento.locacao;
    const reservation = pagamento.reservation ?? locacao?.reservation;
    const cliente = reservation?.client
      ? reservation.client.user?.name ??
          reservation.client.user?.email ??
          undefined
      : undefined;

    const car = reservation?.car;

    return {
      empresa: 'LocaMais',
      reciboId: pagamento.id,
      pagamentoId: pagamento.id,
      locacaoId: pagamento.locacao_id ?? '',
      codigoReserva: reservation?.codigo ?? undefined,
      cliente,
      veiculo: car ? `${car.marca} ${car.modelo}` : undefined,
      placa: car?.placa,
      dataRetirada: reservation?.dataRetirada,
      dataDevolucao: reservation?.dataDevolucao,
      lojaRetirada: reservation?.lojaRetiradaSnapshot?.nome ?? reservation?.lojaRetirada?.nome,
      valorPago: Number(pagamento.valor),
      metodoPagamento: pagamento.metodo,
      dataConfirmacao: confirmedAt,
      status: pagamento.status,
      aviso:
        'Pagamento simulado para fins demonstrativos. Nao representa uma transacao financeira real.',
    };
  }

  /**
   * Calcula o saldo restante de uma locação, opcionalmente excluindo um
   * pagamento específico (útil durante atualizações).
   *
   * @param locacaoId UUID da locação.
   * @param pagamentoIdExcluido UUID do pagamento a ser excluído do cálculo (opcional).
   * @returns Saldo restante da locação.
   */
  private async calcularSaldoRestante(
    locacaoId: string,
    pagamentoIdExcluido?: string,
  ): Promise<number> {
    const valorTotal = await this.obterValorTotalLocacao(locacaoId);
    const valorPago = await this.obterValorPagoLocacao(
      locacaoId,
      pagamentoIdExcluido,
    );

    return valorTotal - valorPago;
  }

  /**
   * Obtém o valor total da locação.
   *
   * @param locacaoId UUID da locação.
   * @returns Valor total da locação.
   */
  private async obterValorTotalLocacao(locacaoId: string): Promise<number> {
    const locacao = await this.locacaoService.findOnePublic(locacaoId);
    return Number(locacao.valorTotal);
  }

  /**
   * Obtém a soma dos pagamentos aprovados de uma locação.
   *
 * @param locacaoId UUID da locação.
   * @param pagamentoIdExcluido UUID do pagamento a ser excluído do cálculo (opcional).
   * @returns Soma dos valores pagos (aprovados).
   */
  private async obterValorPagoLocacao(
    locacaoId: string,
    pagamentoIdExcluido?: string,
  ): Promise<number> {
    const pagamentos = await this.pagamentosRepository.find({
      where: {
        locacao_id: locacaoId,
        status: StatusPagamento.APROVADO,
      },
    });

    const valorPago = pagamentos
      .filter((p) => p.id !== pagamentoIdExcluido)
      .reduce((soma, p) => soma + Number(p.valor), 0);

    return valorPago;
  }
}
