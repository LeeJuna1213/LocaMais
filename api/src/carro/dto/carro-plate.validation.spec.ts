import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateCarroDto } from './create-carro.dto.js';
import { UpdateCarroDto } from './update-carro.dto.js';

const plateCases = [
  ['ABC-1234', true],
  ['ABC1234', true],
  ['ABC1D23', true],
  ['abc-1234', true],
  ['ABC12D3', false],
  ['AB12345', false],
  ['ABC-12345', false],
  ['ABC@1234', false],
] as const;

describe('validação de placas de veículos', () => {
  it.each(plateCases)('valida %s como placa de criação (%s)', async (plate, isValid) => {
    const dto = plainToInstance(CreateCarroDto, {
      placa: plate,
      marca: 'Marca',
      modelo: 'Modelo',
      categoria: 'Sedan',
      ano: 2025,
      valorDiaria: 100,
    });

    const errors = await validate(dto);
    expect(errors.some(({ property }) => property === 'placa')).toBe(!isValid);
    if (isValid) expect(dto.placa).toBe(plate.toUpperCase());
  });

  it.each(plateCases)('valida %s como placa de edição (%s)', async (plate, isValid) => {
    const dto = plainToInstance(UpdateCarroDto, { placa: plate });
    const errors = await validate(dto);

    expect(errors.some(({ property }) => property === 'placa')).toBe(!isValid);
    if (isValid) expect(dto.placa).toBe(plate.toUpperCase());
  });
});
