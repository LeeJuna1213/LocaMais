import { IsNumber, IsOptional, IsString, IsDateString, MaxLength, Min, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Dados aceitos em `PATCH /api/revisoes/:id`.
 *
 * Todos os campos são opcionais: apenas os enviados são alterados.
 *
 * `km` e `carroId` não podem ser atualizados de propósito: alterar a
 * quilometragem de uma revisão já registrada quebraria a consistência do
 * histórico e do controle de revisão periódica. Para corrigir a quilometragem,
 * registre uma nova revisão com o valor correto.
 */
export class UpdateRevisaoDto {
  @ApiPropertyOptional({
    example: 'Troca de óleo, filtros e pastilhas de freio',
    description: 'Nova descrição dos serviços realizados.',
  })
  @IsOptional()
  @IsString({ message: 'descricao deve ser uma string' })
  @IsNotEmpty({ message: 'descricao não pode ser vazia' })
  @MaxLength(1000, { message: 'descricao não pode ter mais de 1000 caracteres' })
  descricao?: string;

  @ApiPropertyOptional({
    example: 320.50,
    description: 'Novo custo da revisão.',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'valor deve ser um número decimal' })
  @Min(0, { message: 'valor não pode ser negativo' })
  valor?: number;

  @ApiPropertyOptional({
    example: '2026-11-10T10:00:00.000Z',
    description: 'Nova data da revisão.',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'data deve estar no formato ISO 8601' },
  )
  data?: string;
}
