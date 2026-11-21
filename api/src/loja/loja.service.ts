import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateLojaDto } from './dto/create-loja.dto.js';
import { UpdateLojaDto } from './dto/update-loja.dto.js';
import { Loja } from './entities/loja.entity.js';

@Injectable()
export class LojaService {
  constructor(@InjectRepository(Loja) private readonly lojas: Repository<Loja>) {}

  findAll(): Promise<Loja[]> { return this.lojas.find({ order: { nome: 'ASC' } }); }

  async findOne(id: number): Promise<Loja> {
    const loja = await this.lojas.findOne({ where: { id } });
    if (!loja) throw new NotFoundException(`loja ${id} não encontrada`);
    return loja;
  }

  async create(dto: CreateLojaDto): Promise<Loja> {
    const codigo = dto.codigo.trim().toUpperCase();
    if (await this.lojas.exists({ where: { codigo } })) throw new ConflictException('já existe uma loja com este código');
    return this.lojas.save(this.lojas.create({ ...dto, codigo, uf: dto.uf.toUpperCase(), ativa: dto.ativa ?? true }));
  }

  async update(id: number, dto: UpdateLojaDto): Promise<Loja> {
    const loja = await this.findOne(id);
    const codigo = dto.codigo?.trim().toUpperCase();
    if (codigo && await this.lojas.exists({ where: { codigo } }) && codigo !== loja.codigo) {
      throw new ConflictException('já existe uma loja com este código');
    }
    Object.assign(loja, dto, codigo ? { codigo } : {}, dto.uf ? { uf: dto.uf.toUpperCase() } : {});
    return this.lojas.save(loja);
  }
}
