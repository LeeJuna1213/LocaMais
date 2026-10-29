import { Car } from '../car/entities/car.entity.js';
import { Reservation } from './entities/reservation.entity.js';

/**
 * Testes unitários da regra de cálculo da reserva.
 *
 * Não sobem banco nem Nest: exercitam apenas a regra de diárias e o
 * arredondamento monetário da entidade. A integração HTTP fica no e2e.
 */
describe('Reservation.calcularValor', () => {
  function criarReserva(
    valorDiaria: number,
    dataRetirada: Date,
    dataDevolucao: Date,
  ): Reservation {
    const car = new Car();
    car.valorDiaria = valorDiaria;

    const reserva = new Reservation();
    reserva.car = car;
    reserva.dataRetirada = dataRetirada;
    reserva.dataDevolucao = dataDevolucao;

    return reserva;
  }

  it('cobra uma diaria para um periodo de poucas horas no mesmo dia', () => {
    const reserva = criarReserva(
      100.5,
      new Date('2026-11-10T10:00:00.000Z'),
      new Date('2026-11-10T12:00:00.000Z'),
    );

    expect(reserva.calcularValor()).toBe(100.5);
  });

  it('cobra exatamente uma diaria para 24 horas', () => {
    const reserva = criarReserva(
      100.5,
      new Date('2026-11-10T10:00:00.000Z'),
      new Date('2026-11-11T10:00:00.000Z'),
    );

    expect(reserva.calcularValor()).toBe(100.5);
  });

  it('arredonda qualquer fracao de 24 horas para cima', () => {
    const reserva = criarReserva(
      100.5,
      new Date('2026-11-10T10:00:00.000Z'),
      new Date('2026-11-11T10:00:00.001Z'),
    );

    expect(reserva.calcularValor()).toBe(201);
  });

  it('multiplica as diarias pelo valor real da diaria do carro', () => {
    const reserva = criarReserva(
      100.5,
      new Date('2026-11-10T10:00:00.000Z'),
      new Date('2026-11-12T12:00:00.000Z'),
    );

    // 50 horas => 3 diárias => 3 * 100,50 = 301,50
    expect(reserva.calcularValor()).toBe(301.5);
  });

  it('rejeita carro sem valor de diaria valido', () => {
    const reserva = criarReserva(
      0,
      new Date('2026-11-10T10:00:00.000Z'),
      new Date('2026-11-11T10:00:00.000Z'),
    );

    expect(() => reserva.calcularValor()).toThrow(
      'valor da diaria do veiculo invalido',
    );
  });

  it('rejeita calculo sem o carro carregado', () => {
    const reserva = new Reservation();
    reserva.dataRetirada = new Date('2026-11-10T10:00:00.000Z');
    reserva.dataDevolucao = new Date('2026-11-11T10:00:00.000Z');

    expect(() => reserva.calcularValor()).toThrow(
      'carro nao carregado: calcularValor exige a relacao car preenchida',
    );
  });
});
