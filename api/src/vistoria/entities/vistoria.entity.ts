import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { Locacao } from '../../locacao/entities/locacao.entity.js';
import { TipoVistoria } from '../enums/tipo-vistoria.enum.js';

/**
 * Vistoria de um veículo (tabela `vistorias`).
 *
 * Uma vistoria registra as condições do veículo em um momento específico, com
 * foco em preservar evidências (observações e fotos) para fins de retirada e
 * devolução.
 *
 * Relacionamentos:
 * - Uma vistoria pode estar associada a zero ou uma locação (`0..1`).
 * - Uma locação pode possuir zero ou várias vistorias (`0..*`).
 * - O lado proprietário está nesta entidade (`locacao_id`). `Locacao` mantém a
 *   coleção inversa apenas para navegação.
 * - Veículo e cliente são obtidos por meio da locação
 *   (`vistoria.locacao.reservation.car` / `vistoria.locacao.reservation.client`),
 *   portanto a vistoria NÃO duplica chaves estrangeiras para `cars` ou `clients`.
 *
 * Decisões de modelagem:
 * - `id` é UUID para não expor um contador sequencial na API.
 * - `data` é preenchida pelo backend no momento da vistoria
 *   (`registrarVistoria`), nunca informada livremente pelo cliente.
 * - `fotos` armazena um JSON serializado (array de strings com URLs/caminhos).
 *   Imagens não são armazenadas diretamente no banco.
 * - `locacao_id` e` locacao` são nullable para respeitar a multiplicidade
 *   `0..1` do UML; o Service, por regra de negócio, exige uma locação na
 *   criação de vistorias operacionais.
 * - `onDelete: 'RESTRICT'` impede que uma locação com vistorias seja apagada
 *   fisicamente, preservando o histórico.
 */
@Entity('vistorias')
@Index('idx_vistorias_locacao', ['locacao_id'])
export class Vistoria {
  /** Identificador público da vistoria. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tipo da vistoria: retirada ou devolucao. */
  @Column({
    type: 'simple-enum',
    enum: TipoVistoria,
    length: 20,
    nullable: false,
  })
  tipo: TipoVistoria;

  /** Data e horário da vistoria. Preenchidos pelo backend (registrarVistoria). */
  @Column({ type: 'datetime', nullable: false })
  data: Date;

  /** Observacoes sobre as condicoes gerais do veículo. */
  @Column({ type: 'varchar', length: 2000, nullable: true, default: null })
  observacoes: string | null;

  /**
   * Referencias às fotos registradas durante a vistoria.
   *
   * Armazena uma lista serializada em JSON de strings (URLs/caminhos), por
   * exemplo `["url1", "url2"]`. Imagens não são armazenadas no banco de dados.
   */
  @Column({ type: 'text', nullable: false, default: '[]' })
  fotos: string;

  /** Chave estrangeira para `locacoes.id` (UUID). Pode ser nulo (0..1). */
  @Column({ type: 'uuid', nullable: true })
  locacao_id: string | null;

  /** Lado proprietário da relação N:1 com a locação. */
  @ManyToOne('Locacao', 'vistorias', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locacao_id' })
  locacao: Locacao | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Registra a vistoria vinculada à locação.
   *
   * Define a data e horário efetivos da vistoria. A persistência e o
   * vinculo com a locação são feitos pelo Service.
   */
  registrarVistoria(): void {
    this.data = new Date();
  }

  /** Controla o que é serializado na resposta HTTP. */
  toJSON(): Omit<Vistoria, 'toJSON' | 'registrarVistoria'> {
    const {
      id,
      tipo,
      data,
      observacoes,
      fotos,
      locacao_id,
      locacao,
      created_at,
      updated_at,
    } = this;

    return {
      id,
      tipo,
      data,
      observacoes,
      fotos,
      locacao_id,
      locacao,
      created_at,
      updated_at,
    };
  }
}
