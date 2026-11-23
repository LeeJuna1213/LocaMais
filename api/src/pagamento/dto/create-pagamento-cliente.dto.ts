import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { MetodoPagamento } from '../enums/metodo-pagamento.enum.js';

/**
 * Dados aceitos em `POST /api/pagamentos/meus` (pagamento pelo cliente).
 *
 * O cliente informa a reserva confirmada e a forma de pagamento. O `valor` é
 * opcional: quando omitido, usa o saldo restante da locação.
 *
 * O `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) rejeita
 * propriedades que não tenham decorator.
 */
export class CreatePagamentoClienteDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'UUID da reserva confirmada que originará a locação.',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'reservation_id deve ser um UUID válido' })
  reservation_id: string;

  @ApiProperty({
    enum: MetodoPagamento,
    example: MetodoPagamento.PIX,
    description: 'Forma de pagamento selecionada.',
  })
  @IsEnum(MetodoPagamento, { message: 'método de pagamento inválido' })
  metodo: MetodoPagamento;

  @ApiPropertyOptional({
    example: 150.00,
    description:
      'Valor do pagamento. Se omitido, usa o saldo restante da locação.',
    minimum: 0,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({}, { message: 'valor deve ser um número decimal' })
  @Min(0, { message: 'valor não pode ser negativo' })
  valor?: number;
}
