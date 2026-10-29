import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Reservation } from '../../reservation/entities/reservation.entity.js';
import { StatusVeiculo } from '../enums/status-veiculo.enum.js';

/**
 * Veículo da locadora (tabela `cars`).
 *
 * Decisões de modelagem:
 * - `placa` é única no banco, além da checagem feita no Service. A constraint
 *   protege contra duas requisições concorrentes que passem pela checagem.
 * - `status` usa `simple-enum`: o banco aceita apenas os valores do enum.
 * - `valorDiaria` usa `decimal(10,2)` para não acumular erro de ponto
 *   flutuante em valores monetários.
 * - `created_at`/`updated_at` são gerenciados pelo TypeORM.
 */
@Entity('cars')
export class Car {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, nullable: false, unique: true })
  placa: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  modelo: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  marca: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  categoria: string;

  @Column({ type: 'int', nullable: false })
  ano: number;

  @Column({
    type: 'simple-enum',
    enum: StatusVeiculo,
    length: 30,
    nullable: false,
    default: StatusVeiculo.DISPONIVEL,
  })
  status: StatusVeiculo;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    default: 0,
  })
  valorDiaria: number;

  // Um carro pode aparecer em várias reservas ao longo do tempo. A chave
  // estrangeira fica em `reservations.car_id` (lado proprietário); esta
  // coleção é apenas de navegação e não é carregada automaticamente.
  @OneToMany(() => Reservation, (reservation) => reservation.car)
  reservations: Reservation[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /** Controla o que é serializado na resposta HTTP. */
  toJSON(): Omit<Car, 'toJSON' | 'reservations'> {
    const {
      id,
      placa,
      modelo,
      marca,
      categoria,
      ano,
      status,
      valorDiaria,
      created_at,
      updated_at,
    } = this;

    return {
      id,
      placa,
      modelo,
      marca,
      categoria,
      ano,
      status,
      valorDiaria,
      created_at,
      updated_at,
    };
  }
}
