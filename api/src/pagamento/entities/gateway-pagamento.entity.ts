import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { Pagamento } from './pagamento.entity.js';

/**
 * Gateway de pagamento simulado (tabela `gateways_pagamento`).
 *
 * Este componente representa o gateway responsável por simular o
 * processamento e a validação das transações de pagamento. Como o LocaMais
 * utiliza pagamentos simulados para fins acadêmicos e demonstrativos,
 * não há integração com serviços financeiros reais.
 *
 * Relacionamentos:
 * - Um gateway de pagamento está vinculado a exatamente um pagamento (1:1).
 * - O lado proprietário está nesta entidade (`pagamento_id`).
 *
 * Decisões de modelagem:
 * - `id` é UUID para não expor um contador sequencial na API.
 * - `tipo` identifica o tipo do gateway (ex: "simulado").
 * - `credenciais` armazena apenas configurações demonstrativas não sensíveis.
 *   NÃO armazena senhas, tokens bancários ou credenciais financeiras reais.
 * - `onDelete: 'RESTRICT'` impede que um gateway com pagamento associado seja
 *   apagado fisicamente, preservando o histórico.
 */
@Entity('gateways_pagamento')
@Index('idx_gateways_pagamento_pagamento', ['pagamento_id'], { unique: true })
export class GatewayPagamento {
  /** Identificador público do gateway. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tipo do gateway (ex: "simulado"). */
  @Column({ type: 'varchar', length: 50, nullable: false })
  tipo: string;

  /**
   * Credenciais de configuração do gateway.
   *
   * Contém apenas valores demonstrativos não sensíveis. NÃO armazena
   * senhas, tokens bancários ou credenciais financeiras reais.
   */
  @Column({ type: 'varchar', length: 200, nullable: false })
  credenciais: string;

  /** Chave estrangeira para `pagamentos.id` (UUID). Única (relacionamento 1:1). */
  @Column({ type: 'uuid', nullable: false })
  pagamento_id: string;

  /** Lado proprietário da relação 1:1 com o pagamento. */
  @OneToOne('Pagamento', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pagamento_id' })
  pagamento: Pagamento;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
