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
// Como o módulo `cliente` é o dono do cadastro de cliente, ele consome o enum
// a partir do módulo `usuario` (que o mantém em `usuario/enums`).
import { TipoPessoa } from '../../usuario/enums/usuario.enum.js';

// Endereco, Usuario e Reserva são importados apenas como tipos.
// As relações usam o nome da entidade ('Endereco', 'Usuario', 'Reserva')
// para evitar ciclos de importação em runtime (ESM). O TypeORM resolve essas
// entidades pelo nome no DataSource; o schema e as FKs não mudam.
import type { Endereco } from '../../endereco/entities/endereco.entity.js';
import type { Usuario } from '../../usuario/entities/usuario.entity.js';
import type { Reserva } from '../../reserva/entities/reserva.entity.js';

/**
 * Dados específicos de cliente (Pessoa Física ou Jurídica).
 *
 * Funcionários e administradores NÃO têm linha nesta tabela: eles existem
 * apenas em `users`. É por isso que o endereço também pertence ao cliente,
 * e não ao usuário genérico.
 *
 * Relacionamentos:
 * - Usuario 1:1 Cliente  (a coluna `user_id` é a chave estrangeira)
 * - Cliente 1:1 Endereco (o lado proprietário é `Endereco.client_id`)
 *
 * O `onDelete: 'CASCADE'` em `user_id` garante que, se um usuário for
 * removido fisicamente, o registro de cliente também seja removido pelo
 * banco. A aplicação, porém, faz desativação lógica de usuários.
 */
@Entity('clientes')
// Impede que um cliente misture os atributos de PF e de PJ.
// O banco aceita cpf OU cnpj (ou nenhum dos dois), nunca os dois juntos.
@Check('chk_clientes_tipo_pessoa', 'cpf IS NULL OR cnpj IS NULL')
export class Cliente {
  @PrimaryGeneratedColumn()
  id: number;

  // Chave estrangeira para `users.id`. O índice unique garante o 1:1:
  // um usuário não pode ter dois registros de cliente.
  @Index({ unique: true })
  @Column({ nullable: false })
  user_id: number;

  // Lado inverso do relacionamento Usuario -> Cliente.
  // `@JoinColumn` marca ESTE lado como dono da chave estrangeira.
  @OneToOne('Usuario', 'client', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Usuario;

  /** 'PF' (Pessoa Física) ou 'PJ' (Pessoa Jurídica). */
  @Column({ type: 'simple-enum', enum: TipoPessoa, nullable: false })
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

  // Lado inverso do relacionamento Cliente -> Endereco.
  // O lado proprietário (com client_id) está na entidade Endereco.
  @OneToOne('Endereco', 'client')
  address: Endereco | null;

  // Um cliente pode ter várias reservas ao longo do tempo. A chave
  // estrangeira fica em `reservations.client_id` (lado proprietário), então
  // esta coleção é apenas de navegação e não é carregada automaticamente.
  @OneToMany('Reserva', 'client')
  reservations: Reserva[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
