import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TipoPessoa } from '../enums/user.enum.js';
import { Address } from './address.entity.js';
import { User } from './user.entity.js';

/**
 * Dados especificos de cliente (PF ou PJ).
 * Funcionarios e admins NAO tem linha nesta tabela.
 */
@Entity('clients')
// Impede que um cliente misture os atributos de PF e de PJ.
@Check('chk_clientes_tipo_pessoa', 'cpf IS NULL OR cnpj IS NULL')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: false })
  user_id: number;

  @OneToOne(() => User, (user) => user.client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 'PF' ou 'PJ'. */
  @Column({ type: 'simple-enum', enum: TipoPessoa, length: 2, nullable: false })
  tipo_pessoa: TipoPessoa;

  /** Obrigatorio quando `tipo_pessoa` = PF. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf: string | null;

  /** Obrigatorio quando `tipo_pessoa` = PJ. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 14, nullable: true })
  cnpj: string | null;

  /** Obrigatorio quando `tipo_pessoa` = PF. */
  @Column({ type: 'date', nullable: true })
  data_nascimento: string | null;

  /** Obrigatorio quando `tipo_pessoa` = PJ. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  razao_social: string | null;

  @OneToOne(() => Address, (address) => address.client)
  address: Address | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}