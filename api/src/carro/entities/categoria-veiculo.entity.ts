import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Carro } from './carro.entity.js';

@Entity('categorias')
@Index('uq_categorias_nome_normalizado', ['nome_normalizado'], { unique: true })
export class CategoriaVeiculo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, nullable: false })
  nome: string;

  @Column({ type: 'varchar', length: 100, nullable: false })
  nome_normalizado: string;

  @OneToMany('Carro', 'categoriaEntity')
  carros?: Carro[];
}
