import { ConflictException, BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriaVeiculoService } from './categoria.service.js';

describe('CategoriaVeiculoService', () => {
  let repository: any;
  let service: CategoriaVeiculoService;

  beforeEach(() => {
    repository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn(),
      create: vi.fn((value) => value),
      save: vi.fn(async (value) => ({ id: 9, ...value })),
    };
    service = new CategoriaVeiculoService(repository);
  });

  it('lists categories ordered by persisted name', async () => {
    const categories = [{ id: 2, nome: 'Hatch' }];
    repository.find.mockResolvedValue(categories);
    await expect(service.findAll()).resolves.toBe(categories);
    expect(repository.find).toHaveBeenCalledWith({ order: { nome: 'ASC' } });
  });

  it('normalizes whitespace and case before persisting a new category', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.create('  SUV   Esportivo ')).resolves.toMatchObject({
      id: 9,
      nome: 'SUV Esportivo',
      nome_normalizado: 'suv esportivo',
    });
  });

  it('rejects empty, invalid, or duplicate category names', async () => {
    await expect(service.create('   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('SUV<script>')).rejects.toBeInstanceOf(BadRequestException);
    repository.findOne.mockResolvedValue({ id: 1, nome: 'SUV', nome_normalizado: 'suv' });
    await expect(service.create(' suv ')).rejects.toBeInstanceOf(ConflictException);
  });
});
