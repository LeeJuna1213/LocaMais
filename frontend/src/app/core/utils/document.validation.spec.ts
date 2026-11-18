import { describe, expect, it } from 'vitest';

import { normalizeDocument, validateDocument } from './document.validation';

describe('document validation', () => {
  it.each(['529.982.247-25', '52998224725'])('accepts valid CPF %s', (value) => {
    expect(validateDocument('PF', value)).toBeNull();
    expect(normalizeDocument(value)).toBe('52998224725');
  });

  it.each(['529.982.247-24', '111.111.111-11', '1234567890', '529a98224725'])('rejects invalid CPF %s', (value) => {
    expect(validateDocument('PF', value)).toBe('CPF inválido. Confira os 11 dígitos e os dígitos verificadores.');
  });

  it.each(['11.222.333/0001-81', '11222333000181'])('accepts valid CNPJ %s', (value) => {
    expect(validateDocument('PJ', value)).toBeNull();
    expect(normalizeDocument(value)).toBe('11222333000181');
  });

  it.each(['11.222.333/0001-80', '11111111111111', '1122233300018', '11a222333000181'])('rejects invalid CNPJ %s', (value) => {
    expect(validateDocument('PJ', value)).toBe('CNPJ inválido. Confira os 14 dígitos e os dígitos verificadores.');
  });
});
