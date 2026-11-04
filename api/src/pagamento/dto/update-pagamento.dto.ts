import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Dados aceitos em `PATCH /pagamentos/:id`.
 *
 * Todos os campos são opcionais: apenas os enviados são alterados.
 *
 * `status`, `data`, `locacaoId` e `metodo` não podem ser atualizados de
 * propósito: alterar esses campos após o registro quebraria a integridade
 * do histórico financeiro e do controle de pagamentos da locação.
 */
export class UpdatePagamentoDto {
  @ApiPropertyOptional({
    example: 150.00,
    description: 'Novo valor do pagamento.',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'valor deve ser um número decimal' })
  @Min(0, { message: 'valor não pode ser negativo' })
  valor?: number;
}
