import { Type } from 'class-transformer';
import { IsISO8601, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Parâmetros de `GET /api/reservations/availability`.
 *
 * Como query strings chegam sempre como texto, `@Type(() => Number)` converte
 * `car_id` antes da validação. As datas precisam ser ISO 8601 para evitar
 * interpretações ambíguas de fuso horário.
 */
export class CheckAvailabilityDto {
  @ApiProperty({
    example: 1,
    description: 'ID do veiculo a consultar.',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'car_id deve ser um numero inteiro' })
  @Min(1, { message: 'car_id deve ser maior que zero' })
  car_id: number;

  @ApiProperty({
    example: '2026-11-10T10:00:00.000Z',
    description: 'Inicio do periodo desejado.',
    format: 'date-time',
  })
  @IsISO8601(
    { strict: true },
    { message: 'dataRetirada deve estar no formato ISO 8601' },
  )
  dataRetirada: string;

  @ApiProperty({
    example: '2026-11-12T10:00:00.000Z',
    description: 'Fim do periodo desejado.',
    format: 'date-time',
  })
  @IsISO8601(
    { strict: true },
    { message: 'dataDevolucao deve estar no formato ISO 8601' },
  )
  dataDevolucao: string;
}
