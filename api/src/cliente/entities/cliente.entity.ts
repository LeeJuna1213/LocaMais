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

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefone: string | null;

  @Column({ type: 'varchar', length: 11, nullable: true })
  cnh_numero: string | null;

  @Column({ type: 'date', nullable: true })
  cnh_validade: string | null;

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

  /** Logical deletion marker; retains the client and all linked history. */
  @Column({ type: 'datetime', nullable: true })
  deleted_at: Date | null;

  /**
   * Controla a serialização JSON para evitar ciclo de referência com Endereco
   * (Cliente.address -> Endereco.client -> Cliente.address -> ...) e para não
   * expor dados sensíveis do usuario vinculado (senha removida via
   * Usuario.toJSON()).
   */
  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      tipo_pessoa: this.tipo_pessoa,
      cpf: this.cpf,
      cnpj: this.cnpj,
      data_nascimento: this.data_nascimento,
      razao_social: this.razao_social,
      telefone: this.telefone,
      cnh_numero: this.cnh_numero,
      cnh_validade: this.cnh_validade,
      created_at: this.created_at,
      updated_at: this.updated_at,
      deleted_at: this.deleted_at,
      user: this.user ? this.user.toJSON() : null,
      address: this.address
        ? {
            id: this.address.id,
            logradouro: this.address.logradouro,
            numero: this.address.numero,
            complemento: this.address.complemento,
            bairro: this.address.bairro,
            cidade: this.address.cidade,
            uf: this.address.uf,
            cep: this.address.cep,
            pais: this.address.pais,
            created_at: this.address.created_at,
            updated_at: this.address.updated_at,
          }
        : null,
    };
  }
}
