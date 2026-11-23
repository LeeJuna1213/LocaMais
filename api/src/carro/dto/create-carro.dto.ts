import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsIn,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { StatusVeiculo } from '../enums/status-veiculo.enum.js';

/**
 * Dados aceitos em `POST /api/carros`.
 *
 * O `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) rejeita
 * propriedades que não tenham decorator, então tudo que o cliente pode enviar
 * precisa estar declarado aqui.
 */
export class CreateCarroDto {
  @IsString()
  @IsNotEmpty({ message: 'A placa e obrigatoria' })
  @MaxLength(20, { message: 'A placa nao pode ter mais de 20 caracteres' })
  placa: string;

  @IsString()
  @IsNotEmpty({ message: 'O modelo e obrigatorio' })
  modelo: string;

  @IsString()
  @IsNotEmpty({ message: 'A marca e obrigatoria' })
  marca: string;

  /** ID da categoria persistida; campo oficial usado pela nova interface. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'categoria_id deve ser um número inteiro' })
  @Min(1)
  categoria_id?: number;

  /** Compatibilidade retroativa; veículos novos resolvem/normalizam o nome no banco. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'A categoria é obrigatória' })
  @MaxLength(50)
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

  @IsInt()
  @Min(1900, { message: 'Ano invalido: deve ser no minimo 1900' })
  @Max(new Date().getFullYear() + 1, {
    message: `Ano invalido: deve ser no maximo ${new Date().getFullYear() + 1}`,
  })
  ano: number;

  // O status é opcional: sem ele, o Service grava DISPONIVEL.
  @IsOptional()
  @IsEnum(StatusVeiculo, { message: 'Status invalido' })
  status?: StatusVeiculo;

  @IsNumber()
  @IsPositive({ message: 'O valor da diaria deve ser positivo' })
  valorDiaria: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'proximaVistoriaKm deve ser um número inteiro' })
  @Min(0, { message: 'proximaVistoriaKm não pode ser negativa' })
  proximaVistoriaKm?: number | null;

  // `foto` é administrada exclusivamente pelos endpoints específicos.
}
