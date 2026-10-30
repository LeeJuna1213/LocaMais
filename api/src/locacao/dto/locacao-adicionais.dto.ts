import { ApiProperty } from '@nestjs/swagger';

/**
 * Resposta de `GET /api/locacoes/:id/adicionais`.
 *
 * Representa o cálculo dos valores adicionais (atraso) de uma locação. É um
 * relatório de leitura: não persiste nada, portanto consultá-lo várias vezes
 * não gera cobrança duplicada. A aplicação do adicional ao `valorTotal` ocorre
 * apenas uma vez, no registro da devolução.
 */
export class LocacaoAdicionaisDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Identificador da locação.',
    format: 'uuid',
  })
  locacaoId: string;

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Identificador da reserva de origem.',
    format: 'uuid',
  })
  reservationId: string;

  @ApiProperty({
    example: 100.5,
    description: 'Valor da diária cadastrada no veículo (fonte: banco de dados).',
  })
  valorDiaria: number;

  @ApiProperty({
    example: '2026-11-12T10:00:00.000Z',
    description: 'Data e hora previstas para a devolução (reserva).',
    format: 'date-time',
  })
  dataDevolucaoPrevista: string;

  @ApiProperty({
    example: '2026-11-13T12:00:00.000Z',
    description: 'Data e hora efetivas da devolução (null se ainda não devolvida).',
    format: 'date-time',
    nullable: true,
  })
  dataDevolucaoEfetiva: string | null;

  @ApiProperty({
    example: 2,
    description: 'Quantidade de dias (ou frações) de atraso.',
    minimum: 0,
  })
  diasAtraso: number;

  @ApiProperty({
    example: 201.0,
    description: 'Valor adicional decorrente do atraso (dias × valor da diária).',
    minimum: 0,
  })
  valorAdicional: number;
}
