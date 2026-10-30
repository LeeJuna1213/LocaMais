import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { StatusLocacao } from '../enums/status-locacao.enum.js';

/**
 * Dados aceitos em `PATCH /api/locacoes/:id`.
 *
 * Todos os campos são opcionais. O Service decide o que pode ser alterado
 * conforme o status atual da locação:
 * - AGUARDANDO_RETIRADA pode ser cancelada (transição para CANCELADA);
 * - EM_ANDAMENTO/CONCLUIDA/CANCELADA não aceitam alteração de status.
 *
 * `valorTotal`, `dataRetirada` e `dataDevolucao` não existem aqui de propósito:
 * são geridos exclusivamente pelo backend (registro de retirada/devolução e
 * cálculo de adicionais).
 */
export class UpdateLocacaoDto {
  @ApiPropertyOptional({
    enum: StatusLocacao,
    example: StatusLocacao.CANCELADA,
    description:
      'Transição de status permitida: aguardando_retirada -> cancelada.',
  })
  @IsOptional()
  @IsEnum(StatusLocacao, { message: 'status invalido' })
  status?: StatusLocacao;
}
