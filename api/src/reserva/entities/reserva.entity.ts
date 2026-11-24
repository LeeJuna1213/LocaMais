import {
  Check,
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

import type { Carro } from '../../carro/entities/carro.entity.js';
import type { Cliente } from '../../cliente/entities/cliente.entity.js';
import type { Loja } from '../../loja/entities/loja.entity.js';
import type { Locacao } from '../../locacao/entities/locacao.entity.js';
import { StatusReserva } from '../enums/status-reserva.enum.js';

/**
 * Reserva de um veículo por um cliente (tabela `reservations`).
 *
 * Relacionamentos:
 * - Muitas reservas pertencem a um único cliente (`client_id`).
 * - Muitas reservas podem existir para o mesmo carro ao longo do tempo
 *   (`car_id`), mas os períodos ativos não podem se sobrepor.
 *
 * O lado proprietário das duas relações está nesta entidade: é aqui que
 * ficam as chaves estrangeiras `client_id` e `car_id`. As coleções inversas
 * (`Cliente.reservations` e `Carro.reservations`) servem apenas para navegação
 * e não são carregadas automaticamente.
 *
 * Decisões de modelagem:
  * - `id` é a chave técnica UUID; `codigo` é o identificador público exibível.
 * - `dataRetirada`/`dataDevolucao` usam `datetime` para preservar horário.
 * - `valorTotal` usa `decimal(10,2)` para não acumular erro de ponto
 *   flutuante em valores monetários.
 * - `onDelete: 'RESTRICT'` impede que um cliente/carro com reservas seja
 *   apagado fisicamente, preservando o histórico.
 * - O status inicial é `PENDENTE`; o Service é quem valida as transições.
 */
@Entity('reservas')
@Index('idx_reservations_car_period', [
  'car_id',
  'dataRetirada',
  'dataDevolucao',
])
@Check('chk_reservations_periodo', 'dataDevolucao > dataRetirada')
@Check('chk_reservations_valor_total', 'valorTotal >= 0')
export class Reserva {
  /** Identificador interno e chave primária referenciada pelos relacionamentos. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Código curto de exibição; o UUID segue como chave técnica. */
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  codigo: string | null;

  /** Allocation token populated by the database; never exposed as the public code. */
  @Column({ type: 'int', unsigned: true, nullable: true, unique: true, insert: false, update: false })
  codigo_sequencial: number | null;

  /** Data e hora previstas para a retirada do veículo. */
  @Column({ type: 'datetime', nullable: false })
  dataRetirada: Date;

  /** Data e hora previstas para a devolução do veículo. */
  @Column({ type: 'datetime', nullable: false })
  dataDevolucao: Date;

  /** Estado atual da reserva no seu ciclo de vida. */
  @Column({
    type: 'simple-enum',
    enum: StatusReserva,
    nullable: false,
    default: StatusReserva.PENDENTE,
  })
  status: StatusReserva;

  /**
   * Valor calculado pelo Service no momento da criação/atualização.
   *
   * O cliente da API nunca envia esse campo: ele é derivado da quantidade de
   * diárias e do `valorDiaria` cadastrado no veículo.
   */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    default: 0,
  })
  valorTotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  valorSubtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  taxaServico: number;

  /** Chave estrangeira para `clients.id`. */
  @Index()
  @Column({ type: 'int', nullable: false })
  client_id: number;

  /** Lado proprietário da relação N:1 com o cliente. */
  @ManyToOne('Cliente', 'reservations', {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'client_id' })
  client: Cliente;

  /** Chave estrangeira para `cars.id`. */
  @Column({ type: 'int', nullable: false })
  car_id: number;

  /** Lado proprietário da relação N:1 com o carro. */
  @ManyToOne('Carro', 'reservations', {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'car_id' })
  car: Carro;

  @Index('idx_reservas_pickup_shop')
  @Column({ type: 'int', nullable: true })
  loja_retirada_id: number | null;

  @ManyToOne('Loja', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'loja_retirada_id' })
  lojaRetirada?: Loja | null;

  /** Immutable-at-creation address/name details for historical display. */
  @Column({ type: 'simple-json', nullable: true })
  lojaRetiradaSnapshot: { nome: string; logradouro: string; numero: string; cidade: string; uf: string } | null;

  @OneToOne('Locacao', 'reservation')
  locacao?: Locacao | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Calcula o valor total da reserva usando o preço real do carro.
   *
   * O método fica na entidade porque é uma regra intrínseca da reserva e
   * depende apenas dos seus dados + do carro associado. O Service é quem
   * carrega o carro do banco e garante que ele exista/esteja disponível.
   *
   * Regra de diárias: qualquer fração de 24 horas conta como uma diária
   * completa (`Math.ceil`). Assim:
   * - 2 horas  -> 1 diária;
   * - 24 horas -> 1 diária;
   * - 25 horas -> 2 diárias.
   *
   * O cálculo é feito em centavos para evitar imprecisão de ponto flutuante.
   * O preço do carro não é aceito do cliente da API.
   */
  calcularValor(): number {
    if (!this.car) {
      throw new Error(
        'carro nao carregado: calcularValor exige a relacao car preenchida',
      );
    }

    const valorDiaria = Number(this.car.valorDiaria);
    if (!Number.isFinite(valorDiaria) || valorDiaria <= 0) {
      throw new Error('valor da diaria do veiculo invalido');
    }

    const diarias = Reserva.calcularDiarias(
      this.dataRetirada,
      this.dataDevolucao,
    );
    const centavosPorDiaria = Math.round(valorDiaria * 100);

    return (diarias * centavosPorDiaria) / 100;
  }

  /**
   * Quantidade de diárias entre duas datas/horas.
   *
   * Usa a diferença absoluta em milissegundos dividida por 24h e arredonda
   * para cima. O Service valida que a devolução é posterior à retirada antes
   * de chamar este método.
   */
  static calcularDiarias(dataRetirada: Date, dataDevolucao: Date): number {
    const milissegundosPorDia = 24 * 60 * 60 * 1000;
    const diferenca = dataDevolucao.getTime() - dataRetirada.getTime();

    return Math.max(1, Math.ceil(diferenca / milissegundosPorDia));
  }

  /** Controla o que é serializado na resposta HTTP. */
  toJSON(): Omit<Reserva, 'toJSON' | 'calcularValor' | 'locacao' | 'codigo_sequencial'> & {
    locacao: Pick<Locacao, 'id' | 'status' | 'dataRetirada' | 'dataDevolucao'> | null | undefined;
  } {
    const {
      id,
      codigo,
      codigo_sequencial: _codigoSequencial,
      dataRetirada,
      dataDevolucao,
      status,
      valorTotal,
      valorSubtotal,
      taxaServico,
      client_id,
      client,
      car_id,
      car,
      loja_retirada_id,
      lojaRetiradaSnapshot,
      lojaRetirada,
      locacao,
      created_at,
      updated_at,
    } = this;

    return {
      id,
      codigo,
      dataRetirada,
      dataDevolucao,
      status,
      valorTotal: Number(valorTotal),
      valorSubtotal: Number(valorSubtotal),
      taxaServico: Number(taxaServico),
      client_id,
      client,
      car_id,
      car,
      loja_retirada_id,
      lojaRetiradaSnapshot,
      lojaRetirada,
      locacao: locacao
        ? { id: locacao.id, status: locacao.status, dataRetirada: locacao.dataRetirada, dataDevolucao: locacao.dataDevolucao }
        : null,
      created_at,
      updated_at,
    };
  }
}
