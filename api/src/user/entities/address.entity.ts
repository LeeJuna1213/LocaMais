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
import { Client } from './client.entity.js';

/**
 * Endereco do cliente.
 * Ligado ao `clients` (e nao ao `users`) para garantir que apenas clientes
 * possuam endereco — funcionarios e admins nao tem atributos adicionais.
 */
@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: false })
  client_id: number;

  @OneToOne(() => Client, (client) => client.address, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ type: 'varchar', length: 200, nullable: false })
  logradouro: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  numero: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  complemento: string | null;

  @Column({ type: 'varchar', length: 100, nullable: false })
  bairro: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  cidade: string;

  /** Sigla da unidade federativa. `varchar` e nao `char` porque o driver
   * SQLite do TypeORM nao aceita `char`. */
  @Column({ type: 'varchar', length: 2, nullable: false })
  uf: string;

  @Column({ type: 'varchar', length: 8, nullable: false })
  cep: string;

  @Column({ type: 'varchar', length: 50, default: 'Brasil' })
  pais: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}