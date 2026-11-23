import { describe, expect, it } from 'vitest';
import { isValidCnpj, isValidCpf } from './document.utility.js';

describe('CPF/CNPJ document validators', () => {
  it.each(['529.982.247-25', '52998224725'])('accepts valid CPF %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });
  it.each(['529.982.247-24', '111.111.111-11', '1234567890', 'CPF 52998224725', '529..982.247-25'])('rejects invalid CPF %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });
  it.each(['11.222.333/0001-81', '11222333000181'])('accepts valid CNPJ %s', (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(true);
  });
  it.each(['11.222.333/0001-80', '11111111111111', '1122233300018', 'CNPJ 11222333000181', '11.222.333//0001-81'])('rejects invalid CNPJ %s', (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(false);
  });
});
