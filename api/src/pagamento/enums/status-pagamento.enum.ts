/**
 * Situações possíveis de um pagamento no sistema LocaMais.
 *
 * Este enum é persistido no banco de dados (`simple-enum`).
 *
 * Ciclo de vida:
 * - PENDENTE: pagamento registrado, aguardando confirmação.
 * - APROVADO: pagamento confirmado após processamento simulado pelo gateway.
 * - RECUSADO: pagamento recusado pelo gateway simulado.
 * - CANCELADO: pagamento cancelado antes da confirmação.
 *
 * O pagamento inicia com status `PENDENTE` e passa para `APROVADO` somente
 * após a confirmação da operação simulada. O frontend NÃO pode definir
 * diretamente o status do pagamento.
 */
export enum StatusPagamento {
  PENDENTE = 'pendente',
  APROVADO = 'aprovado',
  RECUSADO = 'recusado',
  CANCELADO = 'cancelado',
}
