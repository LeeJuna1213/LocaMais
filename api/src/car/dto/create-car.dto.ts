import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { StatusVeiculo } from '../enums/status-veiculo.enum.js';

/**
 * Dados aceitos em `POST /api/cars`.
 *
 * O `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`) rejeita
 * propriedades que não tenham decorator, então tudo que o cliente pode enviar
 * precisa estar declarado aqui.
 */
export class CreateCarDto {
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

  @IsString()
  @IsNotEmpty({ message: 'A categoria e obrigatoria' })
  categoria: string;

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
}
