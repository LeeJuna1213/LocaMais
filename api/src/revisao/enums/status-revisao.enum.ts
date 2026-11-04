/**
 * Situações possíveis do controle de revisão periódica de um veículo.
 *
 * Este enum NÃO é persistido no banco de dados: ele é calculado pelo
 * `RevisaoService` com base na quilometragem atual do carro e na quilometragem
 * da última revisão registrada. Por isso não usa `@Column` nem `simple-enum`.
 *
 * - SEM_HISTORICO: o veículo ainda não possui nenhuma revisão registrada.
 *   É necessário realizar uma avaliação inicial para estabelecer a referência
 *   de manutenção.
 * - EM_DIA: o veículo ainda não atingiu o intervalo previsto para a próxima
 *   revisão.
 * - PROXIMA: o veículo está próximo de atingir o limite (dentro da margem
 *   configurada).
 * - PENDENTE: o veículo atingiu ou ultrapassou a quilometragem prevista e
 *   precisa de revisão.
 */
export enum StatusRevisao {
  SEM_HISTORICO = 'sem_historico',
  EM_DIA = 'em_dia',
  PROXIMA = 'proxima',
  PENDENTE = 'pendente',
}
