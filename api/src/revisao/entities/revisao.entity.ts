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

import type { Carro } from '../../carro/entities/carro.entity.js';

/**
 * Revisão de um veículo (tabela `revisoes`).
 *
 * Uma revisão registra os serviços de manutenção realizados em um veículo,
 * incluindo a quilometragem no momento da revisão e o custo. Essa informação
 * é usada tanto para manter o histórico de manutenção quanto para o controle
 * de revisão periódica.
 *
 * Relacionamentos:
 * - Uma revisão pertence a exatamente um veículo (`carro_id`).
 * - Um veículo pode possuir várias revisões ao longo do tempo (1:N).
 * - O lado proprietário está nesta entidade (`carro_id`). `Carro` mantém a
 *   coleção inversa apenas para navegação.
 *
 * Decisões de modelagem:
 * - `id` é UUID para não expor um contador sequencial na API.
 * - `data` é a data em que a revisão foi realizada.
 * - `km` é a quilometragem do veículo no momento da revisão. Ela é usada para
 *   garantir a consistência entre revisões sucessivas (não permite quilometragem
 *   inferior à última registrada) e para o cálculo da próxima revisão.
 * - `valor` é o custo da revisão, independente do valor da diária do veículo.
 * - `onDelete: 'RESTRICT'` impede que um carro com revisões seja apagado
 *   fisicamente, preservando o histórico de manutenção.
 */
@Entity('revisoes')
@Index('idx_revisoes_carro', ['carro_id'])
export class Revisao {
  /** Identificador público da revisão. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Data em que a revisão foi realizada. */
  @Column({ type: 'datetime', nullable: false })
  data: Date;

  /** Descrição dos serviços realizados ou da manutenção necessária. */
  @Column({ type: 'varchar', length: 1000, nullable: false })
  descricao: string;

  /**
   * Quilometragem do veículo no momento da revisão.
   *
   * É usada para validar a consistência entre revisões sucessivas e para
   * calcular quando a próxima revisão estará devida.
   */
  @Column({ type: 'int', nullable: false })
  km: number;

  /** Custo da revisão. Armazenado em decimal(10,2) para valores monetários. */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    default: 0,
  })
  valor: number;

  /** Chave estrangeira para `cars.id`. */
  @Index()
  @Column({ type: 'int', nullable: false })
  carro_id: number;

  /** Lado proprietário da relação N:1 com o carro. */
  @ManyToOne('Carro', 'revisoes', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'carro_id' })
  carro: Carro;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Registra a revisão vinculada ao veículo.
   *
   * Define a data e horário efetivos da revisão. A persistência e o vínculo
   * com o carro são feitos pelo `RevisaoService`, que também valida se o
   * carro existe e se a quilometragem é válida.
   */
  registrarRevisao(): void {
    this.data = new Date();
  }

  /** Controla o que é serializado na resposta HTTP. */
  toJSON(): Omit<Revisao, 'toJSON' | 'registrarRevisao'> {
    const {
      id,
      data,
      descricao,
      km,
      valor,
      carro_id,
      carro,
      created_at,
      updated_at,
    } = this;

    return {
      id,
      data,
      descricao,
      km,
      valor,
      carro_id,
      carro,
      created_at,
      updated_at,
    };
  }
}
