/**
 * Estados possíveis de uma reserva.
 *
 * Os valores são textos em minúsculo para seguir o padrão dos demais enums
 * persistidos no projeto (`UserType`, `TipoPessoa`, `StatusVeiculo`). O
 * TypeORM grava o texto no banco (`simple-enum`), então alterar um valor aqui
 * exige migração/tratamento dos dados já existentes.
 *
 * O ciclo de vida é intencionalmente separado do ciclo de uma locação:
 * - PENDENTE: reserva criada, aguardando confirmação.
 * - CONFIRMADA: reserva validada e confirmada.
 * - CANCELADA: reserva cancelada; não bloqueia mais o veículo.
 * - CONCLUIDA: reserva encerrada após a locação/devolução.
 *
 * Situações como "em andamento" pertencem a uma futura entidade de Locação,
 * não à reserva.
 */
export enum StatusReserva {
  PENDENTE = 'pendente',
  CONFIRMADA = 'confirmada',
  CANCELADA = 'cancelada',
  CONCLUIDA = 'concluida',
}
