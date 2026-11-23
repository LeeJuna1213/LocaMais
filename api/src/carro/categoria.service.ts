import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CategoriaVeiculo } from './entities/categoria-veiculo.entity.js';

export function normalizeCategoryName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function categoryKey(name: string): string {
  return normalizeCategoryName(name).toLocaleLowerCase('pt-BR');
}

const VALID_NAME = /^[\p{L}\p{N}][\p{L}\p{N}\s.'’/-]*$/u;

@Injectable()
export class CategoriaVeiculoService {
  constructor(
    @InjectRepository(CategoriaVeiculo)
    private readonly repository: Repository<CategoriaVeiculo>,
  ) {}

  findAll(): Promise<CategoriaVeiculo[]> {
    return this.repository.find({ order: { nome: 'ASC' } });
  }

  async findOne(id: number): Promise<CategoriaVeiculo> {
    const category = await this.repository.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`categoria ${id} não encontrada`);
    return category;
  }

  async create(rawName: string): Promise<CategoriaVeiculo> {
    const nome = normalizeCategoryName(rawName ?? '');
    if (!nome || nome.length > 50 || !VALID_NAME.test(nome)) {
      throw new BadRequestException('Informe um nome de categoria válido (até 50 caracteres).');
    }
    const nome_normalizado = categoryKey(nome);
    const existing = await this.repository.findOne({ where: { nome_normalizado } });
    if (existing) throw new ConflictException('esta categoria já está cadastrada');
    try {
      return await this.repository.save(this.repository.create({ nome, nome_normalizado }));
    } catch (error) {
      if (this.isDuplicate(error)) throw new ConflictException('esta categoria já está cadastrada');
      throw error;
    }
  }

  async resolveForVehicle(id?: number, legacyName?: string): Promise<CategoriaVeiculo> {
    if (id !== undefined) {
      const category = await this.findOne(id);
      if (legacyName !== undefined && categoryKey(legacyName) !== category.nome_normalizado) {
        throw new BadRequestException('categoria e categoria_id não correspondem');
      }
      return category;
    }
    const nome = normalizeCategoryName(legacyName ?? '');
    if (!nome || nome.length > 50 || !VALID_NAME.test(nome)) {
      throw new BadRequestException('Informe uma categoria válida.');
    }
    const nome_normalizado = categoryKey(nome);
    const existing = await this.repository.findOne({ where: { nome_normalizado } });
    if (existing) return existing;
    try {
      return await this.repository.save(this.repository.create({ nome, nome_normalizado }));
    } catch (error) {
      if (!this.isDuplicate(error)) throw error;
      const raced = await this.repository.findOne({ where: { nome_normalizado } });
      if (raced) return raced;
      throw new ConflictException('não foi possível resolver a categoria');
    }
  }

  private isDuplicate(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = (error.driverError ?? {}) as { code?: string; errno?: number; message?: string };
    return driverError.code === 'ER_DUP_ENTRY'
      || driverError.code === 'SQLITE_CONSTRAINT_UNIQUE'
      || driverError.errno === 1062
      || /unique constraint failed/i.test(driverError.message ?? '');
  }
}
