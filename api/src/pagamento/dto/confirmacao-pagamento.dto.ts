import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Dados aceitos em `PATCH /pagamentos/:id/confirmar`.
 *
 * Este DTO é intencionalmente vazio de campos obrigatórios: a confirmação
 * do pagamento é uma operação acionada pelo backend, que chama o gateway
 * simulado e define o status (`APROVADO` ou `RECUSADO`). O frontend não
 * envia dados de aprovação nem define o status diretamente.
 *
 * Um valor opcional pode ser informado para confirmar um pagamento parcial
 * diferente do valor originalmente registrado, desde que respeite o saldo
 * restante da locação.
 */
export class ConfirmacaoPagamentoDto {
  @ApiPropertyOptional({
    example: 150.00,
    description:
      'Valor a ser confirmado (opcional). Se não informado, usa o valor registrado no pagamento.',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'valor deve ser um número decimal' })
  @Min(0, { message: 'valor não pode ser negativo' })
  valor?: number;
}
