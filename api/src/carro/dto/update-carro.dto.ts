import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsIn,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { StatusVeiculo } from '../enums/status-veiculo.enum.js';

/**
 * Dados aceitos em `PATCH /api/carros/:id`.
 *
 * Todos os campos são opcionais: apenas os enviados são alterados. Quando um
 * campo é enviado, as mesmas regras do Create continuam valendo.
 */
export class UpdateCarroDto {
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'A placa nao pode ter mais de 20 caracteres' })
  placa?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsIn(['Automático', 'Manual'], { message: 'Câmbio inválido' })
  cambio?: 'Automático' | 'Manual';

  @IsOptional()
  @IsInt({ message: 'Lugares deve ser um número inteiro' })
  @Min(1, { message: 'Lugares deve ser pelo menos 1' })
  @Max(9, { message: 'Lugares não pode ser maior que 9' })
  lugares?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Descrição não pode exceder 1000 caracteres' })
  descricao?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1900, { message: 'Ano invalido: deve ser no minimo 1900' })
  @Max(new Date().getFullYear() + 1, {
    message: `Ano invalido: deve ser no maximo ${new Date().getFullYear() + 1}`,
  })
  ano?: number;

  @IsOptional()
  @IsEnum(StatusVeiculo, { message: 'Status invalido' })
  status?: StatusVeiculo;

  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'O valor da diaria deve ser positivo' })
  valorDiaria?: number;
}
