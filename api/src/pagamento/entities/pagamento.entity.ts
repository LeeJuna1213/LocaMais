import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { Locacao } from '../../locacao/entities/locacao.entity.js';
import type { GatewayPagamento } from './gateway-pagamento.entity.js';
import { MetodoPagamento } from '../enums/metodo-pagamento.enum.js';
import { StatusPagamento } from '../enums/status-pagamento.enum.js';

/**
 * Pagamento de uma locação (tabela `pagamentos`).
 *
 * Um pagamento registra o valor, a forma de pagamento e o status de uma
 * transação simulada vinculada a uma locação. O pagamento inicia com status
 * `PENDENTE` e passa para `APROVADO` somente após a confirmação simulada
 * pelo gateway.
 *
 * Relacionamentos:
 * - Um pagamento pertence a exatamente uma locação (`locacao_id`).
 * - Uma locação pode gerar um ou vários pagamentos (1:N).
 * - Um pagamento está vinculado a exatamente um gateway (1:1).
 * - O lado proprietário está nesta entidade (`locacao_id` e `gateway_id`).
 *
 * Decisões de modelagem:
 * - `id` é UUID para não expor um contador sequencial na API.
 * - `valor` usa `decimal(10,2)` para valores monetários.
 * - `metodo` e `status` usam `simple-enum`.
 * - `data` é preenchida pelo backend no momento do registro.
 * - `onDelete: 'RESTRICT'` impede que uma locação com pagamentos seja apagada
 *   fisicamente, preservando o histórico financeiro.
 */
@Entity('pagamentos')
@Index('idx_pagamentos_locacao', ['locacao_id'])
export class Pagamento {
  /** Identificador público do pagamento. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Valor referente ao pagamento. */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    default: 0,
  })
  valor: number;

  /** Forma de pagamento selecionada. */
  @Column({
    type: 'simple-enum',
    enum: MetodoPagamento,
    nullable: false,
  })
  metodo: MetodoPagamento;

  /** Situação atual do pagamento. */
  @Column({
    type: 'simple-enum',
    enum: StatusPagamento,
    nullable: false,
    default: StatusPagamento.PENDENTE,
  })
  status: StatusPagamento;

  /** Data e horário do registro do pagamento (preenchido pelo backend). */
  @Column({ type: 'datetime', nullable: false })
  data: Date;

  /** Chave estrangeira para `locacoes.id` (UUID). */
  @Index()
  @Column({ type: 'uuid', nullable: false })
  locacao_id: string;

  /** Lado proprietário da relação N:1 com a locação. */
  @ManyToOne('Locacao', 'pagamentos', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locacao_id' })
  locacao: Locacao;

  /** Chave estrangeira para `gateways_pagamento.id` (UUID). */
  @Column({ type: 'uuid', nullable: true })
  gateway_id: string | null;

  /** Relação 1:1 com o gateway de pagamento. */
  @OneToOne('GatewayPagamento', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'gateway_id' })
  gateway: GatewayPagamento | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Inicia o processamento simulado do pagamento.
   *
   * Define o status como `PENDENTE` e registra a data. A confirmação e a
   * atualização para `APROVADO` ou `RECUSADO` são feitas pelo
   * `PagamentoService` por meio do `GatewayPagamentoService`.
   */
  processarPagamento(): void {
    this.status = StatusPagamento.PENDENTE;
    this.data = new Date();
  }

  /**
   * Gera o comprovante (recibo) após a aprovação do pagamento.
   *
   * Este método é invocado somente quando o pagamento está `APROVADO`. Ele
   * utiliza os dados reais do pagamento registrado no banco, sem aceitar
   * valores enviados livremente pelo frontend.
   */
  gerarComprovante(): void {
    if (this.status !== StatusPagamento.APROVADO) {
      throw new Error(
        'o comprovante so pode ser gerado para pagamentos aprovados',
      );
    }
  }

  /** Controla o que é serializado na resposta HTTP. */
  toJSON(): Omit<Pagamento, 'toJSON' | 'processarPagamento' | 'gerarComprovante'> {
    const {
      id,
      valor,
      metodo,
      status,
      data,
      locacao_id,
      locacao,
      gateway_id,
      gateway,
      created_at,
      updated_at,
    } = this;

    return {
      id,
      valor,
      metodo,
      status,
      data,
      locacao_id,
      locacao,
      gateway_id,
      gateway,
      created_at,
      updated_at,
    };
  }
}
