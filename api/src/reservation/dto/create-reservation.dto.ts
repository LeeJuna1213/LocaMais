import { Type } from 'class-transformer';
import { IsISO8601, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Dados aceitos em `POST /api/reservations`.
 *
 * O cliente da API informa apenas o período e os identificadores. `status` e
 * `valorTotal` NÃO fazem parte deste DTO: o Service define o status inicial e
 * calcula o valor com base no preço real do carro. O `ValidationPipe` global
 * usa `whitelist` + `forbidNonWhitelisted`, então enviar esses campos retorna
 * 400 em vez de serem ignorados silenciosamente.
 */
export class CreateReservationDto {
  @ApiProperty({
    example: '2026-11-10T10:00:00.000Z',
    description: 'Data e hora previstas para a retirada do veiculo.',
    format: 'date-time',
  })
  @IsISO8601(
    { strict: true },
    { message: 'dataRetirada deve estar no formato ISO 8601' },
  )
  dataRetirada: string;

  @ApiProperty({
    example: '2026-11-12T10:00:00.000Z',
    description:
      'Data e hora previstas para a devolucao. Deve ser posterior à retirada.',
    format: 'date-time',
  })
  @IsISO8601(
    { strict: true },
    { message: 'dataDevolucao deve estar no formato ISO 8601' },
  )
  dataDevolucao: string;

  @ApiProperty({
    example: 1,
    description: 'ID do cliente que está fazendo a reserva.',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'client_id deve ser um numero inteiro' })
  @Min(1, { message: 'client_id deve ser maior que zero' })
  client_id: number;

  @ApiProperty({
    example: 1,
    description: 'ID do veiculo que será reservado.',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'car_id deve ser um numero inteiro' })
  @Min(1, { message: 'car_id deve ser maior que zero' })
  car_id: number;
}
