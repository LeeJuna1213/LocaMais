import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// O enum de tipo de pessoa continua sendo um conceito do usuário/cliente.
// Como o módulo `client` é o dono do cadastro de cliente, ele consome o enum
// a partir do módulo `user` (que o mantém em `user/enums`).
import { TipoPessoa } from '../../user/enums/user.enum.js';

// Address e User são importados de seus próprios módulos.
// Repare no caminho: de `client/entities` subimos dois níveis até `src`.
import { Address } from '../../address/entities/address.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { Reservation } from '../../reservation/entities/reservation.entity.js';

/**
 * Dados específicos de cliente (Pessoa Física ou Jurídica).
 *
 * Funcionários e administradores NÃO têm linha nesta tabela: eles existem
 * apenas em `users`. É por isso que o endereço também pertence ao cliente,
 * e não ao usuário genérico.
 *
 * Relacionamentos:
 * - User 1:1 Client  (a coluna `user_id` é a chave estrangeira)
 * - Client 1:1 Address (o lado proprietário é `Address.client_id`)
 *
 * O `onDelete: 'CASCADE'` em `user_id` garante que, se um usuário for
 * removido fisicamente, o registro de cliente também seja removido pelo
 * banco. A aplicação, porém, faz desativação lógica de usuários.
 */
@Entity('clients')
// Impede que um cliente misture os atributos de PF e de PJ.
// O banco aceita cpf OU cnpj (ou nenhum dos dois), nunca os dois juntos.
@Check('chk_clientes_tipo_pessoa', 'cpf IS NULL OR cnpj IS NULL')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  // Chave estrangeira para `users.id`. O índice unique garante o 1:1:
  // um usuário não pode ter dois registros de cliente.
  @Index({ unique: true })
  @Column({ nullable: false })
  user_id: number;

  // Lado inverso do relacionamento User -> Client.
  // `@JoinColumn` marca ESTE lado como dono da chave estrangeira.
  @OneToOne(() => User, (user) => user.client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 'PF' (Pessoa Física) ou 'PJ' (Pessoa Jurídica). */
  @Column({ type: 'simple-enum', enum: TipoPessoa, length: 2, nullable: false })
  tipo_pessoa: TipoPessoa;

  /** Obrigatório quando `tipo_pessoa` = PF. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 11, nullable: true })
  cpf: string | null;

  /** Obrigatório quando `tipo_pessoa` = PJ. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 14, nullable: true })
  cnpj: string | null;

  /** Obrigatório quando `tipo_pessoa` = PF. */
  @Column({ type: 'date', nullable: true })
  data_nascimento: string | null;

  /** Obrigatório quando `tipo_pessoa` = PJ. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  razao_social: string | null;

  // Lado inverso do relacionamento Client -> Address.
  // O lado proprietário (com client_id) está na entidade Address.
  @OneToOne(() => Address, (address) => address.client)
  address: Address | null;

  // Um cliente pode ter várias reservas ao longo do tempo. A chave
  // estrangeira fica em `reservations.client_id` (lado proprietário), então
  // esta coleção é apenas de navegação e não é carregada automaticamente.
  @OneToMany(() => Reservation, (reservation) => reservation.client)
  reservations: Reservation[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
