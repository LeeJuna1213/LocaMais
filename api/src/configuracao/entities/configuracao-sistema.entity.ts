import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('configuracoes_sistema')
export class ConfiguracaoSistema {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  chave: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor: number;

  @UpdateDateColumn()
  updated_at: Date;
}
