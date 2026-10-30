/**
 * Tipos possíveis de vistoria.
 *
 * Os valores são textos em minúsculo para seguir o padrão dos demais enums
 * persistidos no projeto (`StatusLocacao`, `StatusReserva`, `StatusVeiculo`,
 * `UserType`). O TypeORM grava o texto no banco (`simple-enum`), então alterar
 * um valor aqui exige tratamento dos dados já existentes.
 *
 * - RETIRADA: vistoria realizada antes da entrega do veículo ao cliente,
 *   registrando as condições iniciais (danos preexistentes, nível de combustível, etc.).
 * - DEVOLUCAO: vistoria realizada no momento da devolução, registrando o estado
 *   do veículo após a utilização pelo cliente.
 */
export enum TipoVistoria {
  RETIRADA = 'retirada',
  DEVOLUCAO = 'devolucao',
}
