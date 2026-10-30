import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { Reservation } from '../../reservation/entities/reservation.entity.js';
import { StatusLocacao } from '../enums/status-locacao.enum.js';

/**
 * Locacao de um veículo (tabela `locacoes`).
 *
 * Uma locação é a materialização efetiva de uma reserva: enquanto a reserva
 * guarda o período *previsto*, a locação registra as datas *efetivas* de
 * retirada e devolução, além do valor total pago (base da reserva + adicionais).
 *
 * Relacionamentos:
 * - Uma locação pertence a exatamente uma reserva (`reservation_id`).
 * - Uma reserva pode originar no máximo uma locação (cardinalidade 1:1),
 *   garantida pelo índice único em `reservation_id`.
 * - O veículo e o cliente são obtidos por meio da reserva
 *   (`locacao.reservation.car` e `locacao.reservation.client`), portanto a
 *   locação NÃO duplica chaves estrangeiras para `cars` ou `clients`.
 *
 * Decisões de modelagem:
 * - `id` é UUID para não expor um contador sequencial na API.
 * - `dataRetirada`/`dataDevolucao` são nullable: na criação ainda não ocorreram;
 *   são preenchidas nos registros efetivos de retirada e devolução.
 * - `valorTotal` usa `decimal(10,2)` para não acumular erro de ponto flutuante
 *   em valores monetários. O cliente da API nunca envia esse campo: ele é
 *   derivado pelo Service (base da reserva + adicionais de atraso).
 * - `onDelete: 'RESTRICT'` impede que uma reserva com locação seja apagada
 *   fisicamente, preservando o histórico.
 */
@Entity('locacoes')
@Index('idx_locacoes_reservation_unique', ['reservation_id'], { unique: true })
@Check('chk_locacoes_valor_total', 'valorTotal >= 0')
export class Locacao {
  /** Identificador público da locação. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Data e hora efetivas da retirada do veículo (preenchidas no registro de retirada). */
  @Column({ type: 'datetime', nullable: true })
  dataRetirada: Date | null;

  /** Data e hora efetivas da devolução do veículo (preenchidas no registro de devolução). */
  @Column({ type: 'datetime', nullable: true })
  dataDevolucao: Date | null;

  /**
   * Valor total da locação.
   *
   * Inicialmente igual ao `valorTotal` da reserva (diárias × valorDiaria do
   * veículo). Ao concluir a devolução, acresce os adicionais calculados
   * (`calcularAdicionais`). Nunca é informado livremente pelo cliente da API.
   */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    default: 0,
  })
  valorTotal: number;

  /** Estado atual da locação no seu ciclo de vida. */
  @Column({
    type: 'simple-enum',
    enum: StatusLocacao,
    length: 30,
    nullable: false,
    default: StatusLocacao.AGUARDANDO_RETIRADA,
  })
  status: StatusLocacao;

  /** Chave estrangeira para `reservations.id` (UUID). Única: uma reserva gera no máximo uma locação. */
  @Column({ type: 'uuid', nullable: false })
  reservation_id: string;

  /** Lado proprietário da relação 1:1 com a reserva que originou esta locação. */
  @OneToOne('Reservation', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reservation_id' })
  reservation: Reservation;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Registra a retirada efetiva do veículo na entidade.
   *
   * Apenas altera o estado em memória; a persistência e a atualização do
   * veículo são feitas pelo Service dentro de uma transação.
   */
  registrarRetirada(): void {
    if (this.status !== StatusLocacao.AGUARDANDO_RETIRADA) {
      throw new Error(
        'retirada so e permitida quando a locacao esta aguardando retirada',
      );
    }

    this.dataRetirada = new Date();
    this.status = StatusLocacao.EM_ANDAMENTO;
  }

  /**
   * Registra a devolução efetiva do veículo na entidade.
   *
   * Apenas altera o estado em memória; a persistência e a atualização do
   * veículo/reserva são feitas pelo Service dentro de uma transação.
   */
  registrarDevolucao(): void {
    if (this.status !== StatusLocacao.EM_ANDAMENTO) {
      throw new Error(
        'devolucao so e permitida quando a locacao esta em andamento',
      );
    }

    this.dataDevolucao = new Date();
    this.status = StatusLocacao.CONCLUIDA;
  }

  /**
   * Calcula os valores adicionais da locação (regra de atraso).
   *
   * É um cálculo puro: não persiste nada e não altera `valorTotal`. Assim,
   * executá-lo mais de uma vez não duplica cobrança.
   *
   * Regra adotada (documentada, sem taxa inventada):
   * - Considera o atraso da devolução efetiva (ou o momento atual, se ainda
   *   não devolvida) em relação à data prevista na reserva.
   * - Cada dia (ou fração) de atraso cobra uma diária inteira, usando o
   *   `valorDiaria` real do veículo cadastrado no banco (não um valor enviado
   *   pelo frontend).
   * - Sem atraso ou devolução antecipada: adicional igual a zero.
   *
   * O arredondamento é feito em centavos para evitar imprecisão de ponto
   * flutuante, seguindo o mesmo critério de `Reservation.calcularValor`.
   *
   * @param dataDevolucaoPrevista data/hora prevista de devolução da reserva.
   * @param valorDiaria valor da diária cadastrado no veículo.
   */
  calcularAdicionais(
    dataDevolucaoPrevista: Date,
    valorDiaria: number,
  ): { valorAdicional: number; diasAtraso: number } {
    const dataDevolucaoEfetiva = this.dataDevolucao ?? new Date();

    const atrasoMs =
      dataDevolucaoEfetiva.getTime() - dataDevolucaoPrevista.getTime();
    if (atrasoMs <= 0) {
      return { valorAdicional: 0, diasAtraso: 0 };
    }

    const milissegundosPorDia = 24 * 60 * 60 * 1000;
    // Qualquer fração de 24h conta como um dia completo de atraso.
    const diasAtraso = Math.ceil(atrasoMs / milissegundosPorDia);

    const centavosPorDiaria = Math.round(valorDiaria * 100);
    const valorAdicional = (diasAtraso * centavosPorDiaria) / 100;

    return { valorAdicional, diasAtraso };
  }

  /** Controla o que é serializado na resposta HTTP. */
  toJSON(): Omit<Locacao, 'toJSON' | 'registrarRetirada' | 'registrarDevolucao' | 'calcularAdicionais'> {
    const {
      id,
      dataRetirada,
      dataDevolucao,
      valorTotal,
      status,
      reservation_id,
      reservation,
      created_at,
      updated_at,
    } = this;

    return {
      id,
      dataRetirada,
      dataDevolucao,
      valorTotal: Number(valorTotal),
      status,
      reservation_id,
      reservation,
      created_at,
      updated_at,
    };
  }
}
