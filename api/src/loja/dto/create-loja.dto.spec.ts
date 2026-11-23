import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateLojaDto } from './create-loja.dto.js';
import { UpdateLojaDto } from './update-loja.dto.js';

const validLoja = { codigo: 'LJ01', nome: 'Loja Centro', telefone: '21999999999', email: 'loja@example.com', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ', cep: '20000000' };

describe('CreateLojaDto UF validation', () => {
  it('aceita somente siglas dos 26 estados e rejeita o Distrito Federal', async () => {
    const validUfs = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
    for (const uf of validUfs) {
      const errors = await validate(plainToInstance(CreateLojaDto, { ...validLoja, uf }));
      expect(errors.some((error) => error.property === 'uf')).toBe(false);
    }
    const invalid = await validate(plainToInstance(CreateLojaDto, { ...validLoja, uf: 'DF' }));
    expect(invalid.some((error) => error.property === 'uf')).toBe(true);
  });

  it('rejeita UF inválida ou não selecionada', async () => {
    for (const uf of ['XX', '', undefined]) {
      const errors = await validate(plainToInstance(CreateLojaDto, { ...validLoja, uf }));
      expect(errors.some((error) => error.property === 'uf')).toBe(true);
    }
  });

  it('aceita ativa=false como booleano no PATCH e rejeita o texto "false"', async () => {
    const booleanStatus = await validate(plainToInstance(UpdateLojaDto, { ativa: false }));
    expect(booleanStatus.some((error) => error.property === 'ativa')).toBe(false);

    const stringStatus = await validate(plainToInstance(UpdateLojaDto, { ativa: 'false' }));
    expect(stringStatus.some((error) => error.property === 'ativa')).toBe(true);
  });
});
