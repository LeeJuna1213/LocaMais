import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { StatusReserva } from '../enums/reservation-status.enum.js';

/**
 * Dados aceitos em `PATCH /api/reservations/:id`.
 *
 * Todos os campos são opcionais. O Service decide o que pode ser alterado
 * conforme o status atual:
 * - PENDENTE aceita período, cliente, carro e transição para CONFIRMADA;
 * - CONFIRMADA aceita apenas a transição para CONCLUIDA;
 * - CANCELADA/CONCLUIDA não aceitam alterações.
 *
 * `valorTotal` não existe aqui de propósito: ele é sempre recalculado pelo
 * Service quando o período ou o carro mudam. O status CANCELADA também não
 * deve ser usado neste endpoint; existe uma rota própria `/cancel`.
 */
export class UpdateReservationDto {
  @ApiPropertyOptional({
    example: '2026-11-15T09:00:00.000Z',
    description: 'Nova data/hora de retirada.',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'dataRetirada deve estar no formato ISO 8601' },
  )
  dataRetirada?: string;

  @ApiPropertyOptional({
    example: '2026-11-17T09:00:00.000Z',
    description: 'Nova data/hora de devolucao.',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'dataDevolucao deve estar no formato ISO 8601' },
  )
  dataDevolucao?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Novo cliente da reserva (apenas enquanto PENDENTE).',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'client_id deve ser um numero inteiro' })
  @Min(1, { message: 'client_id deve ser maior que zero' })
  client_id?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Novo veiculo da reserva (apenas enquanto PENDENTE).',
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'car_id deve ser um numero inteiro' })
  @Min(1, { message: 'car_id deve ser maior que zero' })
  car_id?: number;

  @ApiPropertyOptional({
    enum: StatusReserva,
    description:
      'Transicao de status permitida: pendente -> confirmada ou confirmada -> concluida.',
  })
  @IsOptional()
  @IsEnum(StatusReserva, { message: 'status invalido' })
  status?: StatusReserva;
}
