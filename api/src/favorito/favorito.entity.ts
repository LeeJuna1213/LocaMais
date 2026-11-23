import { Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import type { Cliente } from '../cliente/entities/cliente.entity.js';
import type { Carro } from '../carro/entities/carro.entity.js';

@Entity('favoritos')
@Index('uq_favoritos_cliente_carro', ['client_id', 'car_id'], { unique: true })
export class Favorito {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  client_id: number;

  @ManyToOne('Cliente', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Cliente;

  @Column({ type: 'int' })
  car_id: number;

  @ManyToOne('Carro', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'car_id' })
  car: Carro;

  @CreateDateColumn()
  created_at: Date;
}
