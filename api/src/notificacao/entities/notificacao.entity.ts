import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Usuario } from '../../usuario/entities/usuario.entity.js';
import type { Reserva } from '../../reserva/entities/reserva.entity.js';

@Entity('notificacoes')
@Index('idx_notificacoes_usuario_criada', ['usuario_id', 'created_at'])
export class Notificacao {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int' }) usuario_id: number;
  @ManyToOne('Usuario', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' }) usuario: Usuario;
  @Column({ type: 'uuid', nullable: true }) reserva_id: string | null;
  @ManyToOne('Reserva', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reserva_id' }) reserva: Reserva | null;
  @Column({ type: 'varchar', length: 100 }) tipo: string;
  @Column({ type: 'varchar', length: 180 }) titulo: string;
  @Column({ type: 'text' }) descricao: string;
  @CreateDateColumn() created_at: Date;
  @Column({ type: 'datetime', nullable: true }) lida_em: Date | null;
}
