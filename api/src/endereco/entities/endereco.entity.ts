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
// A entidade Cliente pertence ao módulo `cliente`. De `endereco/entities`
// subimos dois níveis até `src` e descemos em `cliente/entities`.
//
// `import type` + alvo por nome ('Cliente') evitam o ciclo de runtime
// Endereco -> Cliente -> Endereco. O TypeORM resolve a entidade pelo nome
// registrado no DataSource, e o relacionamento continua exatamente o mesmo.
import type { Cliente } from '../../cliente/entities/cliente.entity.js';

/**
 * Endereco do cliente.
 * Ligado ao `clients` (e nao ao `users`) para garantir que apenas clientes
 * possuam endereco — funcionarios e admins nao tem atributos adicionais.
 */
@Entity('addresses')
export class Endereco {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: false })
  client_id: number;

  @OneToOne('Cliente', 'address', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Cliente;

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