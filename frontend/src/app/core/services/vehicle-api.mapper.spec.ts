import { describe, expect, it } from 'vitest';

import { CarroApi, mapCarroApi } from './vehicle-api.mapper';

describe('mapCarroApi', () => {
  it('adapta os campos wire para o modelo visual sem inventar dados de API', () => {
    const result = mapCarroApi({
      id: 17,
      placa: 'ABC1D23',
      modelo: 'HB20',
      marca: 'Hyundai',
      categoria: 'Hatch',
      ano: 2024,
      status: 'disponivel',
      valorDiaria: '125.50',
      quilometragem: 12000,
      foto: null,
      created_at: '2026-11-17T10:00:00.000Z',
      updated_at: '2026-11-17T10:00:00.000Z',
    } satisfies CarroApi);

    expect(result).toMatchObject({
      id: 17,
      name: 'Hyundai HB20 2024',
      pricePerDay: 125.5,
      status: 'Disponível',
      category: 'Hatch',
      plate: 'ABC1D23',
      mileage: 12000,
      photo: null,
      transmission: null,
      favorite: false,
      revisions: [],
    });
  });

  it.each([
    ['alugado', 'Alugado'],
    ['em manutenção', 'Em manutenção'],
  ] as const)('mapeia status wire %s para %s', (status, expected) => {
    expect(mapCarroApi({
      id: 2,
      placa: 'XYZ1234',
      modelo: 'Onix',
      marca: 'Chevrolet',
      categoria: 'Economico',
      ano: 2023,
      status,
      valorDiaria: 100,
      quilometragem: 0,
      foto: '/uploads/carros/teste.jpg',
      created_at: '',
      updated_at: '',
    }).status).toBe(expected);
  });

  it('rejeita status desconhecido em vez de mostrar disponibilidade falsa', () => {
    expect(() => mapCarroApi({
      id: 2,
      placa: 'XYZ1234',
      modelo: 'Onix',
      marca: 'Chevrolet',
      categoria: 'Economico',
      ano: 2023,
      status: 'baixado',
      valorDiaria: 100,
      quilometragem: 0,
      foto: null,
      created_at: '',
      updated_at: '',
    } as unknown as CarroApi)).toThrow('Status de veículo não suportado pela interface');
  });
});
