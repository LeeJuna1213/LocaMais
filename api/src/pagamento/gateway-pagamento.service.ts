import { Injectable, Logger } from '@nestjs/common';

/**
 * Gateway de pagamento simulado.
 *
 * Este componente é responsável por simular o processamento e a validação
 * das transações de pagamento. Como o LocaMais utiliza pagamentos simulados
 * para fins acadêmicos e demonstrativos, não há integração com serviços
 * financeiros externos.
 *
 * O gateway simulado tem responsabilidade separada do `Pagamento`, evitando
 * colocar toda a lógica de processamento dentro da entidade.
 *
 * Para a demonstração inicial, utiliza uma regra simples e determinística
 * que permite simular a aprovação com base no valor do pagamento:
 * - Pagamentos com valor maior que zero são aprovados.
 * - Pagamentos com valor zero ou negativo são recusados (embora o service
 *   já impeça valores negativos ou zero antes de chegar aqui).
 *
 * Não armazena senhas, tokens bancários ou credenciais financeiras reais.
 */
@Injectable()
export class GatewayPagamentoService {
  private readonly logger = new Logger(GatewayPagamentoService.name);

  /**
   * Processa uma transação simulada.
   *
   * Valida os dados básicos da operação e retorna um resultado de aprovação
   * ou recusa.
   *
   * @param valor Valor da transação.
   * @param metodo Forma de pagamento selecionada.
   * @returns Objeto com `aprovado` (booleano) e `mensagem` (string).
   */
  processarTransacao(valor: number, metodo: string): {
    aprovado: boolean;
    mensagem: string;
  } {
    this.logger.log(
      `processando transacao simulada: metodo=${metodo}, valor=${valor}`,
    );

    // Regra determinística para a demonstração:
    // valor > 0 => aprovado; valor <= 0 => recusado.
    if (valor > 0) {
      return { aprovado: true, mensagem: 'transacao aprovada (simulado)' };
    }

    return { aprovado: false, mensagem: 'transacao recusada (simulado)' };
  }

  /**
   * Valida os dados básicos de um pagamento antes do processamento.
   *
   * @param valor Valor do pagamento.
   * @param metodo Forma de pagamento.
   * @returns `true` se os dados são válidos para processamento.
   */
  validarPagamento(valor: number, metodo: string): boolean {
    if (!valor || valor <= 0) {
      return false;
    }

    const metodosValidos = [
      'pix',
      'cartao_credito',
      'cartao_debito',
      'dinheiro',
    ];

    return metodosValidos.includes(metodo);
  }
}
