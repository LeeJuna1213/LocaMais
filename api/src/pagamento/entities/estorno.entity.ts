import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Pagamento } from './pagamento.entity.js';

@Entity('estornos')
export class Estorno {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', unique: true }) pagamento_id: string;
  @OneToOne('Pagamento', 'estorno', { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pagamento_id' }) pagamento: Pagamento;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) valor: number;
  @Column({ type: 'varchar', length: 40, default: 'simulado' }) tipo: string;
  @CreateDateColumn() data: Date;
}
