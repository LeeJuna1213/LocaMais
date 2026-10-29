import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { Car } from '../../car/entities/car.entity.js';
import type { Client } from '../../client/entities/client.entity.js';
import { StatusReserva } from '../enums/reservation-status.enum.js';

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
 * (`Client.reservations` e `Car.reservations`) servem apenas para navegação
 * e não são carregadas automaticamente.
 *
 * Decisões de modelagem:
 * - `id` é UUID para não expor um contador sequencial na API.
 * - `dataRetirada`/`dataDevolucao` usam `datetime` para preservar horário.
 * - `valorTotal` usa `decimal(10,2)` para não acumular erro de ponto
 *   flutuante em valores monetários.
 * - `onDelete: 'RESTRICT'` impede que um cliente/carro com reservas seja
 *   apagado fisicamente, preservando o histórico.
 * - O status inicial é `PENDENTE`; o Service é quem valida as transições.
 */
@Entity('reservations')
@Index('idx_reservations_car_period', [
  'car_id',
  'dataRetirada',
  'dataDevolucao',
])
@Check('chk_reservations_periodo', 'dataDevolucao > dataRetirada')
@Check('chk_reservations_valor_total', 'valorTotal >= 0')
export class Reservation {
  /** Identificador público da reserva. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
    length: 20,
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

  /** Chave estrangeira para `clients.id`. */
  @Index()
  @Column({ type: 'int', nullable: false })
  client_id: number;

  /** Lado proprietário da relação N:1 com o cliente. */
  @ManyToOne('Client', 'reservations', {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  /** Chave estrangeira para `cars.id`. */
  @Column({ type: 'int', nullable: false })
  car_id: number;

  /** Lado proprietário da relação N:1 com o carro. */
  @ManyToOne('Car', 'reservations', {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'car_id' })
  car: Car;

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

    const diarias = Reservation.calcularDiarias(
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
  toJSON(): Omit<Reservation, 'toJSON' | 'calcularValor'> {
    const {
      id,
      dataRetirada,
      dataDevolucao,
      status,
      valorTotal,
      client_id,
      client,
      car_id,
      car,
      created_at,
      updated_at,
    } = this;

    return {
      id,
      dataRetirada,
      dataDevolucao,
      status,
      valorTotal: Number(valorTotal),
      client_id,
      client,
      car_id,
      car,
      created_at,
      updated_at,
    };
  }
}
