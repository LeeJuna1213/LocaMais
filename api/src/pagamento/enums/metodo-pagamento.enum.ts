/**
 * Formas de pagamento disponíveis na demonstração do sistema LocaMais.
 *
 * Esses valores são usados tanto no backend quanto documentados no Swagger,
 * garantindo consistência entre frontend, backend e documentação.
 *
 * - PIX: pagamento via transferência instantânea (simulado).
 * - CARTAO_CREDITO: pagamento com cartão de crédito (simulado).
 * - CARTAO_DEBITO: pagamento com cartão de débito (simulado).
 * - DINHEIRO: pagamento em espécie (simulado).
 */
export enum MetodoPagamento {
  PIX = 'pix',
  CARTAO_CREDITO = 'cartao_credito',
  CARTAO_DEBITO = 'cartao_debito',
  DINHEIRO = 'dinheiro',
}
