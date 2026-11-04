import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Dados aceitos em `POST /api/revisoes`.
 *
 * O `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) rejeita
 * propriedades que não tenham decorator, então tudo que o cliente pode enviar
 * precisa estar declarado aqui. O ID da revisão, as datas de criação e
 * atualização NÃO fazem parte deste DTO: são gerenciados pelo backend.
 */
export class CreateRevisaoDto {
  @ApiProperty({
    example: '2026-11-10T10:00:00.000Z',
    description: 'Data em que a revisão foi realizada.',
    format: 'date-time',
  })
  @IsDateString(
    { strict: true },
    { message: 'data deve estar no formato ISO 8601' },
  )
  data: string;

  @ApiProperty({
    example: 'Troca de óleo e filtros',
    description: 'Descrição dos serviços realizados ou da manutenção necessária.',
  })
  @IsString()
  @IsNotEmpty({ message: 'descricao é obrigatória' })
  @MaxLength(1000, { message: 'descricao não pode ter mais de 1000 caracteres' })
  descricao: string;

  @ApiProperty({
    example: 15000,
    description: 'Quilometragem do veículo no momento da revisão.',
    minimum: 0,
  })
  @IsInt({ message: 'km deve ser um número inteiro' })
  @Min(0, { message: 'km não pode ser negativo' })
  km: number;

  @ApiProperty({
    example: 250.00,
    description: 'Custo da revisão.',
    minimum: 0,
  })
  @IsNumber({}, { message: 'valor deve ser um número decimal' })
  @Min(0, { message: 'valor não pode ser negativo' })
  valor: number;

  @ApiProperty({
    example: 1,
    description: 'ID do veículo ao qual esta revisão está associada.',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'carroId deve ser um número inteiro' })
  @Min(1, { message: 'carroId deve ser maior que zero' })
  carroId: number;
}
