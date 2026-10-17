import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserType } from '../enums/user.enum.js';
import { Client } from './client.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150, nullable: false })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 180, nullable: false })
  email: string;

  /**
   * Hash bcrypt. `select: false` impede que o hash vaze em qualquer
   * `find()`/`findAll()` — precisa ser buscado explicitamente no login.
   */
  @Column({ type: 'varchar', length: 60, nullable: false, select: false })
  password: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({
    type: 'simple-enum',
    enum: UserType,
    length: 20,
    default: UserType.CLIENTE,
  })
  type: UserType;

  /** Presente apenas quando `type` = CLIENTE. */
  @OneToOne(() => Client, (client) => client.user)
  client: Client | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  /**
   * Rede de seguranca contra vazamento do hash: `select: false` impede o
   * hash de ser *carregado* do banco, mas nao de estar no objeto que o
   * `save()` devolve. Como `JSON.stringify` chama `toJSON`, nenhuma resposta
   * pode conter a senha mesmo que o controller devolva a entidade crua.
   */
  toJSON(): Omit<User, 'password' | 'toJSON'> {
    const { password: _password, toJSON: _toJSON, ...rest } = this;
    return rest;
  }
}