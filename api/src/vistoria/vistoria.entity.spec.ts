import { Vistoria } from './entities/vistoria.entity.js';
import { TipoVistoria } from './enums/tipo-vistoria.enum.js';

/**
 * Teste unitário da entidade `Vistoria`.
 *
 * Valida o metodo `registrarVistoria`, os valores do enum `TipoVistoria` e o
 * formato serializado do atributo `fotos`.
 */
describe('Vistoria (unit)', () => {
  const agora = new Date();

  it('registrarVistoria define a data como o momento atual', () => {
    const vistoria = Object.assign(new Vistoria(), {
      tipo: TipoVistoria.RETIRADA,
      data: new Date('2020-01-01T00:00:00.000Z'),
      observacoes: '',
      fotos: '[]',
    });

    vistoria.registrarVistoria();

    expect(vistoria.data.getTime()).toBeCloseTo(Date.now(), -2);
    expect(vistoria.data.getTime()).toBeGreaterThan(
      new Date('2020-01-01T00:00:00.000Z').getTime(),
    );
  });

  it('enum TipoVistoria possui os valores esperados', () => {
    expect(TipoVistoria.RETIRADA).toBe('retirada');
    expect(TipoVistoria.DEVOLUCAO).toBe('devolucao');
    expect(Object.values(TipoVistoria)).toEqual(['retirada', 'devolucao']);
  });

  it('fotos aceita um array vazio serializado', () => {
    const vistoria = Object.assign(new Vistoria(), {
      tipo: TipoVistoria.DEVOLUCAO,
      data: agora,
      observacoes: null,
      fotos: '[]',
    });

    const fotos = JSON.parse(vistoria.fotos);
    expect(Array.isArray(fotos)).toBe(true);
    expect(fotos).toHaveLength(0);
  });

  it('fotos armazena uma lista de URLs serializada em JSON', () => {
    const urls = [
      'https://exemplo.com/foto1.jpg',
      'https://exemplo.com/foto2.jpg',
    ];
    const vistoria = Object.assign(new Vistoria(), {
      tipo: TipoVistoria.RETIRADA,
      data: agora,
      observacoes: 'Dano no para-choque.',
      fotos: JSON.stringify(urls),
    });

    expect(JSON.parse(vistoria.fotos)).toEqual(urls);
    expect(vistoria.observacoes).toBe('Dano no para-choque.');
  });
});
