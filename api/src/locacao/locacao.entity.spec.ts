import { Locacao } from './entities/locacao.entity.js';
import { StatusLocacao } from './enums/status-locacao.enum.js';

/**
 * Teste unitário do cálculo de adicionais da entidade `Locacao`.
 *
 * `calcularAdicionais` é um cálculo puro: não persiste nada, então invocá-lo
 * mais de uma vez não gera cobrança duplicada. A aplicação do adicional ao
 * `valorTotal` ocorre apenas uma vez, no registro da devolução.
 */
describe('Locacao.calcularAdicionais (unit)', () => {
  const dataDevolucaoPrevista = new Date('2026-11-12T10:00:00.000Z');

  it('devolução na data prevista: adicional zero', () => {
    const locacao = Object.assign(new Locacao(), {
      dataDevolucao: new Date(dataDevolucaoPrevista),
    });

    const { valorAdicional, diasAtraso } = locacao.calcularAdicionais(
      dataDevolucaoPrevista,
      100,
    );

    expect(diasAtraso).toBe(0);
    expect(valorAdicional).toBe(0);
  });

  it('devolução antecipada: adicional zero', () => {
    const locacao = Object.assign(new Locacao(), {
      dataDevolucao: new Date(dataDevolucaoPrevista.getTime() - 60 * 60 * 1000), // 1h antes
    });

    const { valorAdicional, diasAtraso } = locacao.calcularAdicionais(
      dataDevolucaoPrevista,
      100,
    );

    expect(diasAtraso).toBe(0);
    expect(valorAdicional).toBe(0);
  });

  it('atraso de 25 horas: 2 dias (fração conta como dia inteiro) x diária', () => {
    const locacao = Object.assign(new Locacao(), {
      dataDevolucao: new Date(dataDevolucaoPrevista.getTime() + 25 * 60 * 60 * 1000),
    });

    const { valorAdicional, diasAtraso } = locacao.calcularAdicionais(
      dataDevolucaoPrevista,
      100,
    );

    expect(diasAtraso).toBe(2);
    expect(valorAdicional).toBe(200);
  });

  it('atraso de exatamente 24 horas: 1 dia x diária', () => {
    const locacao = Object.assign(new Locacao(), {
      dataDevolucao: new Date(dataDevolucaoPrevista.getTime() + 24 * 60 * 60 * 1000),
    });

    const { valorAdicional, diasAtraso } = locacao.calcularAdicionais(
      dataDevolucaoPrevista,
      100,
    );

    expect(diasAtraso).toBe(1);
    expect(valorAdicional).toBe(100);
  });

  it('sem devolução efetiva usa o momento atual como referência', () => {
    const locacao = Object.assign(new Locacao(), { dataDevolucao: null });

    const resultado = locacao.calcularAdicionais(
      new Date('2020-01-01T00:00:00.000Z'),
      100,
    );

    expect(resultado.diasAtraso).toBeGreaterThan(0);
    expect(resultado.valorAdicional).toBeGreaterThan(0);
  });

  it('não altera o status nem a entidade (cálculo puro)', () => {
    const locacao = Object.assign(new Locacao(), {
      status: StatusLocacao.EM_ANDAMENTO,
      dataDevolucao: new Date(dataDevolucaoPrevista.getTime() + 10 * 60 * 60 * 1000),
    });

    locacao.calcularAdicionais(dataDevolucaoPrevista, 100);

    expect(locacao.status).toBe(StatusLocacao.EM_ANDAMENTO);
    expect(locacao.dataDevolucao).not.toBeNull();
  });
});
