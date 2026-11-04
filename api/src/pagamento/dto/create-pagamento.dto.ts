import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { MetodoPagamento } from '../enums/metodo-pagamento.enum.js';

/**
 * Dados aceitos em `POST /api/pagamentos`.
 *
 * O `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) rejeita
 * propriedades que não tenham decorator, então tudo que o cliente pode enviar
 * precisa estar declarado aqui.
 *
 * O `id`, `status`, `data` e o resultado da transação NÃO fazem parte deste
 * DTO: são gerenciados exclusivamente pelo backend.
 */
export class CreatePagamentoDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'UUID da locação à qual este pagamento está vinculado.',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'locacaoId deve ser um UUID válido' })
  locacaoId: string;

  @ApiProperty({
    enum: MetodoPagamento,
    example: MetodoPagamento.PIX,
    description: 'Forma de pagamento selecionada.',
  })
  @IsEnum(MetodoPagamento, { message: 'metodo de pagamento invalido' })
  metodo: MetodoPagamento;

  @ApiProperty({
    example: 150.00,
    description: 'Valor do pagamento.',
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'valor deve ser um número decimal' })
  @Min(0, { message: 'valor não pode ser negativo' })
  valor: number;
}
