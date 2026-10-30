/**
 * Estados possíveis de uma locação.
 *
 * Os valores são textos em minúsculo para seguir o padrão dos demais enums
 * persistidos no projeto (`StatusReserva`, `StatusVeiculo`, `UserType`).
 * O TypeORM grava o texto no banco (`simple-enum`), então alterar um valor
 * aqui exige tratamento dos dados já existentes.
 *
 * Ciclo de vida da locação:
 * - AGUARDANDO_RETIRADA: locação criada a partir de uma reserva confirmada,
 *   aguardando a retirada efetiva do veículo.
 * - EM_ANDAMENTO: veículo retirado, locação vigente.
 * - CONCLUIDA: veículo devolvido, locação encerrada.
 * - CANCELADA: locação cancelada antes da retirada (não houve uso do veículo).
 *
 * Esse ciclo é intencionalmente separado do ciclo da reserva:
 * a reserva é a "reserva/agendamento", a locação é o "aluguel efetivado".
 */
export enum StatusLocacao {
  AGUARDANDO_RETIRADA = 'aguardando_retirada',
  EM_ANDAMENTO = 'em_andamento',
  CONCLUIDA = 'concluida',
  CANCELADA = 'cancelada',
}
